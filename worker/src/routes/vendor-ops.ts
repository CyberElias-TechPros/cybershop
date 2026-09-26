import { Hono } from 'hono';
import type { Env } from '../config';
import { requireVendor } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, validationError } from '../lib/errors';
import { optStr, reqInt, reqStr } from '../lib/validate';
import { nowIso, randomToken, slugify, assertSlugAvailable, parseMoneySafe } from '../lib/util';
import { STAFF_ROLES, type StaffRole } from '../lib/access';
import { effectiveQuotas, assertListingQuota, assertBusinessWritable } from '../lib/quotas';
import { assertAddon } from '../lib/premium';
import { csvObjects } from '../lib/csv';
import { normalizeDomain, domainTxtHasToken, attachVercelDomain } from '../lib/domain';
import { mailConfigured, sendEmail, mailHtml } from '../lib/mail';

const app = new Hono<{ Bindings: Env }>();

const OFFER_KINDS = ['percent_off', 'amount_off', 'bundle', 'custom'];

function offerValue(kind: string, raw: unknown): { value: number | null; value_type: string } {
  if (kind === 'custom' || kind === 'bundle') return { value: raw === null || raw === undefined || raw === '' ? null : reqInt(raw, { min: 0, max: 1_000_000_000 }), value_type: 'custom' };
  if (kind === 'percent_off') return { value: reqInt(raw, { min: 1, max: 90 }), value_type: 'percent' };
  return { value: reqInt(raw, { min: 1, max: 1_000_000_000 }), value_type: 'amount' };
}

app.get('/offers', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT o.*, l.name AS item_name FROM offers o LEFT JOIN listings l ON l.id = o.listing_id
     WHERE o.business_id = ? ORDER BY o.id DESC LIMIT 80`
  ).bind(business.id).all()).results;
  return c.json({ ok: true, offers: rows });
});

app.post('/offers', async (c) => {
  const { business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  const body = await c.req.json().catch(() => null);
  const title = reqStr(body?.title, { min: 2, max: 120 });
  const kind = OFFER_KINDS.includes(String(body?.kind)) ? String(body.kind) : 'custom';
  const { value, value_type } = offerValue(kind, body?.value);
  let listingId: number | null = null;
  if (body?.listing_id) {
    listingId = reqInt(body.listing_id, { min: 1 });
    const own = await c.env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(listingId, business.id).first();
    if (!own) throw validationError('That listing is not on your store.');
  }
  const ends = body?.ends_at ? String(body.ends_at).slice(0, 40) : null;
  if (ends && !Number.isFinite(Date.parse(ends))) throw validationError('End date is not valid.');
  const res = await c.env.DB.prepare(
    `INSERT INTO offers (business_id, listing_id, kind, title, description, value, value_type, starts_at, ends_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(business.id, listingId, kind, title, optStr(body?.description, 500), value, value_type, nowIso(), ends).run();
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put('/offers/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const row = await c.env.DB.prepare('SELECT id FROM offers WHERE id = ? AND business_id = ?').bind(id, business.id).first();
  if (!row) throw notFound('Offer not found.');
  const title = body?.title !== undefined ? reqStr(body.title, { min: 2, max: 120 }) : null;
  const active = body?.is_active === undefined ? null : body.is_active ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE offers SET title = COALESCE(?, title), description = COALESCE(?, description), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`
  ).bind(title, body?.description !== undefined ? optStr(body.description, 500) : null, active, nowIso(), id).run();
  return c.json({ ok: true });
});

app.delete('/offers/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare('DELETE FROM offers WHERE id = ? AND business_id = ?').bind(id, business.id).run();
  if (res.meta.changes === 0) throw notFound('Offer not found.');
  return c.json({ ok: true });
});

app.get('/items/:id/variants', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const own = await c.env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first();
  if (!own) throw notFound('Item not found.');
  const rows = (await c.env.DB.prepare('SELECT * FROM listing_variants WHERE listing_id = ? ORDER BY id').bind(id).all()).results;
  return c.json({ ok: true, variants: rows });
});

app.post('/items/:id/variants', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const own = await c.env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first();
  if (!own) throw notFound('Item not found.');
  const body = await c.req.json().catch(() => null);
  const name = reqStr(body?.name, { min: 1, max: 80 });
  const options = Array.isArray(body?.options) ? body.options.map((o: unknown) => String(o).slice(0, 40)).filter(Boolean).slice(0, 20) : [];
  if (!options.length) throw validationError('Add at least one option, like M or Red.');
  const count = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM listing_variants WHERE listing_id = ?').bind(id).first()) as { n: number };
  if (count.n >= 12) throw badRequest('12 variant groups is the limit for one listing.');
  const price = body?.price_kobo === null || body?.price_kobo === undefined || body?.price_kobo === '' ? null : parseMoneySafe(body.price_kobo);
  const stock = body?.stock_qty === null || body?.stock_qty === undefined || body?.stock_qty === '' ? null : reqInt(body.stock_qty, { min: 0, max: 1_000_000 });
  const res = await c.env.DB.prepare(
    `INSERT INTO listing_variants (listing_id, name, options, price_override, stock_qty, is_active) VALUES (?, ?, ?, ?, ?, 1)`
  ).bind(id, name, JSON.stringify(options), price, stock).run();
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.delete('/items/:id/variants/:vid', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const vid = reqInt(c.req.param('vid'), { min: 1 });
  const own = await c.env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first();
  if (!own) throw notFound('Item not found.');
  const res = await c.env.DB.prepare('DELETE FROM listing_variants WHERE id = ? AND listing_id = ?').bind(vid, id).run();
  if (res.meta.changes === 0) throw notFound('Variant not found.');
  return c.json({ ok: true });
});

app.post('/catalog/import', async (c) => {
  const { business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  const body = await c.req.json().catch(() => null);
  const csv = typeof body?.csv === 'string' ? body.csv : '';
  if (csv.length < 8 || csv.length > 400_000) throw badRequest('Paste a CSV (name column required, 200 rows max).');
  const objects = csvObjects(csv).slice(0, 200);
  if (!objects.length) throw badRequest('The CSV needs a header row and at least one item.');
  if (!('name' in objects[0]!)) throw validationError('The first column header must include "name".');
  const created: number[] = [];
  const errors: { row: number; message: string }[] = [];
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]!;
    try {
      await assertListingQuota(c.env, business.id);
      const name = reqStr(o.name, { min: 2, max: 200 });
      const typeSlug = (o.item_type || o.type || 'product').slice(0, 40);
      const type = (await c.env.DB.prepare('SELECT id FROM item_types WHERE slug = ? AND is_active = 1').bind(typeSlug).first()) as { id: number } | null;
      if (!type) throw validationError(`Unknown item type “${typeSlug}”.`);
      if (typeSlug === 'job' || typeSlug === 'cv') {
        await assertAddon(c.env, business.id, 'jobs_board', 'Jobs and CVs need the Jobs & CVs add-on.');
      }
      let categoryId: number | null = null;
      if (o.category) {
        const cat = (await c.env.DB.prepare('SELECT id FROM categories WHERE slug = ? AND deleted_at IS NULL').bind(o.category.slice(0, 80)).first()) as { id: number } | null;
        if (!cat) throw validationError('Unknown category slug.');
        const linked = await c.env.DB.prepare('SELECT 1 FROM business_categories WHERE business_id = ? AND category_id = ?').bind(business.id, cat.id).first();
        if (!linked) throw validationError('Your store is not in that category.');
        categoryId = cat.id;
      }
      let price: number | null = null;
      const priceType = ['fixed', 'from', 'negotiable', 'free'].includes(o.price_type || '') ? o.price_type! : 'fixed';
      if (priceType === 'free') price = 0;
      else if (priceType === 'negotiable') price = null;
      else if (o.price_naira) {
        const naira = Number(o.price_naira.replace(/[, ]/g, ''));
        if (!Number.isFinite(naira) || naira < 0) throw validationError('Price is not a number.');
        price = Math.round(naira * 100);
      } else if (priceType === 'fixed') {
        throw validationError('Enter price_naira or set price_type to negotiable.');
      }
      let slug = slugify(name) || `item-${i + 1}`;
      assertSlugAvailable(slug);
      const taken = await c.env.DB.prepare('SELECT id FROM listings WHERE business_id = ? AND slug = ? AND deleted_at IS NULL').bind(business.id, slug).first();
      if (taken) slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`;
      const stock = ['in_stock', 'out_of_stock', 'made_to_order', 'n_a'].includes(o.stock_status || '') ? o.stock_status! : 'n_a';
      const res = await c.env.DB.prepare(
        `INSERT INTO listings (business_id, category_id, item_type_id, name, slug, description, price, price_type, custom_fields, status, stock_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 'draft', ?)`
      ).bind(business.id, categoryId, type.id, name, slug, optStr(o.description, 4000), price, priceType, stock).run();
      created.push(Number(res.meta.last_row_id));
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : 'Could not import this row.' });
    }
  }
  return c.json({ ok: true, created: created.length, ids: created, errors });
});

app.get('/templates', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT mt.id, mt.name, mt.body, mt.is_active, mt.business_id, mt.item_type_id, t.slug AS item_type_slug, t.name AS item_type_name
     FROM message_templates mt LEFT JOIN item_types t ON t.id = mt.item_type_id
     WHERE mt.business_id IS NULL OR mt.business_id = ?
     ORDER BY mt.business_id IS NULL, mt.id`
  ).bind(business.id).all()).results;
  return c.json({ ok: true, templates: rows });
});

app.post('/templates', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const body = await c.req.json().catch(() => null);
  const name = reqStr(body?.name, { min: 2, max: 80 });
  const text = reqStr(body?.body, { min: 8, max: 2000 });
  let typeId: number | null = null;
  if (body?.item_type_slug) {
    const t = (await c.env.DB.prepare('SELECT id FROM item_types WHERE slug = ?').bind(String(body.item_type_slug).slice(0, 40)).first()) as { id: number } | null;
    if (!t) throw validationError('Unknown item type.');
    typeId = t.id;
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO message_templates (business_id, item_type_id, name, body, is_active) VALUES (?, ?, ?, ?, 1)`
  ).bind(business.id, typeId, name, text).run();
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put('/templates/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const row = (await c.env.DB.prepare('SELECT id, business_id FROM message_templates WHERE id = ?').bind(id).first()) as { id: number; business_id: number | null } | null;
  if (!row || row.business_id !== business.id) throw forbidden('You can only edit your own templates. Save a copy to override the platform one.');
  const text = reqStr(body?.body, { min: 8, max: 2000 });
  const name = body?.name ? reqStr(body.name, { min: 2, max: 80 }) : null;
  await c.env.DB.prepare('UPDATE message_templates SET body = ?, name = COALESCE(?, name), updated_at = ? WHERE id = ?').bind(text, name, nowIso(), id).run();
  return c.json({ ok: true });
});

app.get('/staff', async (c) => {
  const { business, memberRole } = await requireVendor(c.env, c);
  if (memberRole !== 'owner' && memberRole !== 'manager') throw forbidden('Only the owner or a manager can see the team.');
  const quotas = await effectiveQuotas(c.env, business.id);
  const members = (await c.env.DB.prepare(
    `SELECT m.user_id, m.role, m.status, m.created_at, u.name, u.email
     FROM business_members m JOIN users u ON u.id = m.user_id
     WHERE m.business_id = ? AND m.status != 'removed' ORDER BY m.created_at`
  ).bind(business.id).all()).results;
  const invites = (await c.env.DB.prepare(
    `SELECT id, email, role, expires_at, created_at FROM staff_invites
     WHERE business_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY id DESC`
  ).bind(business.id, nowIso()).all()).results;
  return c.json({ ok: true, members, invites, limit: quotas.max_staff, used: (members as unknown[]).length + (invites as unknown[]).length });
});

app.post('/staff/invite', async (c) => {
  const { business, memberRole, user } = await requireVendor(c.env, c);
  if (memberRole !== 'owner' && memberRole !== 'manager') throw forbidden('Only the owner or a manager can invite staff.');
  const quotas = await effectiveQuotas(c.env, business.id);
  const usedMembers = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM business_members WHERE business_id = ? AND status = 'active'`).bind(business.id).first()) as { n: number };
  const usedInvites = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM staff_invites WHERE business_id = ? AND accepted_at IS NULL AND expires_at > ?`).bind(business.id, nowIso()).first()) as { n: number };
  if (quotas.max_staff >= 0 && usedMembers.n + usedInvites.n >= quotas.max_staff) {
    throw forbidden(quotas.max_staff === 0
      ? 'Staff seats are not on your plan. Buy the Extra staff account add-on, or move to a plan that includes them.'
      : `You have used all ${quotas.max_staff} staff seats.`);
  }
  const body = await c.req.json().catch(() => null);
  const email = reqStr(body?.email, { min: 5, max: 180 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError('Enter a valid email.');
  const role: StaffRole = (STAFF_ROLES as readonly string[]).includes(String(body?.role)) ? (body.role as StaffRole) : 'catalogue';
  if (email === user.email.toLowerCase()) throw badRequest('That is already your login.');
  const token = randomToken(24);
  const expires = new Date(Date.now() + 7 * 86400_000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO staff_invites (business_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(business.id, email, role, token, expires).run();
  const url = `${c.env.APP_URL}/invite/${token}`;
  if (mailConfigured(c.env)) {
    await sendEmail(c.env, {
      to: email,
      subject: `${business.name} invited you to CyberShop`,
      text: `${user.name} invited you to help run ${business.name} as ${role}.\n\nAccept (7 days):\n${url}`,
      html: mailHtml('You are invited', `${user.name} invited you to help run <strong>${business.name}</strong> as ${role}. The link works for 7 days.`, { label: 'Accept invite', url }),
    });
  }
  return c.json({ ok: true, invite_url: url, emailed: mailConfigured(c.env) });
});

app.put('/staff/:userId', async (c) => {
  const { business, memberRole } = await requireVendor(c.env, c);
  if (memberRole !== 'owner' && memberRole !== 'manager') throw forbidden('Only the owner or a manager can change a role.');
  const userId = reqInt(c.req.param('userId'), { min: 1 });
  if (userId === business.owner_user_id) throw badRequest('The owner role stays with the owner.');
  const body = await c.req.json().catch(() => null);
  const role: StaffRole = (STAFF_ROLES as readonly string[]).includes(String(body?.role)) ? (body.role as StaffRole) : 'catalogue';
  const res = await c.env.DB.prepare(`UPDATE business_members SET role = ? WHERE business_id = ? AND user_id = ? AND status = 'active'`).bind(role, business.id, userId).run();
  if (res.meta.changes === 0) throw notFound('That person is not on your team.');
  return c.json({ ok: true, role });
});

app.delete('/staff/:userId', async (c) => {
  const { business, memberRole } = await requireVendor(c.env, c);
  if (memberRole !== 'owner' && memberRole !== 'manager') throw forbidden('Only the owner or a manager can remove staff.');
  const userId = reqInt(c.req.param('userId'), { min: 1 });
  if (userId === business.owner_user_id) throw badRequest('The owner cannot be removed.');
  await c.env.DB.prepare(`UPDATE business_members SET status = 'removed' WHERE business_id = ? AND user_id = ?`).bind(business.id, userId).run();
  return c.json({ ok: true });
});

app.get('/domain', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const row = (await c.env.DB.prepare(
    'SELECT custom_domain, custom_domain_status, custom_domain_token FROM businesses WHERE id = ?'
  ).bind(business.id).first()) as { custom_domain: string | null; custom_domain_status: string; custom_domain_token: string | null };
  const paid = await c.env.DB.prepare(
    `SELECT 1 FROM vendor_addons va JOIN addons a ON a.id = va.addon_id
     WHERE va.business_id = ? AND va.status = 'active' AND a.type = 'custom_domain'
       AND (va.expires_at IS NULL OR va.expires_at > datetime('now'))`
  ).bind(business.id).first();
  return c.json({
    ok: true,
    addon: !!paid,
    domain: row.custom_domain,
    status: row.custom_domain_status,
    token: row.custom_domain_token,
    instructions: row.custom_domain_token
      ? `Add a TXT record: host _cybershop.${row.custom_domain || 'yourdomain'} value ${row.custom_domain_token}. Or host a file at https://${row.custom_domain}/.well-known/cybershop-domain.txt containing the token.`
      : null,
  });
});

app.post('/domain', async (c) => {
  const { business, memberRole } = await requireVendor(c.env, c);
  if (memberRole !== 'owner' && memberRole !== 'manager') throw forbidden('Only the owner can set a domain.');
  await assertAddon(c.env, business.id, 'custom_domain', 'Custom domains are an add-on. Buy it under Plan & billing, then come back.');
  const body = await c.req.json().catch(() => null);
  const domain = normalizeDomain(body?.domain);
  const taken = await c.env.DB.prepare('SELECT id FROM businesses WHERE custom_domain = ? AND id != ? AND deleted_at IS NULL').bind(domain, business.id).first();
  if (taken) throw conflict('That domain is already connected to another store.');
  const token = `cs-${randomToken(12)}`;
  await c.env.DB.prepare(
    `UPDATE businesses SET custom_domain = ?, custom_domain_status = 'pending', custom_domain_token = ? WHERE id = ?`
  ).bind(domain, token, business.id).run();
  return c.json({ ok: true, domain, status: 'pending', token });
});

app.post('/domain/check', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const row = (await c.env.DB.prepare(
    'SELECT custom_domain, custom_domain_token, custom_domain_status FROM businesses WHERE id = ?'
  ).bind(business.id).first()) as { custom_domain: string | null; custom_domain_token: string | null; custom_domain_status: string };
  if (!row.custom_domain || !row.custom_domain_token) throw badRequest('Request a domain first.');
  const ok = await domainTxtHasToken(row.custom_domain, row.custom_domain_token);
  if (!ok) return c.json({ ok: true, verified: false, message: 'Token not found yet. DNS can take a few minutes.' });
  await c.env.DB.prepare(`UPDATE businesses SET custom_domain_status = 'verified' WHERE id = ?`).bind(business.id).run();
  const vercel = await attachVercelDomain(c.env, row.custom_domain);
  return c.json({ ok: true, verified: true, vercel, message: 'Domain verified. Point it at this site (CNAME to your Vercel domain) if you have not already.' });
});

app.delete('/domain', async (c) => {
  const { business, memberRole } = await requireVendor(c.env, c);
  if (memberRole !== 'owner') throw forbidden('Only the owner can remove a domain.');
  await c.env.DB.prepare(`UPDATE businesses SET custom_domain = NULL, custom_domain_status = 'none', custom_domain_token = NULL WHERE id = ?`).bind(business.id).run();
  return c.json({ ok: true });
});

app.get('/reviews', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.title, r.body, r.vendor_reply, r.status, r.created_at, u.name AS buyer_name, l.name AS item_name
     FROM reviews r JOIN users u ON u.id = r.buyer_user_id
     LEFT JOIN listings l ON l.id = r.listing_id
     WHERE r.business_id = ? ORDER BY r.id DESC LIMIT 50`
  ).bind(business.id).all()).results;
  return c.json({ ok: true, reviews: rows });
});

app.put('/reviews/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const reply = reqStr(body?.vendor_reply, { min: 2, max: 1000 });
  const res = await c.env.DB.prepare(
    `UPDATE reviews SET vendor_reply = ?, updated_at = ? WHERE id = ? AND business_id = ?`
  ).bind(reply, nowIso(), id, business.id).run();
  if (res.meta.changes === 0) throw notFound('Review not found.');
  return c.json({ ok: true });
});

export default app;
