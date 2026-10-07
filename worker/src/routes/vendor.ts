import { Hono, type Context } from 'hono';
import type { Env } from '../config';
import { requireVendor } from '../lib/auth';
import { badRequest, validationError, notFound, conflict, forbidden } from '../lib/errors';
import { slugify, assertSlugAvailable, uuid, nowIso, clampInt, parseMoneySafe } from '../lib/util';
import { reqStr, optStr, reqInt, validateCustomFields, isHttpUrl } from '../lib/validate';
import {
  issueUploadToken, finalizeGatewayUpload, storeD1Media, magicMime, mediaUrl,
  getMedia, assertMediaOwnership, markMediaAttached, detachMedia, softDeleteMedia, storageUsedBytes, IMAGE_MIME, AUDIO_MIME,
} from '../lib/media';
import { effectiveQuotas, assertListingQuota, assertNumberQuota, assertStorageQuota, assertBusinessWritable } from '../lib/quotas';
import { entitlementFor } from '../lib/entitlement';
import { storeCompleteness } from '../lib/completeness';
import { assertAddon, assertFeaturedSlot, parseInspection } from '../lib/premium';
import { createPaymentIntent, submitBankProof, activateFreePlan, type PlanRow, type AddonRow } from '../lib/payments';
import { initiatePaystack } from '../lib/paystack';
import { normalizeWaNumber } from '../lib/wa';
import { formatNaira } from '../lib/money';
import { recordView } from '../lib/analytics';
import { notify } from '../lib/notify';
import { parseStorefront } from '../lib/storefront';
import { ensureReferralCode, referralLink, referralCredit } from '../lib/referral';

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------- business

app.get('/business', async (c) => {
  const { user, business } = await requireVendor(c.env, c);
  const row = (await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(business.id).first()) as Record<string, unknown> | null;
  if (!row) throw notFound('Business not found.');
  const cats = (await c.env.DB.prepare('SELECT c.name, c.slug, c.icon FROM business_categories bc JOIN categories c ON c.id = bc.category_id WHERE bc.business_id = ?').bind(business.id).all()).results as Record<string, unknown>[];
  const quotas = await effectiveQuotas(c.env, business.id);
  const storage = await storageUsedBytes(c.env, business.id);
  const code = await ensureReferralCode(c.env, user.id);
  const credit = await referralCredit(c.env, user.id);
  // Resolved branding URLs, so the dashboard can preview the store photo and
  // cover it already uploaded instead of showing an empty frame.
  const brandMedia = async (id: unknown) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) return null;
    const m = (await c.env.DB.prepare('SELECT id, driver, storage_key, mime_type, original_name FROM media WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(n, business.id).first()) as
      | { id: number; driver: 'd1' | 'gateway'; storage_key: string; mime_type: string; original_name: string | null }
      | null;
    return m ? { id: m.id, url: mediaUrl(c.env, m), alt: m.original_name || 'Store photo' } : null;
  };
  return c.json({
    ok: true,
    business: {
      ...row,
      categories: cats,
      storefront: parseStorefront(row.settings as string | null),
      logo: await brandMedia(row.logo_media_id),
      cover: await brandMedia(row.cover_media_id),
    },
    quotas,
    storage_used_bytes: storage,
    // Which upload path the dashboard must use (Worker-stored vs cPanel gateway).
    driver: c.env.MEDIA_DRIVER === 'gateway' ? 'gateway' : 'd1',
    referral: { code, link: referralLink(c.env, code), credit_kobo: credit },
    // Set when the store is on a plan it was granted rather than one it paid
    // for. The dashboard uses it to say "no charge, never expires" instead of
    // showing a renewal date and a Pay Now button.
    entitlement: await entitlementFor(c.env, business.id),
  });
});

app.put('/business', async (c) => {
  const { business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const field = (col: string, v: unknown, max: number, required = false) => {
    const s = required ? reqStr(v, { min: 2, max }) : optStr(v, max);
    sets.push(`${col} = ?`);
    params.push(s);
  };
  field('name', body.name, 160, true);
  if (body.slug !== undefined) {
    const slug = reqStr(body.slug, { min: 2, max: 170 });
    assertSlugAvailable(slug);
    const taken = (await c.env.DB.prepare('SELECT id FROM businesses WHERE slug = ? AND id != ? AND deleted_at IS NULL').bind(slug, business.id).first()) as { id: number } | null;
    if (taken) throw conflict('This store name is already taken.');
    sets.push('slug = ?'); params.push(slug);
  }
  field('about', body.about, 5000);
  field('phone', body.phone, 30);
  field('email', body.email, 190);
  if (body.email && typeof body.email === 'string' && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim())) {
    throw validationError('Enter a valid email address.');
  }
  field('address', body.address, 255);
  field('city', body.city, 120);
  field('state_region', body.state_region, 120);
  if (body.website !== undefined) {
    const w = optStr(body.website, 255);
    if (w && !isHttpUrl(w)) throw validationError('Enter a valid website URL.');
    sets.push('website = ?'); params.push(w);
  }
  if (body.social !== undefined) {
    const social: Record<string, string> = {};
    if (typeof body.social === 'object' && body.social) {
      for (const k of ['facebook', 'instagram', 'x', 'threads', 'tiktok', 'youtube']) {
        const v = (body.social as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.trim()) {
          if (!isHttpUrl(v.trim())) throw validationError('Social link must be a valid URL.');
          social[k] = v.trim();
        }
      }
    }
    sets.push('social = ?'); params.push(JSON.stringify(social));
  }
  if (body.storefront !== undefined) {
    sets.push('settings = ?');
    params.push(JSON.stringify(parseStorefront(JSON.stringify(body.storefront))));
  }
  await c.env.DB.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`).bind(...params, business.id).run();
  return c.json({ ok: true });
});

/** Hide the store from the market without deleting it. Owner and manager only. */
app.post('/business/pause', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.paused !== 'boolean') throw badRequest('Say whether the store should be paused.');
  await c.env.DB.prepare('UPDATE businesses SET paused_at = ?, updated_at = ? WHERE id = ?')
    .bind(body.paused ? nowIso() : null, nowIso(), business.id).run();
  return c.json({ ok: true, paused: body.paused });
});

// ---------------------------------------------------------------- media

app.post('/media/token', async (c) => {
  const { business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  const body = await c.req.json().catch(() => null) || {};
  const kind = body.kind === 'cover' ? 'cover' : 'catalogue';
  await assertStorageQuota(c.env, business.id, 8 * 1048576); // assume one max-size image
  const maxBytes = 8 * 1048576;
  const tok = await issueUploadToken(c.env, business.id, { maxBytes, entityLabel: kind === 'cover' ? 'branding' : 'catalogue' });
  return c.json({ ok: true, ...tok });
});

/**
 * Direct upload for the D1 driver (dev/demo mode, and any deployment without
 * the cPanel gateway): the browser POSTs the image to the Worker, which
 * validates magic bytes + quota and stores the blob in D1.
 */
app.post('/media/upload', async (c) => {
  const env = c.env;
  const { user, business } = await requireVendor(env, c);
  assertBusinessWritable(business.status);
  const ct = c.req.header('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) throw badRequest('Upload the image file directly (multipart/form-data).');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw badRequest('Choose an image file (field "file").');
  if (file.size > 8 * 1048576) throw badRequest('Image must be 8MB or smaller.');
  await assertStorageQuota(env, business.id, file.size);
  const buf = await file.arrayBuffer();
  const mime = await magicMime(buf);
  if (!mime || !IMAGE_MIME.has(mime)) throw validationError('Only JPG, PNG or WEBP images are allowed.');
  const media = await storeD1Media(env, {
    businessId: business.id,
    userId: user.id,
    blob: buf,
    mime,
    originalName: file.name.slice(0, 255),
    visibility: 'public',
  });
  return c.json({ ok: true, media: { id: media.id, url: mediaUrl(env, media), size_bytes: media.size_bytes, driver: 'd1' } });
});

/**
 * Voice-note upload (MP3/M4A/OGG/WEBM/WAV). Kept separate from the image
 * route so the image contract (and its tests) stay untouched. Voice notes
 * are small; 8MB is far more than a few minutes of speech.
 */
app.post('/media/upload-audio', async (c) => {
  const env = c.env;
  const { user, business } = await requireVendor(env, c);
  assertBusinessWritable(business.status);
  const ct = c.req.header('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) throw badRequest('Upload the audio file directly (multipart/form-data).');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw badRequest('Choose an audio file (field "file").');
  if (file.size > 8 * 1048576) throw badRequest('Audio must be 8MB or smaller.');
  await assertStorageQuota(env, business.id, file.size);
  const buf = await file.arrayBuffer();
  const mime = await magicMime(buf);
  if (!mime || !AUDIO_MIME.has(mime)) throw validationError('Only MP3, M4A, OGG, WEBM or WAV audio is allowed.');
  const media = await storeD1Media(env, {
    businessId: business.id,
    userId: user.id,
    blob: buf,
    mime,
    originalName: file.name.slice(0, 255),
    visibility: 'public',
    kind: 'audio',
  });
  return c.json({ ok: true, media: { id: media.id, url: mediaUrl(env, media), size_bytes: media.size_bytes, kind: 'audio', driver: 'd1' } });
});

app.post('/media/finalize', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const body = await c.req.json().catch(() => null);
  if (!body) throw badRequest('Invalid request.');
  const mime = typeof body.mime === 'string' ? body.mime : '';
  if (!IMAGE_MIME.has(mime)) throw validationError('Only JPG, PNG or WEBP images are allowed.');
  const size = reqInt(body.size, { min: 1, max: 9 * 1048576 });
  await assertStorageQuota(c.env, business.id, size);
  const row = await finalizeGatewayUpload(c.env, {
    businessId: business.id,
        token: reqStr(body.token, { min: 50, max: 200 }),
    storageKey: reqStr(body.storage_key, { min: 10, max: 255 }),
    originalName: optStr(body.original_name, 255) ?? undefined,
    mime,
    size,
    width: body.width ? reqInt(body.width, { min: 1, max: 10000 }) : undefined,
    height: body.height ? reqInt(body.height, { min: 1, max: 10000 }) : undefined,
  });
  return c.json({ ok: true, media: { id: row.id, url: mediaUrl(c.env, row), size_bytes: row.size_bytes } });
});

app.get('/media', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT id, original_name, mime_type, size_bytes, width, height, visibility, status, driver, storage_key, created_at, entity_type, entity_id
     FROM media WHERE business_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  const used = await storageUsedBytes(c.env, business.id);
  const quotas = await effectiveQuotas(c.env, business.id);
  return c.json({
    ok: true,
    driver: c.env.MEDIA_DRIVER,
    media: rows.map((m) => ({ ...m, url: mediaUrl(c.env, { driver: m.driver as 'd1', storage_key: m.storage_key as string, id: m.id as number }) })),
    usage: { used_bytes: used, limit_mb: quotas.max_storage_mb, pct: quotas.max_storage_mb > 0 ? Math.min(100, Math.round((used / (quotas.max_storage_mb * 1048576)) * 100)) : 0 },
  });
});

app.delete('/media/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = await assertMediaOwnership(c.env, id, business.id);
  const refs = (await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM item_media WHERE media_id = ?
       UNION ALL SELECT 2 FROM businesses WHERE logo_media_id = ? OR cover_media_id = ?
       UNION ALL SELECT 3 FROM payments WHERE proof_media_id = ?) AS x`
  ).bind(id, id, id, id).first()) as { n: number };
  if (refs.n > 0) {
    await detachMedia(c.env, id);
    return c.json({ ok: true, detached: true, message: 'Removed from your items. The file is kept for 7 days before cleanup.' });
  }
  await softDeleteMedia(c.env, id);
  return c.json({ ok: true, deleted: true });
});

/**
 * Vendor picks logo/cover from their media library — or clears it
 * (`media_id: null`), which stores the storefront back to its wordmark.
 */
app.post('/business/media', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const field = (body as { field?: unknown }).field === 'cover' ? 'cover_media_id' : 'logo_media_id';
  const raw = (body as { media_id?: unknown }).media_id;

  if (raw === null || raw === undefined || raw === '' || raw === 0) {
    await c.env.DB.prepare(`UPDATE businesses SET ${field} = NULL WHERE id = ?`).bind(business.id).run();
    return c.json({ ok: true, cleared: field });
  }

  const mediaId = reqInt(raw, { min: 1 });
  await assertMediaOwnership(c.env, mediaId, business.id);
  await c.env.DB.prepare(`UPDATE businesses SET ${field} = ? WHERE id = ?`).bind(mediaId, business.id).run();
  return c.json({ ok: true, field });
});

// ---------------------------------------------------------------- catalogue

const ITEM_TYPES_CACHE_KEY = '__item_types__';
async function itemTypes(env: Env): Promise<Record<string, unknown>[]> {
  return (await env.DB.prepare('SELECT * FROM item_types WHERE is_active = 1 ORDER BY sort_order').all()).results as Record<string, unknown>[];
}

app.get('/item-types', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const types = await itemTypes(c.env);
  const cats = (await c.env.DB.prepare(
    `SELECT c.* FROM categories c JOIN business_categories bc ON bc.category_id = c.id WHERE bc.business_id = ? AND c.is_active = 1 AND c.deleted_at IS NULL`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, types, categories: cats });
});

app.get('/items', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const status = c.req.query('status') || 'all';
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 24;
  let where = `WHERE l.business_id = ? AND l.deleted_at IS NULL`;
  const params: (string | number)[] = [business.id];
  if (['draft', 'published', 'archived'].includes(status)) { where += ' AND l.status = ?'; params.push(status); }
  if (q) { where += ' AND (l.name LIKE ? OR l.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  const total = ((await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM listings l ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await c.env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.status, l.price, l.price_type, l.item_type_id, l.category_id, l.featured, l.stock_status, l.published_at, l.whatsapp_number_id,
            t.name AS type_name, t.slug AS type_slug, t.url_segment,
            c.name AS category_name, c.slug AS category_slug,
            (SELECT m.storage_key FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS storage_key0,
            (SELECT m.driver FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS driver0,
            (SELECT m.id FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS media_id0
     FROM listings l
     JOIN item_types t ON t.id = l.item_type_id
     LEFT JOIN categories c ON c.id = l.category_id
     ${where}
     ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const items = rows.map((r) => {
    const x = r as { media_id0: number | null; storage_key0: string | null; driver0: 'd1' | 'gateway' | null };
    return { ...r, image: x.media_id0 && x.storage_key0 && x.driver0 ? mediaUrl(c.env, { driver: x.driver0, storage_key: x.storage_key0, id: x.media_id0 }) : null };
  });
  return c.json({ ok: true, items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) });
});

interface ItemInput {
  name: string;
  slug: string | null;
  item_type_id: number;
  item_type_slug: string;
  category_id: number | null;
  description: string | null;
  price: number | null;
  price_type: string;
  custom_fields: string | null;
  stock_status: string;
  featured: boolean;
  inspection_json: string | null;
  whatsapp_number_id: number | null;
  seo_title: string | null;
  seo_description: string | null;
  publish: boolean;
  scheduled_publish_at: string | null;
}

async function parseItemBody(c: { env: Env }, businessId: number, body: unknown): Promise<ItemInput> {
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const b = body as Record<string, unknown>;
  const name = reqStr(b.name, { min: 2, max: 200 });
  const typeSlug = reqStr(b.item_type_slug, { min: 2, max: 60 });
  const type = (await c.env.DB.prepare('SELECT * FROM item_types WHERE slug = ? AND is_active = 1').bind(typeSlug).first()) as Record<string, unknown> | null;
  if (!type) throw validationError('Choose a valid item type.');

  let categoryId: number | null = null;
  let fieldSchema: string | null = null;
  if (b.category_slug) {
    const cat = (await c.env.DB.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1 AND deleted_at IS NULL').bind(String(b.category_slug).slice(0, 140)).first()) as Record<string, unknown> | null;
    if (!cat) throw validationError('Choose a valid category.');
    const linked = (await c.env.DB.prepare('SELECT 1 FROM business_categories WHERE business_id = ? AND category_id = ?').bind(businessId, (cat as { id: number }).id).first()) as { 1: number } | null;
    if (!linked) throw validationError('Your business is not in that category.');
    categoryId = (cat as { id: number }).id;
    fieldSchema = (cat as { field_schema: string }).field_schema;
  }

  let price: number | null = null;
  let priceType = (b.price_type as string) || 'fixed';
  if (!['fixed', 'from', 'negotiable', 'free'].includes(priceType)) priceType = 'fixed';
  if (priceType === 'fixed' || priceType === 'from') {
    price = parseMoneySafe(b.price_kobo);
    if (price === null) throw validationError('Enter a valid price.');
  } else if (priceType === 'free') {
    price = 0;
  } else {
    price = b.price_kobo !== undefined && b.price_kobo !== null ? parseMoneySafe(b.price_kobo) : null;
  }

  let stockStatus = (b.stock_status as string) || 'n_a';
  if (!['in_stock', 'out_of_stock', 'made_to_order', 'n_a'].includes(stockStatus)) stockStatus = 'n_a';

  let waNumberId: number | null = null;
  if (b.whatsapp_number_id) {
    const n = reqInt(b.whatsapp_number_id, { min: 1 });
    const row = (await c.env.DB.prepare('SELECT id FROM whatsapp_numbers WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(n, businessId).first()) as { id: number } | null;
    if (!row) throw validationError('Choose one of your WhatsApp numbers.');
    waNumberId = n;
  }

  const custom = validateCustomFields(fieldSchema, b.custom_fields);
  const publish = b.publish === true || b.status === 'published';
  let slug = optStr(b.slug, 210) || slugify(name);
  assertSlugAvailable(slug);

  const inspectionJson = parseInspection(b.inspection_notes ?? b.inspection_json);
  let scheduled: string | null = null;
  if (b.scheduled_publish_at) {
    const t = Date.parse(String(b.scheduled_publish_at));
    if (!Number.isFinite(t)) throw validationError('Pick a valid publish time.');
    if (t > Date.now() + 60_000) scheduled = new Date(t).toISOString();
  }

  return {
    name, slug, item_type_id: (type as { id: number }).id, item_type_slug: typeSlug, category_id: categoryId,
    description: optStr(b.description, 20000), price, price_type: priceType,
    custom_fields: JSON.stringify(custom), stock_status: stockStatus,
    featured: b.featured === true, inspection_json: inspectionJson, whatsapp_number_id: waNumberId,
    seo_title: optStr(b.seo_title, 200), seo_description: optStr(b.seo_description, 300),
    publish: scheduled ? false : publish,
    scheduled_publish_at: scheduled,
  };
}

async function assertPremiumItemGates(env: Env, businessId: number, input: ItemInput, listingId: number | null): Promise<void> {
  if (input.item_type_slug === 'job' || input.item_type_slug === 'cv') {
    await assertAddon(env, businessId, 'jobs_board', 'Jobs and CVs need the Jobs & CVs add-on. Buy it under Plan & billing. WhatsApp enquiries stay free.');
    const jobsCat = (await env.DB.prepare(`SELECT id FROM categories WHERE slug = 'jobs' AND deleted_at IS NULL`).first()) as { id: number } | null;
    if (jobsCat) {
      await env.DB.prepare(`INSERT OR IGNORE INTO business_categories (business_id, category_id) VALUES (?, ?)`).bind(businessId, jobsCat.id).run();
      if (!input.category_id) input.category_id = jobsCat.id;
    }
  }
  if (input.inspection_json) {
    await assertAddon(env, businessId, 'inspection_reports', 'Inspection reports need the Inspection reports add-on.');
  }
  await assertFeaturedSlot(env, businessId, listingId, input.featured);
}

async function attachMedia(env: Env, listingId: number, mediaIds: unknown, businessId: number): Promise<void> {
  if (!Array.isArray(mediaIds)) return;
  let pos = 0;
  for (const mid of mediaIds.slice(0, 12)) {
    const id = Number(mid);
    if (!Number.isInteger(id)) continue;
    const row = await assertMediaOwnership(env, id, businessId);
    if (!row.driver || row.kind !== 'image') continue;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO item_media (listing_id, media_id, position, is_primary) VALUES (?, ?, ?, ?)`
    ).bind(listingId, id, pos, pos === 0 ? 1 : 0).run();
    await env.DB.prepare(`UPDATE media SET entity_type = 'listing', entity_id = ?, status = 'attached' WHERE id = ?`).bind(listingId, id).run();
    pos++;
  }
}

/**
 * One voice note per listing. `null` clears it; a number must be an owned
 * audio media row (IDOR-checked like every other media attach).
 */
async function attachAudio(env: Env, listingId: number, audioMediaId: unknown, businessId: number): Promise<void> {
  if (audioMediaId === null) {
    await env.DB.prepare(`UPDATE listings SET audio_media_id = NULL WHERE id = ? AND business_id = ?`).bind(listingId, businessId).run();
    await env.DB.prepare(`UPDATE media SET entity_type = NULL, entity_id = NULL, status = 'unused' WHERE entity_type = 'listing' AND entity_id = ?`).bind(listingId).run();
    return;
  }
  const id = Number(audioMediaId);
  if (!Number.isInteger(id) || id < 1) return;
  const row = await assertMediaOwnership(env, id, businessId);
  if (row.kind !== 'audio') return;
  await env.DB.prepare(`UPDATE media SET entity_type = NULL, entity_id = NULL, status = 'unused' WHERE entity_type = 'listing' AND entity_id = ?`).bind(listingId).run();
  await env.DB.prepare(`UPDATE listings SET audio_media_id = ? WHERE id = ? AND business_id = ?`).bind(id, listingId, businessId).run();
  await env.DB.prepare(`UPDATE media SET entity_type = 'listing', entity_id = ?, status = 'attached' WHERE id = ?`).bind(listingId, id).run();
}

app.post('/items', async (c) => {
  const { business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  await assertListingQuota(c.env, business.id);
  const body = await c.req.json().catch(() => null);
  const input = await parseItemBody(c, business.id, body);
  await assertPremiumItemGates(c.env, business.id, input, null);
  // ensure slug uniqueness within business
  const taken = (await c.env.DB.prepare('SELECT id FROM listings WHERE business_id = ? AND slug = ? AND deleted_at IS NULL').bind(business.id, input.slug).first()) as { id: number } | null;
  let slug = input.slug;
  if (taken) slug = `${input.slug}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const status = input.publish ? 'published' : 'draft';
  const res = await c.env.DB.prepare(
    `INSERT INTO listings (business_id, category_id, item_type_id, name, slug, description, price, price_type, custom_fields, status, featured, stock_status, whatsapp_number_id, seo_title, seo_description, published_at, inspection_json, scheduled_publish_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(business.id, input.category_id, input.item_type_id, input.name, slug, input.description, input.price, input.price_type, input.custom_fields, status, input.featured ? 1 : 0, input.stock_status, input.whatsapp_number_id, input.seo_title, input.seo_description, input.publish ? nowIso() : null, input.inspection_json, input.scheduled_publish_at).run();
  const id = Number(res.meta.last_row_id);
  await attachMedia(c.env, id, (body as Record<string, unknown> | null)?.media_ids, business.id);
  await attachAudio(c.env, id, (body as Record<string, unknown> | null)?.audio_media_id, business.id);
  return c.json({ ok: true, id, slug, status });
});

/** Catalogue CSV export (Excel-friendly UTF-8 BOM). */
app.get('/items/export', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT l.id, l.name, l.slug, t.name AS type, l.price, l.currency, l.status, l.created_at,
            (SELECT COUNT(*) FROM analytics_events ae WHERE ae.listing_id = l.id AND ae.event_type = 'item_view') AS views,
            (SELECT COUNT(*) FROM analytics_events ae WHERE ae.listing_id = l.id AND ae.event_type = 'wa_click') AS wa_clicks
     FROM listings l JOIN item_types t ON t.id = l.item_type_id
     WHERE l.business_id = ? AND l.deleted_at IS NULL ORDER BY l.id`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return csvResponse(c, [
    ['id', 'name', 'slug', 'type', 'price_ngn', 'currency', 'status', 'views', 'whatsapp_clicks', 'created_at'],
    ...rows.map((r) => [String(r.id), String(r.name), String(r.slug), String(r.type), String(Number(r.price ?? 0) / 100), String(r.currency ?? 'NGN'), String(r.status), String(r.views ?? 0), String(r.wa_clicks ?? 0), String(r.created_at ?? '')]),
  ], `cybershop-${business.slug}-catalogue.csv`);
});

/** Leads CSV export. */
app.get('/inquiries/export', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT i.id, i.created_at, COALESCE(l.name, '') AS item, COALESCE(i.buyer_name, '') AS buyer,
            COALESCE(i.buyer_phone, '') AS phone, i.source, COALESCE(i.status, 'new') AS status
     FROM inquiries i LEFT JOIN listings l ON l.id = i.listing_id
     WHERE i.business_id = ? ORDER BY i.id DESC LIMIT 5000`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return csvResponse(c, [
    ['id', 'when', 'item', 'buyer', 'phone', 'source', 'status'],
    ...rows.map((r) => [String(r.id), String(r.created_at ?? ''), String(r.item), String(r.buyer), String(r.phone), String(r.source ?? ''), String(r.status)]),
  ], `cybershop-${business.slug}-leads.csv`);
});

app.get('/items/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = (await c.env.DB.prepare(
    `SELECT l.*, t.name AS type_name, t.slug AS type_slug, t.url_segment, c.name AS category_name, c.slug AS category_slug, c.field_schema
     FROM listings l JOIN item_types t ON t.id = l.item_type_id LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.id = ? AND l.business_id = ? AND l.deleted_at IS NULL`
  ).bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!row) throw notFound('Item not found.');
  const media = (await c.env.DB.prepare(
    `SELECT m.id, m.driver, m.storage_key, m.width, m.height, im.position, im.is_primary, im.alt_text FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = ? ORDER BY im.position`
  ).bind(id).all()).results as { id: number; driver: 'd1' | 'gateway'; storage_key: string; width: number | null; height: number | null; alt_text: string | null }[];
  const counts = (await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM analytics_events WHERE business_id = ? AND event_type = 'item_view' AND listing_id = ?) AS views,
            (SELECT COUNT(*) FROM inquiries WHERE business_id = ? AND listing_id = ?) AS inquiries`
  ).bind(business.id, id, business.id, id).first()) as { views: number; inquiries: number };
  let custom: Record<string, unknown> = {};
  try { custom = JSON.parse((row as { custom_fields: string | null }).custom_fields || '{}'); } catch { custom = {}; }
  const audioId = (row as { audio_media_id: number | null }).audio_media_id;
  const audio = audioId
    ? ((await c.env.DB.prepare(`SELECT id, driver, storage_key FROM media WHERE id = ? AND deleted_at IS NULL`).bind(audioId).first()) as { id: number; driver: 'd1' | 'gateway'; storage_key: string } | null)
    : null;
  return c.json({
    ok: true,
    item: {
      ...row,
      custom_fields: custom,
      images: media.map((m) => ({ id: m.id, url: mediaUrl(c.env, m), width: m.width, height: m.height, alt: m.alt_text })),
      audio: audio ? { id: audio.id, url: mediaUrl(c.env, audio) } : null,
      stats: counts,
    },
  });
});

app.put('/items/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const existing = (await c.env.DB.prepare('SELECT * FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!existing) throw notFound('Item not found.');
  const body = await c.req.json().catch(() => null);
  const input = await parseItemBody(c, business.id, body);
  await assertPremiumItemGates(c.env, business.id, input, id);
  const res = await c.env.DB.prepare(
    `UPDATE listings SET name = ?, slug = ?, category_id = ?, item_type_id = ?, description = ?, price = ?, price_type = ?, custom_fields = ?,
     stock_status = ?, featured = ?, whatsapp_number_id = ?, seo_title = ?, seo_description = ?, inspection_json = ?, scheduled_publish_at = ?,
     status = CASE WHEN ? THEN 'published' WHEN status = 'published' AND ? = 0 THEN 'draft' ELSE status END,
     published_at = COALESCE(published_at, CASE WHEN ? THEN ? ELSE NULL END)
     WHERE id = ?`
  ).bind(input.name, input.slug, input.category_id, input.item_type_id, input.description, input.price, input.price_type, input.custom_fields,
    input.stock_status, input.featured ? 1 : 0, input.whatsapp_number_id, input.seo_title, input.seo_description, input.inspection_json, input.scheduled_publish_at,
    input.publish ? 1 : 0, input.publish ? 1 : 0, input.publish ? 1 : 0, nowIso(), id).run();
  if (res.meta.changes === 0) throw notFound('Item not found.');
  // replace media set when provided
  if (Array.isArray((body as Record<string, unknown>)?.media_ids)) {
    await c.env.DB.prepare('DELETE FROM item_media WHERE listing_id = ?').bind(id).run();
    await attachMedia(c.env, id, (body as Record<string, unknown>).media_ids, business.id);
  }
  // voice note: present key means "set or clear" (null clears)
  if ((body as Record<string, unknown> | null) && 'audio_media_id' in (body as Record<string, unknown>)) {
    await attachAudio(c.env, id, (body as Record<string, unknown>).audio_media_id, business.id);
  }
  return c.json({ ok: true });
});

app.post('/items/:id/status', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const status = body?.status;
  if (!['draft', 'published', 'archived'].includes(String(status))) throw badRequest('Invalid status.');
  const res = await c.env.DB.prepare(
    `UPDATE listings SET status = ?, published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END WHERE id = ? AND business_id = ? AND deleted_at IS NULL`
  ).bind(status, status, nowIso(), id, business.id).run();
  if (res.meta.changes === 0) throw notFound('Item not found.');
  return c.json({ ok: true });
});

app.post('/items/:id/duplicate', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await assertListingQuota(c.env, business.id);
  const row = (await c.env.DB.prepare(
    `SELECT * FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL`
  ).bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!row) throw notFound('Item not found.');
  const l = row as { name: string; slug: string; category_id: number | null; item_type_id: number; description: string | null; price: number | null; price_type: string; custom_fields: string | null; stock_status: string; whatsapp_number_id: number | null; seo_title: string | null; seo_description: string | null };
  let slug = `${l.slug}-copy`;
  let i = 0;
  while ((await c.env.DB.prepare('SELECT id FROM listings WHERE business_id = ? AND slug = ? AND deleted_at IS NULL').bind(business.id, slug).first()) && i < 50) {
    slug = `${l.slug}-copy-${++i}`;
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO listings (business_id, category_id, item_type_id, name, slug, description, price, price_type, custom_fields, status, featured, stock_status, whatsapp_number_id, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?)`
  ).bind(business.id, l.category_id, l.item_type_id, `${l.name} (copy)`, slug, l.description, l.price, l.price_type, l.custom_fields, l.stock_status, l.whatsapp_number_id, l.seo_title, l.seo_description).run();
  const newId = Number(res.meta.last_row_id);
  const media = (await c.env.DB.prepare('SELECT media_id FROM item_media WHERE listing_id = ?').bind(id).all()).results as { media_id: number }[];
  let pos = 0;
  for (const m of media.slice(0, 12)) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO item_media (listing_id, media_id, position, is_primary) VALUES (?, ?, ?, ?)').bind(newId, m.media_id, pos, pos === 0 ? 1 : 0).run();
    pos++;
  }
  return c.json({ ok: true, id: newId, slug });
});

app.delete('/items/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare(`UPDATE listings SET deleted_at = ?, status = 'archived' WHERE id = ? AND business_id = ? AND deleted_at IS NULL`).bind(nowIso(), id, business.id).run();
  if (res.meta.changes === 0) throw notFound('Item not found.');
  const media = (await c.env.DB.prepare('SELECT media_id FROM item_media WHERE listing_id = ?').bind(id).all()).results as { media_id: number }[];
  for (const m of media) {
    const stillUsed = (await c.env.DB.prepare('SELECT 1 FROM item_media WHERE media_id = ? AND listing_id != ? LIMIT 1').bind(m.media_id, id).first()) as { 1: number } | null;
    if (!stillUsed) await detachMedia(c.env, m.media_id);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- whatsapp numbers

app.get('/whatsapp', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT * FROM whatsapp_numbers WHERE business_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, id').bind(business.id).all()).results as Record<string, unknown>[];
  const quotas = await effectiveQuotas(c.env, business.id);
  return c.json({ ok: true, numbers: rows, limit: quotas.max_whatsapp_numbers });
});

app.post('/whatsapp', async (c) => {
  const { business } = await requireVendor(c.env, c);
  await assertNumberQuota(c.env, business.id);
  const body = await c.req.json().catch(() => null);
  const number = normalizeWaNumber(String(body?.number || ''));
  const label = optStr(body?.label, 80) || 'General';
  const dup = (await c.env.DB.prepare('SELECT id FROM whatsapp_numbers WHERE business_id = ? AND number = ? AND deleted_at IS NULL').bind(business.id, number).first()) as { id: number } | null;
  if (dup) throw conflict('This number is already on your store.');
  const isFirst = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM whatsapp_numbers WHERE business_id = ? AND deleted_at IS NULL').bind(business.id).first()) as { n: number };
  await c.env.DB.prepare('INSERT INTO whatsapp_numbers (business_id, number, label, is_default) VALUES (?, ?, ?, ?)').bind(business.id, number, label, isFirst.n === 0 ? 1 : 0).run();
  return c.json({ ok: true });
});

app.put('/whatsapp/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const row = (await c.env.DB.prepare('SELECT * FROM whatsapp_numbers WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!row) throw notFound('Number not found.');
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (body?.label !== undefined) { sets.push('label = ?'); params.push(optStr(body.label, 80) || 'General'); }
  if (body?.is_default === true) {
    await c.env.DB.prepare('UPDATE whatsapp_numbers SET is_default = 0 WHERE business_id = ?').bind(business.id).run();
    sets.push('is_default = 1');
  }
  if (body?.route_category_id !== undefined) {
    if (body.route_category_id === null || body.route_category_id === '') {
      sets.push('route_category_id = NULL');
    } else {
      const catId = reqInt(body.route_category_id, { min: 1 });
      const linked = await c.env.DB.prepare('SELECT 1 FROM business_categories WHERE business_id = ? AND category_id = ?').bind(business.id, catId).first();
      if (!linked) throw validationError('Route only to a category your store is in.');
      sets.push('route_category_id = ?');
      params.push(catId);
    }
  }
  if (body?.route_item_type_id !== undefined) {
    if (body.route_item_type_id === null || body.route_item_type_id === '') {
      sets.push('route_item_type_id = NULL');
    } else {
      const typeId = reqInt(body.route_item_type_id, { min: 1 });
      const type = await c.env.DB.prepare('SELECT id FROM item_types WHERE id = ? AND is_active = 1').bind(typeId).first();
      if (!type) throw validationError('Unknown item type.');
      sets.push('route_item_type_id = ?');
      params.push(typeId);
    }
  }
  if (sets.length) await c.env.DB.prepare(`UPDATE whatsapp_numbers SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
  return c.json({ ok: true });
});

app.delete('/whatsapp/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const row = (await c.env.DB.prepare('SELECT * FROM whatsapp_numbers WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(id, business.id).first()) as { is_default: number } | null;
  if (!row) throw notFound('Number not found.');
  if (row.is_default) throw badRequest('Set another number as default before removing this one.');
  const usedBy = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM listings WHERE whatsapp_number_id = ? AND deleted_at IS NULL').bind(id).first()) as { n: number };
  if (usedBy.n > 0) {
    await c.env.DB.prepare(`UPDATE whatsapp_numbers SET status = 'disabled' WHERE id = ?`).bind(id).run();
    return c.json({ ok: true, disabled: true, message: `${usedBy.n} item(s) still route to this number — it was disabled, not removed.` });
  }
  await c.env.DB.prepare(`UPDATE whatsapp_numbers SET deleted_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- plans & payments

app.get('/plans', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const plans = (await c.env.DB.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order').all()).results as unknown as (PlanRow & { description: string | null; features: string | null })[];
  const addons = (await c.env.DB.prepare('SELECT * FROM addons WHERE is_active = 1 ORDER BY sort_order').all()).results as unknown as AddonRow[];
  const sub = (await c.env.DB.prepare(
    `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.business_id = ? ORDER BY s.id DESC LIMIT 1`
  ).bind(business.id).first()) as Record<string, unknown> | null;
  const myAddons = (await c.env.DB.prepare(
    `SELECT va.id, va.quantity, va.expires_at, a.name, a.slug, a.type FROM vendor_addons va JOIN addons a ON a.id = va.addon_id WHERE va.business_id = ? AND va.status = 'active'`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  const payments = (await c.env.DB.prepare(
    `SELECT id, reference, kind, amount, method, status, rejection_reason, submitted_at, created_at, plan_id, addon_id FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT 20`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  const quotas = await effectiveQuotas(c.env, business.id);
  const storage = await storageUsedBytes(c.env, business.id);
  const settings = (await c.env.DB.prepare('SELECT skey, svalue FROM platform_settings').all()).results as { skey: string; svalue: string }[];
  let bankAccounts: unknown = [];
  for (const r of settings) {
    if (r.skey === 'bank_accounts') {
      try { bankAccounts = r.svalue ? JSON.parse(r.svalue) : []; } catch { bankAccounts = []; }
      break;
    }
  }
  return c.json({
    ok: true,
    bank_accounts: bankAccounts,
    entitlement: await entitlementFor(c.env, business.id),
    plans: plans.map((p) => ({ ...p, price_display: formatNaira(p.price), features: safeJson(p.features) })),
    addons: addons.map((a) => ({ ...a, price_display: formatNaira(a.price) })),
    subscription: sub,
    my_addons: myAddons,
    payments: payments.map((p) => ({ ...p, amount_display: formatNaira(Number(p.amount)) })),
    usage: {
      storage_used_bytes: storage,
      storage_limit_mb: quotas.max_storage_mb,
      listings_used: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND deleted_at IS NULL').bind(business.id).first() as { n: number }).n,
      listings_limit: quotas.max_listings,
      whatsapp_used: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM whatsapp_numbers WHERE business_id = ? AND deleted_at IS NULL').bind(business.id).first() as { n: number }).n,
      whatsapp_limit: quotas.max_whatsapp_numbers,
    },
  });
});

/** Single payment (ownership-checked) — powers the printable receipt. */
app.get('/payments/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const p = (await c.env.DB.prepare(
    `SELECT p.*, pl.name AS plan_name, a.name AS addon_name FROM payments p
     LEFT JOIN plans pl ON pl.id = p.plan_id LEFT JOIN addons a ON a.id = p.addon_id
     WHERE p.id = ? AND p.business_id = ?`
  ).bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!p) throw notFound('Payment not found.');
  return c.json({ ok: true, payment: { ...p, amount_display: formatNaira(Number(p.amount)) } });
});

app.post('/payment-intent', async (c) => {
  const { user, business } = await requireVendor(c.env, c);
  assertBusinessWritable(business.status);
  const body = await c.req.json().catch(() => null);
  const method = body?.method === 'paystack' ? 'paystack' : 'bank_transfer';
  let payment;
  if (body?.plan_slug) {
    const plan = (await c.env.DB.prepare('SELECT * FROM plans WHERE slug = ? AND is_active = 1').bind(String(body.plan_slug).slice(0, 110)).first()) as (PlanRow & { is_default: number }) | null;
    if (!plan) throw notFound('Plan not found.');
    if (plan.price <= 0) {
      await activateFreePlan(c.env, business.id);
      return c.json({ ok: true, free: true, message: 'Your store is live on the free plan.' });
    }
    const kind = business.status === 'pending_payment' ? 'activation' : 'subscription_renewal';
    payment = await createPaymentIntent(c.env, { businessId: business.id, kind, plan, addon: null, method });
    if (payment.status === 'approved') {
      return c.json({ ok: true, payment: { id: payment.id, reference: payment.reference, amount: payment.amount, method: payment.method, status: payment.status }, settled_with_credit: true });
    }
  } else if (body?.addon_slug) {
    const addon = (await c.env.DB.prepare('SELECT * FROM addons WHERE slug = ? AND is_active = 1').bind(String(body.addon_slug).slice(0, 130)).first()) as AddonRow | null;
    if (!addon) throw notFound('Add-on not found.');
    payment = await createPaymentIntent(c.env, { businessId: business.id, kind: 'addon', plan: null, addon, method });
  } else {
    throw badRequest('Choose a plan or add-on.');
  }

  if (method === 'paystack') {
    const initiated = await initiatePaystack(c.env, {
      reference: payment.reference,
      amountKobo: payment.amount,
      email: user.email,
      name: user.name,
      meta: { business_id: String(business.id), kind: payment.kind },
    });
    if (initiated.paystackReference) {
      await c.env.DB.prepare('UPDATE payments SET paystack_reference = ? WHERE id = ?').bind(initiated.paystackReference, payment.id).run();
    }
    return c.json({ ok: true, payment: { id: payment.id, reference: payment.reference, amount: payment.amount, method }, paystack: initiated });
  }
  return c.json({ ok: true, payment: { id: payment.id, reference: payment.reference, amount: payment.amount, method, status: payment.status } });
});

/** Vendor uploads a bank transfer proof (multipart file ≤ 8MB). */
app.post('/payment-proof/:paymentId', async (c) => {
  const { user, business } = await requireVendor(c.env, c);
  const paymentId = reqInt(c.req.param('paymentId'), { min: 1 });
  const ct = c.req.header('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) throw badRequest('Upload the proof file directly (multipart/form-data).');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('proof');
  if (!(file instanceof File)) throw badRequest('Choose a proof file (screenshot or receipt).');
  if (file.size > 8 * 1048576) throw badRequest('Proof file must be 8MB or smaller.');
  const buf = await file.arrayBuffer();
  const mime = await magicMime(buf);
  if (!mime || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime)) {
    throw validationError('Upload a JPG, PNG, WEBP image or PDF.');
  }
  const payment = (await c.env.DB.prepare('SELECT * FROM payments WHERE id = ? AND business_id = ?').bind(paymentId, business.id).first()) as Record<string, unknown> | null;
  if (!payment) throw notFound('Payment not found.');
  if (payment.status !== 'pending') throw conflict('This payment can no longer be updated.');
  if (payment.method !== 'bank_transfer') throw badRequest('Proof upload is only for bank transfer payments.');
  const media = await storeD1Media(c.env, { businessId: business.id, userId: user.id, blob: buf, mime, originalName: file.name.slice(0, 255), visibility: 'private' });
  await submitBankProof(c.env, { paymentId, businessId: business.id, proofMediaId: media.id, vendor: user });
  return c.json({ ok: true, status: 'submitted', message: 'Proof received. An admin will verify it shortly.' });
});

// ---------------------------------------------------------------- leads & analytics

app.get('/inquiries', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const status = c.req.query('status') || 'all';
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 20;
  let where = 'WHERE i.business_id = ?';
  const params: (string | number)[] = [business.id];
  if (status !== 'all') { where += ' AND i.status = ?'; params.push(status); }
  const total = ((await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries i ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await c.env.DB.prepare(
    `SELECT i.*, l.name AS item_name FROM inquiries i LEFT JOIN listings l ON l.id = i.listing_id
     ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const inquiries = rows.map((r) => {
    let items: unknown = null;
    try {
      items = r.items_json ? JSON.parse(String(r.items_json)) : null;
    } catch {
      items = null;
    }
    return { ...r, items };
  });
  const countRows = (await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM inquiries WHERE business_id = ? GROUP BY status').bind(business.id).all()).results as { status: string; n: number }[];
  const counts: Record<string, number> = {};
  for (const row of countRows) counts[row.status] = row.n;
  return c.json({ ok: true, inquiries, total, page, pages: Math.max(1, Math.ceil(total / perPage)), counts });
});

app.put('/inquiries/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const sets: string[] = [];
  const params: (string | null)[] = [];
  let nextStatus: string | null = null;
  if (body.status !== undefined) {
    if (!['new', 'contacted', 'interested', 'negotiating', 'converted', 'lost'].includes(String(body.status))) {
      throw badRequest('Invalid status.');
    }
    nextStatus = String(body.status);
    sets.push('status = ?');
    params.push(nextStatus);
    if (String(body.status) !== 'new') {
      sets.push('first_response_at = COALESCE(first_response_at, ?)');
      params.push(nowIso());
    }
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    params.push(optStr(body.note, 2000));
  }
  if (body.follow_up_at !== undefined) {
    if (body.follow_up_at === null || body.follow_up_at === '') {
      sets.push('follow_up_at = NULL');
      sets.push('follow_up_notified_at = NULL');
    } else {
      const t = Date.parse(String(body.follow_up_at));
      if (!Number.isFinite(t)) throw badRequest('Follow-up time is not valid.');
      sets.push('follow_up_at = ?');
      params.push(new Date(t).toISOString());
      sets.push('follow_up_notified_at = NULL');
    }
  }
  if (sets.length === 0) throw badRequest('Nothing to update.');
  const res = await c.env.DB.prepare(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = ? AND business_id = ?`).bind(...params, id, business.id).run();
  if (res.meta.changes === 0) throw notFound('Inquiry not found.');
  if (nextStatus) {
    const lead = (await c.env.DB.prepare(
      `SELECT i.buyer_user_id, l.name AS item_name FROM inquiries i LEFT JOIN listings l ON l.id = i.listing_id WHERE i.id = ?`
    ).bind(id).first()) as { buyer_user_id: number | null; item_name: string | null } | null;
    if (lead?.buyer_user_id) {
      await notify(c.env, {
        userId: lead.buyer_user_id,
        type: 'inquiry.status',
        title: `Your enquiry is ${nextStatus}`,
        body: lead.item_name ? `${business.name} marked “${lead.item_name}” as ${nextStatus}.` : `${business.name} updated your enquiry to ${nextStatus}.`,
      });
    }
  }
  return c.json({ ok: true });
});

app.get('/overview', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const biz = (await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(business.id).first()) as Record<string, unknown> | null;
  const day = (days: number) => `datetime('now', '-${days} days')`;
  const views = (await c.env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN event_type='item_view' AND created_at > ? THEN 1 ELSE 0 END),0) AS items_7d,
    COALESCE(SUM(CASE WHEN event_type='storefront_view' AND created_at > ? THEN 1 ELSE 0 END),0) AS stores_7d,
    COALESCE(SUM(CASE WHEN event_type='wa_click' AND created_at > ? THEN 1 ELSE 0 END),0) AS clicks_7d,
    COALESCE(SUM(CASE WHEN event_type='item_view' THEN 1 ELSE 0 END),0) AS items_all,
    COALESCE(SUM(CASE WHEN event_type='storefront_view' THEN 1 ELSE 0 END),0) AS stores_all,
    COALESCE(SUM(CASE WHEN event_type='wa_click' THEN 1 ELSE 0 END),0) AS clicks_all
  FROM analytics_events WHERE business_id = ?`).bind(day(7), day(7), day(7), business.id).first()) as Record<string, number>;
  const counts = (await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM listings WHERE business_id = ? AND deleted_at IS NULL) AS items,
    (SELECT COUNT(*) FROM listings WHERE business_id = ? AND status = 'published' AND deleted_at IS NULL) AS published,
    (SELECT COUNT(*) FROM inquiries WHERE business_id = ?) AS inquiries,
    (SELECT COUNT(*) FROM inquiries WHERE business_id = ? AND status = 'new') AS new_leads,
    (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL) AS unread_notifications
  `).bind(business.id, business.id, business.id, business.id, (biz as { owner_user_id: number }).owner_user_id).first()) as Record<string, number>;
  const quotas = await effectiveQuotas(c.env, business.id);
  const storage = await storageUsedBytes(c.env, business.id);
  const sub = (await c.env.DB.prepare(
    `SELECT s.status, s.expires_at, s.grace_until, p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.business_id = ? ORDER BY s.id DESC LIMIT 1`
  ).bind(business.id).first()) as Record<string, unknown> | null;
  const pendingPayment = (await c.env.DB.prepare(`SELECT id, reference, amount, status FROM payments WHERE business_id = ? AND status IN ('pending','submitted') ORDER BY id DESC LIMIT 1`).bind(business.id).first()) as Record<string, unknown> | null;
  const topItems = (await c.env.DB.prepare(
    `SELECT l.name, l.slug, t.url_segment, COUNT(e.id) AS views,
            (SELECT COUNT(*) FROM analytics_events e2 WHERE e2.business_id = ? AND e2.listing_id = l.id AND e2.event_type = 'wa_click') AS clicks
     FROM analytics_events e JOIN listings l ON l.id = e.listing_id JOIN item_types t ON t.id = l.item_type_id
     WHERE e.business_id = ? AND e.event_type = 'item_view' AND e.created_at > ?
     GROUP BY l.id ORDER BY views DESC LIMIT 5`
  ).bind(business.id, business.id, day(30)).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    business: { id: business.id, name: (biz as { name: string }).name, slug: (biz as { slug: string }).slug, status: (biz as { status: string }).status, paused: !!(biz as { paused_at?: string | null }).paused_at },
    stats: views,
    counts,
    subscription: sub,
    pending_payment: pendingPayment ? { ...pendingPayment, amount_display: formatNaira(Number(pendingPayment.amount)) } : null,
    usage: { storage_used_bytes: storage, storage_limit_mb: quotas.max_storage_mb, items: counts.published, items_limit: quotas.max_listings, plan: quotas.plan_name },
    top_items: topItems,
    // The vendor's to-do list, ordered by what actually wins enquiries.
    completeness: await storeCompleteness(c.env, business.id),
  });
});

app.get('/notifications', async (c) => {
  const { user } = await requireVendor(c.env, c);
  const rows = (await c.env.DB.prepare('SELECT id, type, title, body, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').bind(user.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, notifications: rows });
});

app.post('/notifications/read', async (c) => {
  const { user } = await requireVendor(c.env, c);
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(nowIso(), user.id).run();
  return c.json({ ok: true });
});

function safeJson(v: string | null): unknown {
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}

function csvResponse(c: Context, rows: (string | number)[][], filename: string): Response {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

export default app;
