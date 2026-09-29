import { Hono } from 'hono';
import type { Env } from '../config';
import { rateLimit } from '../lib/ratelimit';
import { badRequest, forbidden, notFound, validationError } from '../lib/errors';
import { recordView, trackEvent } from '../lib/analytics';
import { getSession } from '../lib/auth';
import { mediaUrl, getMedia, storeD1Media, magicMime } from '../lib/media';
import { renderTemplate } from '../lib/wa';
import { formatNaira } from '../lib/money';
import { clampInt } from '../lib/util';
import { notify } from '../lib/notify';
import { publicPremium } from '../lib/premium';
import { resolveWhatsappNumber } from '../lib/routing';
import { blockedBusinessIds, isBlocked, notInClause } from '../lib/blocks';
import { reviewList, reviewSummary } from '../lib/reviews';
import { parseStorefront } from '../lib/storefront';

const app = new Hono<{ Bindings: Env }>();

const IP = (c: { req: { header(n: string): string | undefined | null } }) =>
  c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

/** Live in the market: paid/approved, not deleted, not paused by the vendor. */
const LIVE = `b.status = 'active' AND b.deleted_at IS NULL AND b.paused_at IS NULL`;

function isPubliclyLive(biz: { status?: string; paused_at?: string | null }): boolean {
  return biz.status === 'active' && !biz.paused_at;
}

async function viewerManages(env: Env, userId: number | undefined, biz: { id: number; owner_user_id?: number }): Promise<boolean> {
  if (!userId) return false;
  if (biz.owner_user_id && userId === biz.owner_user_id) return true;
  const mem = await env.DB.prepare(`SELECT 1 AS ok FROM business_members WHERE business_id = ? AND user_id = ? AND status = 'active'`).bind(biz.id, userId).first();
  return !!mem;
}

interface SchemaField { key?: string; label?: string; type?: string; options?: unknown }

/** Category select/boolean filters. Keys are schema-validated so they cannot inject SQL. */
async function listingFieldFilter(env: Env, catSlug: string, sp: URLSearchParams): Promise<{ sql: string; params: string[]; filters: { key: string; label: string; options: string[] }[] }> {
  if (!catSlug) return { sql: '', params: [], filters: [] };
  const row = (await env.DB.prepare('SELECT field_schema FROM categories WHERE slug = ? AND deleted_at IS NULL').bind(catSlug).first()) as { field_schema: string } | null;
  if (!row) return { sql: '', params: [], filters: [] };
  let schema: SchemaField[] = [];
  try { schema = JSON.parse(row.field_schema) as SchemaField[]; } catch { schema = []; }
  const filters: { key: string; label: string; options: string[] }[] = [];
  const bits: string[] = [];
  const params: string[] = [];
  for (const f of schema) {
    const key = typeof f.key === 'string' ? f.key : '';
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) continue;
    if (f.type !== 'select' && f.type !== 'boolean') continue;
    const options = f.type === 'boolean'
      ? ['Yes', 'No']
      : (Array.isArray(f.options) ? f.options.map((o) => String(o)).filter(Boolean).slice(0, 24) : []);
    if (!options.length) continue;
    filters.push({ key, label: typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 80) : key, options });
    const raw = sp.get(`cf_${key}`)?.trim().slice(0, 80) || '';
    if (!raw || !options.includes(raw)) continue;
    const path = `$.${key}`;
    if (f.type === 'boolean') {
      bits.push(raw === 'Yes'
        ? `CAST(json_extract(l.custom_fields, ?) AS TEXT) IN ('true','1','Yes')`
        : `CAST(json_extract(l.custom_fields, ?) AS TEXT) IN ('false','0','No')`);
      params.push(path);
    } else {
      bits.push(`CAST(json_extract(l.custom_fields, ?) AS TEXT) = ?`);
      params.push(path, raw);
    }
  }
  return { sql: bits.length ? ` AND ${bits.join(' AND ')}` : '', params, filters };
}

async function blockFilter(c: Parameters<typeof getSession>[1], column = 'b.id') {
  const user = await getSession(c.env, c);
  const ids = await blockedBusinessIds(c.env, user?.id);
  return notInClause(ids, column);
}

async function platformSettings(env: Env): Promise<Record<string, unknown>> {
  const rows = (await env.DB.prepare('SELECT skey, svalue FROM platform_settings').all()).results as { skey: string; svalue: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try { out[r.skey] = r.svalue ? JSON.parse(r.svalue) : null; } catch { out[r.skey] = r.svalue; }
  }
  return out;
}

/** Serialize a listing for public pages. */
async function publicItem(env: Env, listing: Record<string, unknown>): Promise<Record<string, unknown>> {
  const l = listing as {
    id: number; business_id: number; item_type_id: number; name: string; slug: string; description: string | null;
    price: number | null; currency: string; price_type: string; custom_fields: string | null;
    stock_status: string; seo_title: string | null; seo_description: string | null; published_at: string | null;
    type_name: string; type_slug: string; url_segment: string; cta_label: string; seo_schema_type: string;
    template_key: string; featured?: number; inspection_json?: string | null;
  };
  const media = (await env.DB.prepare(
    `SELECT m.id, m.mime_type, m.size_bytes, m.width, m.height, m.original_name, m.driver, m.storage_key, m.visibility, im.position, im.is_primary, im.alt_text
     FROM item_media im JOIN media m ON m.id = im.media_id
     WHERE im.listing_id = ? ORDER BY im.position ASC, m.id ASC`
  ).bind(l.id).all()).results as { id: number; mime_type: string; driver: string; storage_key: string; width: number | null; height: number | null; is_primary: number; alt_text: string | null }[];
  const images = media.map((m) => ({ id: m.id, url: mediaUrl(env, { driver: m.driver as 'd1', storage_key: m.storage_key, id: m.id }), width: m.width, height: m.height, alt: m.alt_text || l.name, primary: !!m.is_primary }));
  let custom: Record<string, unknown> = {};
  try { custom = JSON.parse(l.custom_fields || '{}'); } catch { custom = {}; }
  let inspection: { notes: string } | null = null;
  try {
    if (l.inspection_json) inspection = JSON.parse(l.inspection_json) as { notes: string };
  } catch { inspection = null; }
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    description: l.description,
    price_kobo: l.price,
    price_display: l.price_type === 'negotiable' ? 'Price on request' : l.price_type === 'free' ? 'Free' : formatNaira(l.price),
    price_type: l.price_type,
    currency: l.currency,
    stock_status: l.stock_status,
    custom_fields: custom,
    images,
    url_segment: l.url_segment,
    type_slug: l.type_slug,
    cta_label: l.cta_label,
    schema_type: l.seo_schema_type,
    seo: { title: l.seo_title || l.name, description: l.seo_description },
    published_at: l.published_at,
    featured: !!l.featured,
    inspection,
  };
}

async function publicBusiness(env: Env, biz: Record<string, unknown>): Promise<Record<string, unknown>> {
  const b = biz as { id: number; name: string; slug: string; about: string | null; description: string | null; city: string | null; state_region: string | null; address?: string | null; phone: string | null; website: string | null; social: string | null; settings?: string | null; status: string; logo_media_id: number | null; cover_media_id: number | null; verification_status?: string; created_at?: string | null };
  const cats = (await env.DB.prepare(
    `SELECT c.name, c.slug, c.icon FROM business_categories bc JOIN categories c ON c.id = bc.category_id WHERE bc.business_id = ?`
  ).bind(b.id).all()).results as { name: string; slug: string; icon: string }[];
  const logo = b.logo_media_id ? await getMedia(env, b.logo_media_id) : null;
  const cover = b.cover_media_id ? await getMedia(env, b.cover_media_id) : null;
  let social: Record<string, string> = {};
  try { social = JSON.parse(b.social || '{}'); } catch { social = {}; }
  const waNumber = (await env.DB.prepare(
    `SELECT number FROM whatsapp_numbers WHERE business_id = ? AND is_default = 1 AND status = 'active' AND deleted_at IS NULL ORDER BY id LIMIT 1`
  ).bind(b.id).first()) as { number: string } | null;
  const listingCount = ((await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND status = 'published' AND deleted_at IS NULL`
  ).bind(b.id).first()) as { n: number }).n;
  const premium = await publicPremium(env, b.id, (b.verification_status as string | undefined) ?? 'unverified');
  const reviews = await reviewSummary(env, b.id);
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    about: b.about || b.description,
    city: b.city,
    state_region: b.state_region,
    address: b.address ?? null,
    phone: b.phone,
    storefront: parseStorefront(b.settings),
    website: b.website,
    social,
    status: b.status,
    verification_status: b.verification_status ?? 'unverified',
    paused: !!(b as { paused_at?: string | null }).paused_at,
    featured: !!(b as { is_featured?: number }).is_featured,
    created_at: b.created_at ?? null,
    listing_count: listingCount,
    categories: cats,
    whatsapp_number: waNumber?.number ?? null,
    logo: logo ? { url: mediaUrl(env, logo), alt: b.name } : null,
    cover: cover ? { url: mediaUrl(env, cover) } : null,
    premium,
    reviews,
  };
}

/** Lightweight platform settings (footer/legal/contact surfaces). */
app.get('/site', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT skey, svalue FROM platform_settings').all()).results as { skey: string; svalue: string }[];
  const get = (k: string): string | null => {
    const r = rows.find((x) => x.skey === k);
    if (!r || !r.svalue) return null;
    try { return (JSON.parse(r.svalue) as { value?: string }).value ?? r.svalue; } catch { return r.svalue; }
  };
  return c.json({
    ok: true,
    site: {
      name: get('platform_name') || 'CyberShop',
      tagline: get('platform_tagline') || 'Find a business. Talk to it on WhatsApp.',
      support_email: get('support_email') || 'support@cybershop.ng',
      whatsapp_support: get('support_whatsapp'),
    },
  });
});

app.get('/home', async (c) => {
  const env = c.env;
  const settings = await platformSettings(env);
  const categories = (await env.DB.prepare('SELECT name, slug, description, icon FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order').all()).results as Record<string, unknown>[];
  const blocked = await blockFilter(c);
  const featured = (await env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.about, b.city, b.state_region, b.logo_media_id, b.cover_media_id, b.status, b.verification_status, b.created_at
     FROM businesses b WHERE ${LIVE}${blocked.sql}
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT 12`
  ).bind(...blocked.params).all()).results as Record<string, unknown>[];
  const bizRows = featured.length
    ? (await Promise.all(featured.map((b) => publicBusiness(env, b))))
    : [];
  const bizCount = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM businesses b WHERE ${LIVE}`).first()) as { n: number };
  return c.json({ ok: true, platform: settings.platform, categories, businesses: bizRows, business_count: bizCount.n });
});

app.get('/businesses', async (c) => {
  const env = c.env;
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const cat = c.req.query('category')?.trim().slice(0, 60) || '';
  const city = c.req.query('city')?.trim().slice(0, 80) || '';
  const page = clampInt(c.req.query('page'), 1, 1000, 1);
  const perPage = 24;
  const blockedBiz = await blockFilter(c);
  let where = `WHERE ${LIVE}${blockedBiz.sql}`;
  const params: (string | number)[] = [...blockedBiz.params];
  if (q) { where += ` AND (b.name LIKE ? OR b.about LIKE ? OR b.city LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (cat) { where += ` AND EXISTS (SELECT 1 FROM business_categories bc WHERE bc.business_id = b.id AND bc.category_id = (SELECT id FROM categories WHERE slug = ?))`; params.push(cat); }
  if (city) { where += ` AND LOWER(b.city) = LOWER(?)`; params.push(city); }
  const total = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM businesses b ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await env.DB.prepare(`SELECT b.* FROM businesses b ${where} ORDER BY b.is_featured DESC, b.created_at DESC LIMIT ? OFFSET ?`).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const businesses = await Promise.all(rows.map((b) => publicBusiness(env, b)));
  return c.json({ ok: true, businesses, total, page, pages: Math.max(1, Math.ceil(total / perPage)) });
});

app.get('/categories/:slug', async (c) => {
  const env = c.env;
  const cat = (await env.DB.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1 AND deleted_at IS NULL').bind(c.req.param('slug')).first()) as Record<string, unknown> | null;
  if (!cat) throw notFound('Category not found.');
  const page = clampInt(c.req.query('page'), 1, 1000, 1);
  const perPage = 24;
  const blockedCat = await blockFilter(c);
  const rows = (await env.DB.prepare(
    `SELECT b.* FROM businesses b JOIN business_categories bc ON bc.business_id = b.id
     WHERE bc.category_id = ? AND ${LIVE}${blockedCat.sql}
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT ? OFFSET ?`
  ).bind((cat as { id: number }).id, ...blockedCat.params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const businesses = await Promise.all(rows.map((b) => publicBusiness(env, b)));
  return c.json({ ok: true, category: { name: cat.name, slug: cat.slug, description: cat.description, icon: cat.icon }, businesses, page, pages: 1 });
});

/** Storefront data (server-side, no auth). */
app.get('/business/:slug', async (c) => {
  const env = c.env;
  const biz = (await env.DB.prepare('SELECT * FROM businesses WHERE slug = ? AND deleted_at IS NULL').bind(c.req.param('slug')).first()) as Record<string, unknown> | null;
  if (!biz) throw notFound('Business not found.');
  const viewer = await getSession(env, c);
  if (await isBlocked(env, viewer?.id, (biz as { id: number }).id)) throw notFound('Business not found.');
  const live = isPubliclyLive(biz as { status: string; paused_at: string | null });
  const manages = await viewerManages(env, viewer?.id, biz as { id: number; owner_user_id: number });
  if (!live && !manages) {
    const closed = await publicBusiness(env, biz);
    return c.json({
      ok: true,
      unavailable: true,
      unavailable_reason: (biz as { paused_at?: string | null }).paused_at ? 'paused' : (biz as { status: string }).status,
      business: { ...closed, phone: null, whatsapp_number: null },
      items: [],
      offers: [],
    });
  }
  await trackEvent(env, c, { businessId: (biz as { id: number }).id, eventType: 'storefront_view' });
  const section = c.req.query('section') || 'items';
  const business = await publicBusiness(env, biz);
  const items: Record<string, unknown>[] = [];
  if (section === 'items' || section === 'all') {
    const rows = (await env.DB.prepare(
      `SELECT l.*, t.name AS type_name, t.slug AS type_slug, t.url_segment, t.cta_label, t.seo_schema_type, t.whatsapp_template_key AS template_key
       FROM listings l JOIN item_types t ON t.id = l.item_type_id
       WHERE l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL
       ORDER BY l.featured DESC, l.published_at DESC LIMIT 96`
    ).bind((biz as { id: number }).id).all()).results as Record<string, unknown>[];
    for (const r of rows) items.push(await publicItem(env, r));
  }
  const offers = (await env.DB.prepare(
    `SELECT o.id, o.title, o.description, o.kind, o.value, o.value_type, o.ends_at FROM offers o
     WHERE o.business_id = ? AND o.is_active = 1 AND (o.ends_at IS NULL OR o.ends_at > datetime('now')) LIMIT 8`
  ).bind((biz as { id: number }).id).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    business,
    items,
    offers,
    unavailable: !live,
    preview: !live && manages,
    unavailable_reason: live ? null : ((biz as { paused_at?: string | null }).paused_at ? 'paused' : (biz as { status: string }).status),
  });
});

/** Item data + ready-to-open WhatsApp link. */
app.get('/item', async (c) => {
  const env = c.env;
  const bizSlug = c.req.query('biz')?.slice(0, 170) || '';
  const segment = c.req.query('segment')?.slice(0, 60) || '';
  const itemSlug = c.req.query('slug')?.slice(0, 210) || '';
  const biz = (await env.DB.prepare('SELECT * FROM businesses WHERE slug = ? AND deleted_at IS NULL').bind(bizSlug).first()) as Record<string, unknown> | null;
  if (!biz) throw notFound('Business not found.');
  const item = (await env.DB.prepare(
    `SELECT l.*, t.name AS type_name, t.slug AS type_slug, t.url_segment, t.cta_label, t.seo_schema_type, t.whatsapp_template_key AS template_key
     FROM listings l JOIN item_types t ON t.id = l.item_type_id
     WHERE l.business_id = ? AND t.url_segment = ? AND l.slug = ? AND l.deleted_at IS NULL`
  ).bind((biz as { id: number }).id, segment, itemSlug).first()) as Record<string, unknown> | null;
  if (!item) throw notFound('Item not found.');
  if ((item as { status: string }).status !== 'published') throw notFound('Item not available.');
  const user = await getSession(env, c);
  if (!isPubliclyLive(biz as { status: string; paused_at: string | null }) && !(await viewerManages(env, user?.id, biz as { id: number; owner_user_id: number }))) {
    throw notFound('Item not available.');
  }
  if (await isBlocked(env, user?.id, (biz as { id: number }).id)) throw notFound('Item not found.');
  await trackEvent(env, c, { businessId: (biz as { id: number }).id, eventType: 'item_view', listingId: (item as { id: number }).id, userId: user?.id ?? null });
  await recordView(env, user?.id ?? null, (item as { id: number }).id);
  const data = await publicItem(env, item);

  // item pin → type route → category route → store default
  const routed = await resolveWhatsappNumber(env, (biz as { id: number }).id, {
    whatsapp_number_id: (item as { whatsapp_number_id: number | null }).whatsapp_number_id,
    item_type_id: (item as { item_type_id: number }).item_type_id,
    category_id: (item as { category_id: number | null }).category_id,
  });
  const number = routed?.number ?? null;

  const business = await publicBusiness(env, biz);
  const dataUrl = `${env.APP_URL}/business/${(biz as { slug: string }).slug}/${segment}/${itemSlug}`;
  let wa: { url: string | null; number: string | null; message: string };
  if (number) {
    const typeId = (item as { item_type_id: number }).item_type_id;
    const bizId = (biz as { id: number }).id;
    const template =
      ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id = ? AND item_type_id = ? LIMIT 1').bind(bizId, typeId).first()) as { body: string } | null) ||
      ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id IS NULL AND item_type_id = ? LIMIT 1').bind(typeId).first()) as { body: string } | null) ||
      ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id IS NULL AND item_type_id IS NULL LIMIT 1').first()) as { body: string } | null);
    let custom: Record<string, unknown> = {};
    try { custom = JSON.parse((item as { custom_fields: string | null }).custom_fields || '{}'); } catch { custom = {}; }
    const message = renderTemplate(template ? template.body : 'Hello {{business_name}}, I am interested in {{item_name}}. Page: {{item_url}}', {
      business_name: (biz as { name: string }).name,
      business_url: `${env.APP_URL}/business/${(biz as { slug: string }).slug}`,
      item_name: (item as { name: string }).name,
      item_url: dataUrl,
      price: (item as { price: number | null }).price !== null ? formatNaira((item as { price: number | null }).price) : 'Price on request',
      quantity: '1',
      ...custom,
    });
    wa = { url: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, number, message };
  } else {
    wa = { url: null, number: null, message: '' };
  }

  // voice note (vendor-recorded description), if attached
  const audioId = (item as { audio_media_id: number | null }).audio_media_id;
  const audioRow = audioId
    ? ((await env.DB.prepare(`SELECT id, driver, storage_key, size_bytes FROM media WHERE id = ? AND deleted_at IS NULL`).bind(audioId).first()) as { id: number; driver: 'd1' | 'gateway'; storage_key: string; size_bytes: number } | null)
    : null;
  const audio = audioRow ? { url: mediaUrl(env, audioRow), size_bytes: audioRow.size_bytes } : null;

  const relatedRows = (await env.DB.prepare(
    `SELECT l.*, t.name AS type_name, t.slug AS type_slug, t.url_segment, t.cta_label, t.seo_schema_type, t.whatsapp_template_key AS template_key
     FROM listings l JOIN item_types t ON t.id = l.item_type_id
     WHERE l.business_id = ? AND l.id != ? AND l.status = 'published' AND l.deleted_at IS NULL
     ORDER BY l.featured DESC, l.published_at DESC LIMIT 8`
  ).bind((biz as { id: number }).id, (item as { id: number }).id).all()).results as Record<string, unknown>[];
  const related: Record<string, unknown>[] = [];
  for (const r of relatedRows) related.push(await publicItem(env, r));

  const views = ((await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM analytics_events WHERE listing_id = ? AND event_type = 'item_view'`
  ).bind((item as { id: number }).id).first()) as { n: number }).n;

  const catId = (item as { category_id: number | null }).category_id;
  const similarRows = (await env.DB.prepare(
    `SELECT l.*, t.name AS type_name, t.slug AS type_slug, t.url_segment, t.cta_label, t.seo_schema_type, t.whatsapp_template_key AS template_key,
            b.slug AS biz_slug, b.name AS biz_name, b.city
     FROM listings l JOIN item_types t ON t.id = l.item_type_id JOIN businesses b ON b.id = l.business_id
     WHERE l.id != ? AND l.status = 'published' AND l.deleted_at IS NULL AND ${LIVE}
       AND (${catId ? 'l.category_id = ?' : 'l.item_type_id = ?'})
     ORDER BY l.featured DESC, l.published_at DESC LIMIT 8`
  ).bind((item as { id: number }).id, catId ?? (item as { item_type_id: number }).item_type_id).all()).results as Record<string, unknown>[];
  const similar: Record<string, unknown>[] = [];
  for (const r of similarRows) {
    const it = await publicItem(env, r);
    similar.push({ ...it, biz_slug: r.biz_slug, biz_name: r.biz_name, city: r.city });
  }

  const variantRows = (await env.DB.prepare(
    `SELECT id, name, options, price_override, stock_qty FROM listing_variants WHERE listing_id = ? AND is_active = 1 ORDER BY id`
  ).bind((item as { id: number }).id).all()).results as { id: number; name: string; options: string; price_override: number | null; stock_qty: number | null }[];
  const variants = variantRows.map((v) => {
    let options: string[] = [];
    try { options = JSON.parse(v.options) as string[]; } catch { options = []; }
    return { id: v.id, name: v.name, options, price_kobo: v.price_override, price_display: v.price_override != null ? formatNaira(v.price_override) : null, stock_qty: v.stock_qty };
  });
  const listingReviews = await reviewSummary(env, (biz as { id: number }).id, (item as { id: number }).id);
  const reviewItems = await reviewList(env, (item as { id: number }).id);

  return c.json({
    ok: true,
    item: { ...data, audio, views, variants, reviews: { ...listingReviews, items: reviewItems } },
    business,
    wa,
    related,
    similar,
  });
});

/** Distinct cities with live stores — location-first discovery (Jiji-style). */
app.get('/cities', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT b.city AS city, COUNT(*) AS n FROM businesses b
     WHERE ${LIVE} AND b.city IS NOT NULL AND TRIM(b.city) != ''
     GROUP BY b.city ORDER BY n DESC, b.city ASC LIMIT 40`
  ).all()).results as { city: string; n: number }[];
  return c.json({ ok: true, cities: rows });
});

/**
 * Classifieds feed: published listings across the market.
 * Filters: q, city, category, min/max price (kobo), sort.
 */
app.get('/listings', async (c) => {
  const env = c.env;
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const city = c.req.query('city')?.trim().slice(0, 80) || '';
  const cat = c.req.query('category')?.trim().slice(0, 60) || '';
  const type = c.req.query('type')?.trim().slice(0, 40) || '';
  const sort = (c.req.query('sort') || 'newest').slice(0, 20);
  const minPrice = c.req.query('min_price') ? Number(c.req.query('min_price')) : null;
  const maxPrice = c.req.query('max_price') ? Number(c.req.query('max_price')) : null;
  const page = clampInt(c.req.query('page'), 1, 500, 1);
  const perPage = 24;
  const blockedList = await blockFilter(c);
  let where = `WHERE l.status = 'published' AND l.deleted_at IS NULL AND ${LIVE}${blockedList.sql}`;
  const params: (string | number)[] = [...blockedList.params];
  if (q) { where += ` AND (l.name LIKE ? OR l.description LIKE ? OR b.name LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (city) { where += ` AND LOWER(b.city) = LOWER(?)`; params.push(city); }
  if (cat) { where += ` AND EXISTS (SELECT 1 FROM categories c WHERE c.id = l.category_id AND c.slug = ?)`; params.push(cat); }
  if (type) { where += ` AND EXISTS (SELECT 1 FROM item_types t0 WHERE t0.id = l.item_type_id AND t0.slug = ?)`; params.push(type); }
  if (minPrice !== null && Number.isFinite(minPrice) && minPrice >= 0) { where += ` AND l.price IS NOT NULL AND l.price >= ?`; params.push(Math.round(minPrice)); }
  if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice >= 0) { where += ` AND l.price IS NOT NULL AND l.price <= ?`; params.push(Math.round(maxPrice)); }
  if (c.req.query('stock') === 'in_stock') where += ` AND l.stock_status = 'in_stock'`;
  const fields = await listingFieldFilter(env, cat, new URL(c.req.url).searchParams);
  where += fields.sql;
  params.push(...fields.params);
  const minRating = c.req.query('min_rating') ? Number(c.req.query('min_rating')) : null;
  if (minRating !== null && Number.isFinite(minRating) && minRating >= 1 && minRating <= 5) {
    where += ` AND (SELECT AVG(rating) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'published') >= ?`;
    params.push(minRating);
  }
  const order =
    sort === 'price_asc' ? `l.price IS NULL, l.price ASC, l.published_at DESC` :
    sort === 'price_desc' ? `l.price IS NULL, l.price DESC, l.published_at DESC` :
    sort === 'rating' ? `(SELECT AVG(rating) FROM reviews r WHERE r.listing_id = l.id AND r.status = 'published') DESC, l.published_at DESC` :
    `l.featured DESC, l.published_at DESC`;
  const total = ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings l JOIN businesses b ON b.id = l.business_id ${where}`).bind(...params).first()) as { n: number }).n;
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.price, l.price_type, l.published_at, l.featured, t.url_segment, t.slug AS type_slug,
            b.slug AS biz_slug, b.name AS biz_name, b.city, b.verification_status,
            (SELECT m2.storage_key FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS storage_key0,
            (SELECT m2.driver FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS driver0,
            (SELECT m2.id FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS media_id0
     FROM listings l JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).bind(...params, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const items = rows.map((it) => {
    const i = it as { id: number; name: string; slug: string; price: number | null; price_type: string; published_at: string | null; featured: number; url_segment: string; type_slug: string; biz_slug: string; biz_name: string; city: string | null; verification_status: string; storage_key0: string | null; driver0: 'd1' | 'gateway' | null; media_id0: number | null };
    return {
      id: i.id, name: i.name, slug: i.slug, url_segment: i.url_segment, type_slug: i.type_slug,
      biz_slug: i.biz_slug, biz_name: i.biz_name, city: i.city,
      verified: i.verification_status === 'verified',
      boosted: !!i.featured,
      published_at: i.published_at,
      price_kobo: i.price,
      price_display: i.price_type === 'negotiable' ? 'Price on request' : i.price_type === 'free' ? 'Free' : formatNaira(i.price),
      image: i.media_id0 && i.storage_key0 && i.driver0 ? mediaUrl(env, { driver: i.driver0, storage_key: i.storage_key0, id: i.media_id0 }) : null,
    };
  });
  return c.json({ ok: true, items, total, page, pages: Math.max(1, Math.ceil(total / perPage)), field_filters: fields.filters });
});

/** Guest-friendly report (Jiji “Report Abuse”). Login optional. */
app.post('/reports', async (c) => {
  const env = c.env;
  const ip = IP(c);
  await rateLimit(env, 'report', ip, 8, 3600);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const entityType = String((body as { entity_type?: string }).entity_type || '');
  if (!['business', 'listing'].includes(entityType)) throw validationError('Invalid report target.');
  const entityId = Number((body as { entity_id?: number }).entity_id);
  if (!Number.isInteger(entityId) || entityId < 1) throw validationError('Invalid report target.');
  const reason = String((body as { reason?: string }).reason || 'other');
  if (!['spam', 'fraud', 'misleading', 'abusive', 'other'].includes(reason)) throw validationError('Choose a reason.');
  const details = typeof (body as { details?: unknown }).details === 'string' ? (body as { details: string }).details.trim().slice(0, 2000) : null;
  if (entityType === 'listing') {
    const row = (await env.DB.prepare('SELECT id FROM listings WHERE id = ? AND deleted_at IS NULL').bind(entityId).first()) as { id: number } | null;
    if (!row) throw notFound('Listing not found.');
  } else {
    const row = (await env.DB.prepare('SELECT id FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(entityId).first()) as { id: number } | null;
    if (!row) throw notFound('Business not found.');
  }
  const user = await getSession(env, c);
  await env.DB.prepare(
    `INSERT INTO reports (reporter_user_id, entity_type, entity_id, reason, details) VALUES (?, ?, ?, ?, ?)`
  ).bind(user?.id ?? null, entityType, entityId, reason, details).run();
  return c.json({ ok: true, message: 'Thanks. Our team will review this.' });
});

/** Global search (businesses + published items). */
app.get('/search', async (c) => {
  const env = c.env;
  const q = (c.req.query('q') || '').trim();
  const city = c.req.query('city')?.trim().slice(0, 80) || '';
  const page = clampInt(c.req.query('page'), 1, 100, 1);
  if (q.length < 2) return c.json({ ok: true, businesses: [], items: [], total: 0, page });
  const like = `%${q.slice(0, 60)}%`;
  const blockedSearch = await blockFilter(c);
  let bizWhere = `WHERE ${LIVE} AND b.name LIKE ?${blockedSearch.sql}`;
  const bizParams: (string | number)[] = [like, ...blockedSearch.params];
  if (city) { bizWhere += ` AND LOWER(b.city) = LOWER(?)`; bizParams.push(city); }
  const businesses = (await env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.city FROM businesses b ${bizWhere} LIMIT 8`
  ).bind(...bizParams).all()).results as Record<string, unknown>[];
  let itemWhere = `WHERE l.status = 'published' AND l.deleted_at IS NULL AND ${LIVE} AND (l.name LIKE ? OR l.description LIKE ?)${blockedSearch.sql}`;
  const itemParams: (string | number)[] = [like, like, ...blockedSearch.params];
  if (city) { itemWhere += ` AND LOWER(b.city) = LOWER(?)`; itemParams.push(city); }
  const items = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.price, l.price_type, t.url_segment, b.slug AS biz_slug, b.name AS biz_name, b.city,
            (SELECT m2.storage_key FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS storage_key0,
            (SELECT m2.driver FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS driver0,
            (SELECT m2.id FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS media_id0
     FROM listings l JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     ${itemWhere}
     ORDER BY l.featured DESC, l.published_at DESC LIMIT 24`
  ).bind(...itemParams).all()).results as Record<string, unknown>[];
  const itemsOut = items.map((it) => {
    const i = it as { id: number; name: string; slug: string; price: number | null; price_type: string; url_segment: string; biz_slug: string; biz_name: string; city: string | null; storage_key0: string | null; driver0: 'd1' | 'gateway' | null; media_id0: number | null };
    return {
      id: i.id, name: i.name, slug: i.slug, url_segment: i.url_segment, biz_slug: i.biz_slug, biz_name: i.biz_name, city: i.city,
      price_display: i.price_type === 'negotiable' ? 'Price on request' : formatNaira(i.price),
      image: i.media_id0 && i.storage_key0 && i.driver0 ? mediaUrl(env, { driver: i.driver0, storage_key: i.storage_key0, id: i.media_id0 }) : null,
    };
  });
  let suggestions: { label: string; href: string }[] = [];
  if (businesses.length + itemsOut.length === 0 && q.length >= 2) {
    const stem = `${q.slice(0, 4)}%`;
    const cats = (await env.DB.prepare(`SELECT name, slug FROM categories WHERE is_active = 1 AND deleted_at IS NULL AND name LIKE ? LIMIT 4`).bind(stem).all()).results as { name: string; slug: string }[];
    suggestions = cats.map((cat) => ({ label: cat.name, href: `/categories/${cat.slug}` }));
  }
  return c.json({ ok: true, businesses, items: itemsOut, total: businesses.length + itemsOut.length, page, suggestions });
});

/**
 * Inquiry capture: builds the exact wa.me URL + message and records the lead.
 * The buyer's browser then opens the returned wa_url.
 */
app.post('/inquiries', async (c) => {
  const env = c.env;
  const ip = IP(c);
  await rateLimit(env, 'inquiry', ip, 5, 60);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const bizId = Number(body.business_id);
  const listingId = body.listing_id ? Number(body.listing_id) : null;
  const quantity = body.quantity ? clampInt(body.quantity, 1, 999, 1) : 1;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null;
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+]/g, '').slice(0, 20) : null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
  const biz = (await env.DB.prepare('SELECT * FROM businesses WHERE id = ? AND status = "active" AND paused_at IS NULL AND deleted_at IS NULL').bind(bizId).first()) as Record<string, unknown> | null;
  if (!biz) throw notFound('Business not found.');
  const asker = await getSession(env, c);
  if (await isBlocked(env, asker?.id, bizId)) throw forbidden('You blocked this business. Unblock it from your account to enquire.');
  interface InquiryItem { id: number; name: string; item_type_id: number; item_type_slug: string; url_segment: string; slug: string; price: number | null; whatsapp_number_id: number | null; category_id?: number | null }
  interface CartItem extends InquiryItem { qty: number }
  let item: InquiryItem | null = null;
  let cartItems: CartItem[] | null = null;
  // Multi-item WhatsApp cart (plan §30): `items` wins over `listing_id`.
  // Every listing is re-validated server-side (ownership + published), so a
  // crafted payload can never inject another vendor's items.
  const itemsIn = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : null;
  if (itemsIn) {
    if (itemsIn.length === 0) throw badRequest('Your cart is empty.');
    const seen = new Map<number, number>();
    for (const it of itemsIn.slice(0, 20)) {
      const lid = Number(it?.listing_id);
      if (!Number.isInteger(lid) || lid < 1) continue;
      const q = clampInt(Number(it?.quantity), 1, 999, 1);
      seen.set(lid, (seen.get(lid) ?? 0) + q);
    }
    const ids = [...seen.keys()];
    if (ids.length === 0) throw badRequest('Your cart is empty.');
    const qm = ids.map(() => '?').join(',');
    const rows = (await env.DB.prepare(
      `SELECT l.id, l.name, l.slug, l.price, l.whatsapp_number_id, t.url_segment
       FROM listings l JOIN item_types t ON t.id = l.item_type_id
       WHERE l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL AND l.id IN (${qm})`
    ).bind(bizId, ...ids).all()).results as { id: number; name: string; slug: string; price: number | null; whatsapp_number_id: number | null; url_segment: string }[];
    cartItems = rows
      .sort((a, b) => a.id - b.id)
      .map((r) => ({
        id: r.id, name: r.name, price: r.price, whatsapp_number_id: r.whatsapp_number_id,
        item_type_id: 0, item_type_slug: '', url_segment: r.url_segment, slug: r.slug, qty: seen.get(r.id) ?? 1,
      }));
    if (cartItems.length === 0) throw notFound('Item not found.');
    item = { ...cartItems[0]! };
  } else if (listingId) {
    const l = (await env.DB.prepare(
      `SELECT l.id, l.name, l.slug, l.price, l.item_type_id, l.category_id, l.whatsapp_number_id, t.slug AS item_type_slug, t.url_segment, t.whatsapp_template_key
       FROM listings l JOIN item_types t ON t.id = l.item_type_id
       WHERE l.id = ? AND l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL`
    ).bind(listingId, bizId).first()) as InquiryItem | null;
    if (!l) throw notFound('Item not found.');
    item = l;
  }
  let variantLabel: string | null = null;
  if (!cartItems && item && body.variant_id) {
    const variant = (await env.DB.prepare(
      `SELECT name, options, price_override FROM listing_variants WHERE id = ? AND listing_id = ? AND is_active = 1`
    ).bind(Number(body.variant_id), item.id).first()) as { name: string; options: string; price_override: number | null } | null;
    if (variant) {
      let opts: string[] = [];
      try { opts = JSON.parse(variant.options) as string[]; } catch { opts = []; }
      variantLabel = opts.length ? `${variant.name}: ${opts.join(', ')}` : variant.name;
      if (variant.price_override != null) item.price = variant.price_override;
    }
  }
  const routed = await resolveWhatsappNumber(env, bizId, {
    whatsapp_number_id: item?.whatsapp_number_id ?? null,
    item_type_id: item?.item_type_id || null,
    category_id: item?.category_id ?? null,
  });
  const number = routed?.number;
  if (!number) throw badRequest('This business has not configured a WhatsApp number yet.');

  const itemTypeRow = item && !cartItems
    ? ((await env.DB.prepare('SELECT item_type_id FROM listings WHERE id = ?').bind(item.id).first()) as { item_type_id: number } | null)
    : null;
  const template =
    (itemTypeRow
      ? ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id = ? AND item_type_id = ? LIMIT 1').bind(bizId, itemTypeRow.item_type_id).first()) as { body: string } | null) ||
        ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id IS NULL AND item_type_id = ? LIMIT 1').bind(itemTypeRow.item_type_id).first()) as { body: string } | null)
      : null) ||
    ((await env.DB.prepare('SELECT body FROM message_templates WHERE is_active = 1 AND business_id IS NULL AND item_type_id IS NULL LIMIT 1').first()) as { body: string } | null);

  const itemUrl = cartItems
    ? `${env.APP_URL}/business/${(biz as { slug: string }).slug}`
    : item
      ? `${env.APP_URL}/business/${(biz as { slug: string }).slug}/${item.url_segment}/${item.slug}`
      : `${env.APP_URL}/business/${(biz as { slug: string }).slug}`;
  // Cart message: one numbered line per item + estimated total (plan §30).
  // Templates are single-item constructs, so multi-item uses the fixed
  // composer format.
  let message: string;
  if (cartItems) {
    const priced = cartItems.filter((i) => i.price !== null);
    const total = priced.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0);
    const totalLabel =
      total > 0
        ? formatNaira(total) + (priced.length < cartItems.length ? ' (some items priced on request)' : '')
        : 'Price on request';
    const greeting = name
      ? `Hello ${(biz as { name: string }).name}, I'm ${name}. I found you on CyberShop and I'd like to enquire about these items:`
      : `Hello ${(biz as { name: string }).name}, I found you on CyberShop and I'd like to enquire about these items:`;
    message = [
      greeting,
      '',
      ...cartItems.map((i, n) => `${n + 1}. ${i.name} × ${i.qty} — ${i.price !== null ? formatNaira(i.price) : 'Price on request'}`),
      '',
      `Estimated total: ${totalLabel}`,
      ...(note ? ['', `Note: ${note}`] : []),
      '',
      'Please confirm availability and final price.',
      '',
      itemUrl,
    ].join('\n');
  } else {
    message = renderTemplate(template ? template.body : 'Hello {{business_name}}!', {
      business_name: (biz as { name: string }).name,
      business_url: `${env.APP_URL}/business/${(biz as { slug: string }).slug}`,
      item_name: item ? item.name : '',
      item_url: itemUrl,
      price: item?.price !== null && item?.price !== undefined ? formatNaira(item.price) : 'Price on request',
      quantity: String(quantity),
      customer_name: name || '',
    });
    if (variantLabel) message = `${message}\n\nOption: ${variantLabel}`;
    if (note) message = `${message}\n\nNote: ${note}`;
  }
  const offerRows = (await env.DB.prepare(
    `SELECT title FROM offers WHERE business_id = ? AND is_active = 1 AND (listing_id IS NULL OR listing_id = ?) AND (ends_at IS NULL OR ends_at > datetime('now')) ORDER BY id DESC LIMIT 2`
  ).bind(bizId, item?.id ?? 0).all()).results as { title: string }[];
  if (offerRows.length) message = `${message}\n\nCurrent offer: ${offerRows.map((o) => o.title).join('; ')}. Confirm the final price in this chat.`;
  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  const user = await getSession(env, c);
  const waNumberRow = (await env.DB.prepare(
    `SELECT id FROM whatsapp_numbers WHERE business_id = ? AND number = ? AND status = 'active' ORDER BY is_default DESC LIMIT 1`
  ).bind(bizId, number).first()) as { id: number } | null;
  const itemsJson = cartItems
    ? JSON.stringify(cartItems.map((i) => ({
        listing_id: i.id,
        quantity: i.qty,
        name: i.name,
        price: i.price,
        url: i.slug && i.url_segment ? `${env.APP_URL}/business/${(biz as { slug: string }).slug}/${i.url_segment}/${i.slug}` : null,
      })))
    : null;
  const inserted = await env.DB.prepare(
    `INSERT INTO inquiries (business_id, listing_id, whatsapp_number_id, buyer_user_id, buyer_name, buyer_phone, message, wa_url, source, items_json, variant_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(bizId, item?.id ?? null, waNumberRow?.id ?? null, user?.id ?? null, name, phone, message.slice(0, 4000), waUrl.slice(0, 2000), cartItems ? 'cart' : item ? 'item_page' : 'storefront', itemsJson, variantLabel).run();
  await trackEvent(env, c, {
    businessId: bizId,
    eventType: 'wa_click',
    listingId: item?.id ?? null,
    userId: user?.id ?? null,
    meta: cartItems ? { items: cartItems.length, quantity: cartItems.reduce((s, i) => s + i.qty, 0) } : { quantity },
  });
  const ownerId = (biz as { owner_user_id: number }).owner_user_id;
  if (ownerId) {
    const summary = cartItems
      ? `${cartItems.length} item${cartItems.length === 1 ? '' : 's'} · ${cartItems.reduce((s, i) => s + i.qty, 0)} qty`
      : item?.name || 'a general enquiry';
    await notify(env, {
      userId: ownerId,
      type: 'inquiry.new',
      title: name ? `${name} just enquired` : 'New WhatsApp enquiry',
      body: summary,
      data: { inquiry_id: Number(inserted.meta.last_row_id), source: cartItems ? 'cart' : 'item_page' },
    });
  }
  return c.json({ ok: true, wa_url: waUrl, message, inquiry_id: Number(inserted.meta.last_row_id) });
});

app.get('/item-types', async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT name, slug FROM item_types WHERE is_active = 1 ORDER BY sort_order, name`).all()).results;
  return c.json({ ok: true, types: rows });
});

/** Typeahead. Two characters minimum, short list, no account required. */
app.get('/suggest', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 60);
  if (q.length < 2) return c.json({ ok: true, businesses: [], items: [] });
  await rateLimit(c.env, 'suggest', IP(c), 40, 60);
  const like = `%${q}%`;
  const blocked = await blockFilter(c);
  const businesses = (await c.env.DB.prepare(
    `SELECT name, slug FROM businesses b WHERE ${LIVE} AND name LIKE ?${blocked.sql} ORDER BY is_featured DESC, name LIMIT 5`
  ).bind(like, ...blocked.params).all()).results;
  const items = (await c.env.DB.prepare(
    `SELECT l.name, l.slug, t.url_segment, b.slug AS biz_slug, b.name AS biz_name
     FROM listings l JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     WHERE l.status = 'published' AND l.deleted_at IS NULL AND ${LIVE} AND l.name LIKE ?${blocked.sql}
     ORDER BY l.featured DESC, l.name LIMIT 6`
  ).bind(like, ...blocked.params).all()).results;
  return c.json({ ok: true, businesses, items });
});

/** Custom-domain lookup for the web middleware. Gated by the internal secret like the rest of /api. */
app.get('/domain', async (c) => {
  const host = (c.req.query('host') || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 180) return c.json({ ok: true, slug: null });
  const row = (await c.env.DB.prepare(
    `SELECT slug FROM businesses WHERE custom_domain = ? AND custom_domain_status = 'verified' AND status = 'active' AND paused_at IS NULL AND deleted_at IS NULL`
  ).bind(host).first()) as { slug: string } | null;
  return c.json({ ok: true, slug: row?.slug ?? null });
});

export default app;
