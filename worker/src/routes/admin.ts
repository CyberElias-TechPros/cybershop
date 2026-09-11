import { Hono, type Context } from 'hono';
import type { Env } from '../config';
import { requireAdmin, requireUser } from '../lib/auth';
import { badRequest, validationError, notFound, conflict, forbidden } from '../lib/errors';
import { nowIso, clampInt } from '../lib/util';
import { reqStr, optStr, reqInt, isHttpUrl } from '../lib/validate';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { clientIp } from '../lib/ip';
import { approvePayment, rejectPayment } from '../lib/payments';
import { formatNaira } from '../lib/money';
import { getMedia, mediaUrl, softDeleteMedia, storageUsedBytes, blobToBuffer } from '../lib/media';

const app = new Hono<{ Bindings: Env }>();

const ip = (c: Context<{ Bindings: Env }>) => {
  const v = clientIp(c);
  return v === 'unknown' ? null : v;
};

// ---------------------------------------------------------------- overview

app.get('/overview', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const vendors = (await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM businesses WHERE deleted_at IS NULL) AS total,
    (SELECT COUNT(*) FROM businesses WHERE status = 'active' AND deleted_at IS NULL) AS active,
    (SELECT COUNT(*) FROM businesses WHERE status = 'pending_approval' AND deleted_at IS NULL) AS pending_approval,
    (SELECT COUNT(*) FROM businesses WHERE status = 'pending_payment' AND deleted_at IS NULL) AS pending_payment,
    (SELECT COUNT(*) FROM businesses WHERE status = 'suspended' AND deleted_at IS NULL) AS suspended
  `).first()) as Record<string, number>;
  const buyers = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'buyer' AND deleted_at IS NULL`).first()) as { n: number };
  const items = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings WHERE status = 'published' AND deleted_at IS NULL`).first()) as { n: number };
  const clicks = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM analytics_events WHERE event_type = 'wa_click'`).first()) as { n: number };
  const revenue = (await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status = 'approved'`).first()) as { n: number };
  const queues = (await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM payments WHERE status IN ('submitted','reviewing')) AS payments,
    (SELECT COUNT(*) FROM businesses WHERE status IN ('pending_payment','pending_approval')) AS vendors,
    (SELECT COUNT(*) FROM reports WHERE status IN ('open','investigating')) AS reports,
    (SELECT COUNT(*) FROM listings WHERE status = 'published' AND deleted_at IS NULL) AS listings
  `).first()) as Record<string, number>;
  const recentPayments = (await env.DB.prepare(
    `SELECT p.id, p.reference, p.amount, p.method, p.status, p.created_at, b.name AS business_name FROM payments p JOIN businesses b ON b.id = p.business_id ORDER BY p.id DESC LIMIT 8`
  ).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    stats: { ...vendors, buyers: buyers.n, items: items.n, wa_clicks: clicks.n, revenue_kobo: revenue.n, revenue_display: formatNaira(revenue.n) },
    queues,
    recent_payments: recentPayments.map((p) => ({ ...p, amount_display: formatNaira(Number(p.amount)) })),
  });
});

// ---------------------------------------------------------------- vendors

app.get('/vendors', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const status = c.req.query('status') || 'all';
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 24;
  let where = 'WHERE b.deleted_at IS NULL';
  const params: (string | number)[] = [];
  if (status !== 'all') { where += ' AND b.status = ?'; params.push(status); }
  if (q) { where += ' AND (b.name LIKE ? OR b.slug LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const total = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM businesses b JOIN users u ON u.id = b.owner_user_id ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.status, b.created_at, u.email, u.phone,
            (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.business_id = b.id ORDER BY s.id DESC LIMIT 1) AS plan_name,
            (SELECT COUNT(*) FROM listings l WHERE l.business_id = b.id AND l.status = 'published' AND l.deleted_at IS NULL) AS items
     FROM businesses b JOIN users u ON u.id = b.owner_user_id ${where}
     ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, vendors: rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)) });
});

app.get('/vendors/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = (await c.env.DB.prepare(
    `SELECT b.*, u.email, u.phone, u.name AS owner_name FROM businesses b JOIN users u ON u.id = b.owner_user_id WHERE b.id = ? AND b.deleted_at IS NULL`
  ).bind(id).first()) as Record<string, unknown> | null;
  if (!row) throw notFound('Business not found.');
  const payments = (await c.env.DB.prepare(`SELECT * FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT 20`).bind(id).all()).results as Record<string, unknown>[];
  const numbers = (await c.env.DB.prepare(`SELECT * FROM whatsapp_numbers WHERE business_id = ? AND deleted_at IS NULL`).bind(id).all()).results as Record<string, unknown>[];
  const storage = await storageUsedBytes(c.env, id);
  return c.json({ ok: true, business: { ...row, storage_used_bytes: storage }, payments: payments.map((p) => ({ ...p, amount_display: formatNaira(Number(p.amount)) })), numbers });
});

async function setBusinessStatus(env: Env, admin: { id: number; role: string }, businessId: number, status: 'active' | 'suspended' | 'rejected', action: string, ipAddr: string | null, meta?: Record<string, unknown>) {
  const res = await env.DB.prepare('UPDATE businesses SET status = ? WHERE id = ? AND deleted_at IS NULL').bind(status, businessId).run();
  if (res.meta.changes === 0) throw notFound('Business not found.');
  const owner = (await env.DB.prepare('SELECT owner_user_id, name FROM businesses WHERE id = ?').bind(businessId).first()) as { owner_user_id: number; name: string } | null;
  if (owner) {
    const titles: Record<string, string> = { active: 'Your business has been approved', suspended: 'Your business has been suspended', rejected: 'Your business registration was not approved' };
    await notify(env, { userId: owner.owner_user_id, type: `business.${status}`, title: titles[status] || 'Business update', body: `Your store "${owner.name}" is now ${status.replace('_', ' ')}.` });
  }
  await audit(env, { actor: admin as never, action, entityType: 'business', entityId: businessId, ip: ipAddr, meta });
}

app.post('/vendors/:id/approve', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await setBusinessStatus(c.env, admin, id, 'active', 'vendor.approve', ip(c));
  return c.json({ ok: true });
});

app.post('/vendors/:id/suspend', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const note = optStr(body?.note, 500) || 'Suspended by an administrator.';
  await setBusinessStatus(c.env, admin, id, 'suspended', 'vendor.suspend', ip(c), { note });
  return c.json({ ok: true });
});

app.post('/vendors/:id/reactivate', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await setBusinessStatus(c.env, admin, id, 'active', 'vendor.reactivate', ip(c));
  return c.json({ ok: true });
});

app.post('/vendors/:id/reject', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const reason = optStr(body?.reason, 500) || 'Registration rejected.';
  await setBusinessStatus(c.env, admin, id, 'rejected', 'vendor.reject', ip(c), { reason });
  return c.json({ ok: true });
});

app.post('/users/:id/suspend', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare(`UPDATE users SET status = 'suspended' WHERE id = ? AND role != 'admin'`).bind(id).run();
  if (res.meta.changes === 0) throw notFound('User not found (admins cannot be suspended here).');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await audit(c.env, { actor: admin, action: 'user.suspend', entityType: 'user', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

app.post('/users/:id/activate', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare(`UPDATE users SET status = 'active' WHERE id = ? AND role != 'admin'`).bind(id).run();
  if (res.meta.changes === 0) throw notFound('User not found.');
  await audit(c.env, { actor: admin, action: 'user.activate', entityType: 'user', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- payments

app.get('/payments', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const status = c.req.query('status') || 'all';
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 20;
  let where = '';
  const params: (string | number)[] = [];
  if (status !== 'all') { where = 'WHERE p.status = ?'; params.push(status); }
  const total = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments p ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await env.DB.prepare(
    `SELECT p.*, b.name AS business_name, b.slug AS business_slug, u.email AS vendor_email,
            (p.proof_media_id IS NOT NULL) AS has_proof, pl.name AS plan_name, a.name AS addon_name
     FROM payments p JOIN businesses b ON b.id = p.business_id JOIN users u ON u.id = b.owner_user_id
     LEFT JOIN plans pl ON pl.id = p.plan_id LEFT JOIN addons a ON a.id = p.addon_id
     ${where} ORDER BY CASE WHEN p.status IN ('submitted','reviewing') THEN 0 ELSE 1 END, p.id DESC LIMIT ? OFFSET ?`
  ).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, payments: rows.map((p) => ({ ...p, amount_display: formatNaira(Number(p.amount)) })), total, page, pages: Math.max(1, Math.ceil(total / perPage)) });
});

app.get('/payments/:id/proof', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const payment = (await c.env.DB.prepare('SELECT proof_media_id FROM payments WHERE id = ?').bind(id).first()) as { proof_media_id: number | null } | null;
  if (!payment || !payment.proof_media_id) throw notFound('No proof attached.');
  const media = await getMedia(c.env, payment.proof_media_id);
  if (!media) throw notFound('Proof media not found.');
  if (media.driver === 'd1' && media.d1_blob) {
    const bytes = blobToBuffer(media.d1_blob);
    return new Response(bytes, { headers: { 'Content-Type': media.mime_type, 'Content-Disposition': `attachment; filename="${media.storage_key.split('/').pop()}"`, 'Cache-Control': 'no-store' } });
  }
  throw notFound('Proof media is not available for download.');
});

app.post('/payments/:id/approve', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await approvePayment(c.env, { paymentId: id, admin, ip: ip(c) });
  return c.json({ ok: true });
});

app.post('/payments/:id/reject', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const reason = reqStr(body?.reason, { min: 5, max: 500 });
  await rejectPayment(c.env, { paymentId: id, admin, reason, ip: ip(c) });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- categories

app.get('/categories', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order').all()).results as Record<string, unknown>[];
  return c.json({ ok: true, categories: rows });
});

interface CategoryInput { name: string; slug: string; description: string | null; icon: string | null; field_schema: string; is_active: number; sort_order: number }

async function parseCategory(body: unknown, existingSlug?: string): Promise<CategoryInput> {
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const b = body as Record<string, unknown>;
  const name = reqStr(b.name, { min: 2, max: 120 });
  const slug = reqStr(b.slug || '', { min: 2, max: 140 });
  let schema: unknown = [];
  if (b.field_schema !== undefined) {
    schema = Array.isArray(b.field_schema) ? b.field_schema : JSON.parse(String(b.field_schema || '[]'));
    if (!Array.isArray(schema) || schema.length > 40) throw validationError('Field schema must be an array of at most 40 fields.');
    const allowedTypes = new Set(['text', 'long_text', 'number', 'currency', 'boolean', 'date', 'time', 'select', 'multi_select', 'radio', 'checkbox', 'url', 'email', 'phone', 'location', 'rich_text']);
    for (const f of schema) {
      if (!f || typeof f !== 'object') throw validationError('Each field must be an object.');
      const x = f as Record<string, unknown>;
      if (typeof x.key !== 'string' || !/^[a-z0-9_]{1,40}$/.test(x.key)) throw validationError('Field keys must be lowercase letters, numbers or underscores.');
      if (!allowedTypes.has(String(x.type || 'text'))) throw validationError(`Unsupported field type: ${x.type}`);
      if (x.options !== undefined && x.options !== null && !Array.isArray(x.options)) throw validationError(`Options for "${x.key}" must be a list.`);
    }
  }
  return {
    name, slug,
    description: optStr(b.description, 500),
    icon: optStr(b.icon, 10) || '🏷️',
    field_schema: JSON.stringify(schema),
    is_active: b.is_active === false || b.is_active === 0 ? 0 : 1,
    sort_order: b.sort_order !== undefined ? reqInt(b.sort_order, { min: 0, max: 1000 }) : 0,
  };
}

app.post('/categories', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const input = await parseCategory(await c.req.json().catch(() => null));
  const taken = (await c.env.DB.prepare('SELECT id FROM categories WHERE slug = ? AND deleted_at IS NULL').bind(input.slug).first()) as { id: number } | null;
  if (taken) throw conflict('A category with this slug already exists.');
  const res = await c.env.DB.prepare('INSERT INTO categories (name, slug, description, icon, field_schema, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(input.name, input.slug, input.description, input.icon, input.field_schema, input.is_active, input.sort_order).run();
  await audit(c.env, { actor: admin, action: 'category.create', entityType: 'category', entityId: Number(res.meta.last_row_id), ip: ip(c), meta: { name: input.name } });
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put('/categories/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const existing = (await c.env.DB.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL').bind(id).first()) as Record<string, unknown> | null;
  if (!existing) throw notFound('Category not found.');
  const input = await parseCategory(await c.req.json().catch(() => null));
  await c.env.DB.prepare('UPDATE categories SET name = ?, slug = ?, description = ?, icon = ?, field_schema = ?, is_active = ?, sort_order = ? WHERE id = ?')
    .bind(input.name, input.slug, input.description, input.icon, input.field_schema, input.is_active, input.sort_order, id).run();
  await audit(c.env, { actor: admin, action: 'category.update', entityType: 'category', entityId: id, ip: ip(c), meta: { name: input.name } });
  return c.json({ ok: true });
});

app.delete('/categories/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const used = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM listings WHERE category_id = ? AND deleted_at IS NULL').bind(id).first()) as { n: number };
  if (used.n > 0) throw badRequest(`${used.n} item(s) use this category. Re-assign them first.`);
  await c.env.DB.prepare('UPDATE categories SET deleted_at = ? WHERE id = ?').bind(nowIso(), id).run();
  await c.env.DB.prepare('DELETE FROM business_categories WHERE category_id = ?').bind(id).run();
  await audit(c.env, { actor: admin, action: 'category.delete', entityType: 'category', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- plans & addons

app.get('/plans', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT * FROM plans ORDER BY sort_order').all()).results as Record<string, unknown>[];
  return c.json({ ok: true, plans: rows });
});

async function parsePlan(body: unknown) {
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const b = body as Record<string, unknown>;
  let quota: Record<string, number> = {};
  if (b.quota) {
    quota = typeof b.quota === 'string' ? JSON.parse(b.quota) : (b.quota as Record<string, number>);
    for (const k of ['max_whatsapp_numbers', 'max_storage_mb', 'max_listings', 'max_categories', 'max_staff', 'featured_listings']) {
      const v = Number(quota[k]);
      if (!Number.isFinite(v) || v < -1) throw validationError(`Quota ${k} must be a number (-1 = unlimited).`);
      quota[k] = v;
    }
  }
  let features: string[] = [];
  if (Array.isArray(b.features)) features = b.features.map((f) => String(f).slice(0, 200)).slice(0, 20);
  return {
    name: reqStr(b.name, { min: 2, max: 100 }),
    slug: reqStr(b.slug, { min: 2, max: 110 }),
    description: optStr(b.description, 500),
    price: reqInt(b.price_kobo, { min: 0, max: 10_000_000_000 }),
    interval: (['once', 'monthly', 'quarterly', 'yearly'].includes(String(b.interval)) ? b.interval : 'monthly') as string,
    trial_days: reqInt(b.trial_days ?? 0, { min: 0, max: 90 }),
    quota: JSON.stringify(quota),
    features: JSON.stringify(features),
    is_active: b.is_active === false || b.is_active === 0 ? 0 : 1,
    sort_order: reqInt(b.sort_order ?? 0, { min: 0, max: 1000 }),
  };
}

app.post('/plans', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const p = await parsePlan(await c.req.json().catch(() => null));
  const taken = (await c.env.DB.prepare('SELECT id FROM plans WHERE slug = ?').bind(p.slug).first()) as { id: number } | null;
  if (taken) throw conflict('A plan with this slug already exists.');
  const res = await c.env.DB.prepare('INSERT INTO plans (name, slug, description, price, interval, trial_days, quota, features, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(p.name, p.slug, p.description, p.price, p.interval, p.trial_days, p.quota, p.features, p.is_active, p.sort_order).run();
  await audit(c.env, { actor: admin, action: 'plan.create', entityType: 'plan', entityId: Number(res.meta.last_row_id), ip: ip(c) });
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put('/plans/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const p = await parsePlan(await c.req.json().catch(() => null));
  const res = await c.env.DB.prepare('UPDATE plans SET name = ?, slug = ?, description = ?, price = ?, interval = ?, trial_days = ?, quota = ?, features = ?, is_active = ?, sort_order = ? WHERE id = ?')
    .bind(p.name, p.slug, p.description, p.price, p.interval, p.trial_days, p.quota, p.features, p.is_active, p.sort_order, id).run();
  if (res.meta.changes === 0) throw notFound('Plan not found.');
  await audit(c.env, { actor: admin, action: 'plan.update', entityType: 'plan', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

app.delete('/plans/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const used = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id = ?').bind(id).first()) as { n: number };
  if (used.n > 0) throw badRequest(`${used.n} subscription(s) use this plan. Deactivate it instead.`);
  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(id).run();
  await audit(c.env, { actor: admin, action: 'plan.delete', entityType: 'plan', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

app.get('/addons', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT * FROM addons ORDER BY sort_order').all()).results as Record<string, unknown>[];
  return c.json({ ok: true, addons: rows });
});

app.post('/addons', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const body = await c.req.json().catch(() => null);
  const b = (body || {}) as Record<string, unknown>;
  const types = ['extra_whatsapp_number', 'extra_storage', 'featured_listing', 'extra_category', 'staff_account', 'custom_domain', 'advanced_analytics'];
  if (!types.includes(String(b.type))) throw validationError('Unsupported add-on type.');
  const res = await c.env.DB.prepare('INSERT INTO addons (name, slug, description, type, unit, price, duration_days, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(reqStr(b.name, { min: 2, max: 120 }), reqStr(b.slug, { min: 2, max: 130 }), optStr(b.description, 300), b.type, optStr(b.unit, 40) || '1', reqInt(b.price_kobo, { min: 1, max: 10_000_000_000 }), reqInt(b.duration_days ?? 30, { min: 1, max: 730 }), 1, reqInt(b.sort_order ?? 0, { min: 0, max: 1000 })).run();
  await audit(c.env, { actor: admin, action: 'addon.create', entityType: 'addon', entityId: Number(res.meta.last_row_id), ip: ip(c) });
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put('/addons/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const b = (body || {}) as Record<string, unknown>;
  const res = await c.env.DB.prepare(
    `UPDATE addons SET name = COALESCE(?, name), description = COALESCE(?, description), price = COALESCE(?, price), duration_days = COALESCE(?, duration_days), is_active = COALESCE(?, is_active) WHERE id = ?`
  ).bind(
    b.name !== undefined ? reqStr(b.name, { min: 2, max: 120 }) : null,
    b.description !== undefined ? optStr(b.description, 300) : null,
    b.price_kobo !== undefined ? reqInt(b.price_kobo, { min: 1, max: 10_000_000_000 }) : null,
    b.duration_days !== undefined ? reqInt(b.duration_days, { min: 1, max: 730 }) : null,
    b.is_active !== undefined ? (b.is_active ? 1 : 0) : null,
    id
  ).run();
  if (res.meta.changes === 0) throw notFound('Add-on not found.');
  await audit(c.env, { actor: admin, action: 'addon.update', entityType: 'addon', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

app.delete('/addons/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await c.env.DB.prepare('DELETE FROM addons WHERE id = ?').bind(id).run();
  await audit(c.env, { actor: admin, action: 'addon.delete', entityType: 'addon', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- listings oversight

app.get('/listings', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const status = c.req.query('status') || 'published';
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 24;
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.status, l.price, b.name AS business_name, b.slug AS biz_slug, t.name AS type_name, t.url_segment, l.published_at
     FROM listings l JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     WHERE l.deleted_at IS NULL AND l.status = ? AND (? = '' OR l.name LIKE ? OR b.name LIKE ?)
     ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`
  ).bind(status, q, `%${q}%`, `%${q}%`, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, listings: rows });
});

app.post('/listings/:id/archive', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare(`UPDATE listings SET status = 'archived' WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
  if (res.meta.changes === 0) throw notFound('Listing not found.');
  await audit(c.env, { actor: admin, action: 'listing.archive', entityType: 'listing', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- reports

app.get('/reports', async (c) => {
  await requireAdmin(c.env, c);
  const status = c.req.query('status') || 'open';
  const rows = (await c.env.DB.prepare(
    `SELECT r.*, u.email AS reporter_email FROM reports r LEFT JOIN users u ON u.id = r.reporter_user_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`
  ).bind(status).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, reports: rows });
});

app.post('/reports', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const entityType = String(body?.entity_type || '');
  if (!['business', 'listing', 'media', 'user'].includes(entityType)) throw validationError('Invalid report target.');
  const entityId = reqInt(body?.entity_id, { min: 1 });
  const reason = String(body?.reason || 'other');
  if (!['spam', 'fraud', 'misleading', 'abusive', 'other'].includes(reason)) throw validationError('Invalid reason.');
  await c.env.DB.prepare(`INSERT INTO reports (reporter_user_id, entity_type, entity_id, reason, details) VALUES (?, ?, ?, ?, ?)`)
    .bind(user.id, entityType, entityId, reason, optStr(body?.details, 2000)).run();
  return c.json({ ok: true, message: 'Thanks. Our team will review this.' });
});

app.post('/reports/:id/resolve', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const status = body?.status;
  if (!['resolved', 'dismissed', 'investigating'].includes(String(status))) throw badRequest('Invalid status.');
  const res = await c.env.DB.prepare('UPDATE reports SET status = ?, resolved_by = ?, resolution_note = ? WHERE id = ?').bind(status, admin.id, optStr(body?.note, 500), id).run();
  if (res.meta.changes === 0) throw notFound('Report not found.');
  await audit(c.env, { actor: admin, action: 'report.resolve', entityType: 'report', entityId: id, ip: ip(c), meta: { status } });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- audit & settings

app.get('/audit', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 30;
  const rows = (await env.DB.prepare(
    `SELECT a.*, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.id DESC LIMIT ? OFFSET ?`
  ).bind(perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, logs: rows });
});

app.get('/settings', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT skey, svalue FROM platform_settings').all()).results as { skey: string; svalue: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) { try { out[r.skey] = r.svalue ? JSON.parse(r.svalue) : null; } catch { out[r.skey] = r.svalue; } }
  return c.json({ ok: true, settings: out });
});

app.put('/settings', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const editable = new Set(['platform', 'bank_accounts', 'seo', 'upload_limits']);
  let changed = 0;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!editable.has(k)) continue;
    await c.env.DB.prepare('INSERT INTO platform_settings (skey, svalue) VALUES (?, ?) ON CONFLICT(skey) DO UPDATE SET svalue = excluded.svalue, updated_at = ?')
      .bind(k, JSON.stringify(v), nowIso()).run();
    changed++;
  }
  await audit(c.env, { actor: admin, action: 'settings.update', entityType: 'settings', ip: ip(c), meta: { keys: Object.keys(body as object).filter((k) => editable.has(k)) } });
  return c.json({ ok: true, changed });
});

app.get('/media', async (c) => {
  await requireAdmin(c.env, c);
  const env = c.env;
  const rows = (await env.DB.prepare(
    `SELECT m.id, m.business_id, b.name AS business_name, m.mime_type, m.size_bytes, m.visibility, m.status, m.created_at
     FROM media m LEFT JOIN businesses b ON b.id = m.business_id
     WHERE m.deleted_at IS NULL ORDER BY m.size_bytes DESC LIMIT 100`
  ).all()).results as Record<string, unknown>[];
  const total = (await env.DB.prepare(`SELECT COALESCE(SUM(size_bytes),0) AS n FROM media WHERE status != 'deleted' AND deleted_at IS NULL`).first()) as { n: number };
  return c.json({ ok: true, media: rows, total_used_bytes: total.n });
});

app.delete('/media/:id', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await softDeleteMedia(c.env, id);
  await audit(c.env, { actor: admin, action: 'media.delete', entityType: 'media', entityId: id, ip: ip(c) });
  return c.json({ ok: true });
});

export default app;
