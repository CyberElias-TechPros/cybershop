import { Hono } from 'hono';
import type { Env } from '../config';
import { rateLimit } from '../lib/ratelimit';
import { badRequest, notFound, validationError } from '../lib/errors';
import { trackEvent } from '../lib/analytics';
import { getSession } from '../lib/auth';
import { mediaUrl, getMedia, storeD1Media, magicMime } from '../lib/media';
import { renderTemplate } from '../lib/wa';
import { formatNaira } from '../lib/money';
import { clampInt } from '../lib/util';

const app = new Hono<{ Bindings: Env }>();

const IP = (c: { req: { header(n: string): string | undefined | null } }) =>
  c.req.header("cf-connecting-ip") || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

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
    template_key: string;
  };
  const media = (await env.DB.prepare(
    `SELECT m.id, m.mime_type, m.size_bytes, m.width, m.height, m.original_name, m.driver, m.storage_key, m.visibility, im.position, im.is_primary, im.alt_text
     FROM item_media im JOIN media m ON m.id = im.media_id
     WHERE im.listing_id = ? ORDER BY im.position ASC, m.id ASC`
  ).bind(l.id).all()).results as { id: number; mime_type: string; driver: string; storage_key: string; width: number | null; height: number | null; is_primary: number; alt_text: string | null }[];
  const images = media.map((m) => ({ id: m.id, url: mediaUrl(env, { driver: m.driver as 'd1', storage_key: m.storage_key, id: m.id }), width: m.width, height: m.height, alt: m.alt_text || l.name, primary: !!m.is_primary }));
  let custom: Record<string, unknown> = {};
  try { custom = JSON.parse(l.custom_fields || '{}'); } catch { custom = {}; }
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
    cta_label: l.cta_label,
    schema_type: l.seo_schema_type,
    seo: { title: l.seo_title || l.name, description: l.seo_description },
    published_at: l.published_at,
  };
}

async function publicBusiness(env: Env, biz: Record<string, unknown>): Promise<Record<string, unknown>> {
  const b = biz as { id: number; name: string; slug: string; about: string | null; description: string | null; city: string | null; state_region: string | null; phone: string | null; website: string | null; social: string | null; status: string; logo_media_id: number | null; cover_media_id: number | null };
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
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    about: b.about || b.description,
    city: b.city,
    state_region: b.state_region,
    phone: b.phone,
    website: b.website,
    social,
    status: b.status,
    categories: cats,
    whatsapp_number: waNumber?.number ?? null,
    logo: logo ? { url: mediaUrl(env, logo), alt: b.name } : null,
    cover: cover ? { url: mediaUrl(env, cover) } : null,
  };
}

app.get('/home', async (c) => {
  const env = c.env;
  const settings = await platformSettings(env);
  const categories = (await env.DB.prepare('SELECT name, slug, description, icon FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order').all()).results as Record<string, unknown>[];
  const featured = (await env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.about, b.city, b.state_region, b.logo_media_id, b.cover_media_id, b.status
     FROM businesses b WHERE b.status = 'active' AND b.deleted_at IS NULL
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT 12`
  ).all()).results as Record<string, unknown>[];
  const bizRows = featured.length
    ? (await Promise.all(featured.map((b) => publicBusiness(env, b))))
    : [];
  const itemCount = (await env.DB.prepare(`SELECT COUNT(DISTINCT business_id) AS n FROM listings WHERE status = 'published' AND deleted_at IS NULL`).first()) as { n: number };
  return c.json({ ok: true, platform: settings.platform, categories, businesses: bizRows, business_count: itemCount.n });
});

app.get('/businesses', async (c) => {
  const env = c.env;
  const q = c.req.query('q')?.trim().slice(0, 80) || '';
  const cat = c.req.query('category')?.trim().slice(0, 60) || '';
  const page = clampInt(c.req.query('page'), 1, 1000, 1);
  const perPage = 24;
  let where = `WHERE b.status = 'active' AND b.deleted_at IS NULL`;
  const params: (string | number)[] = [];
  if (q) { where += ` AND (b.name LIKE ? OR b.about LIKE ? OR b.city LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (cat) { where += ` AND EXISTS (SELECT 1 FROM business_categories bc WHERE bc.business_id = b.id AND bc.category_id = (SELECT id FROM categories WHERE slug = ?))`; params.push(cat); }
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
  const rows = (await env.DB.prepare(
    `SELECT b.* FROM businesses b JOIN business_categories bc ON bc.business_id = b.id
     WHERE bc.category_id = ? AND b.status = 'active' AND b.deleted_at IS NULL
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT ? OFFSET ?`
  ).bind((cat as { id: number }).id, perPage, (page - 1) * perPage).all()).results as Record<string, unknown>[];
  const businesses = await Promise.all(rows.map((b) => publicBusiness(env, b)));
  return c.json({ ok: true, category: { name: cat.name, slug: cat.slug, description: cat.description, icon: cat.icon }, businesses, page, pages: 1 });
});

/** Storefront data (server-side, no auth). */
app.get('/business/:slug', async (c) => {
  const env = c.env;
  const biz = (await env.DB.prepare('SELECT * FROM businesses WHERE slug = ? AND deleted_at IS NULL').bind(c.req.param('slug')).first()) as Record<string, unknown> | null;
  if (!biz) throw notFound('Business not found.');
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
  return c.json({ ok: true, business, items, offers });
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
  await trackEvent(env, c, { businessId: (biz as { id: number }).id, eventType: 'item_view', listingId: (item as { id: number }).id, userId: user?.id ?? null });
  const data = await publicItem(env, item);

  // resolve routing: item's number → business default → owner phone
  const number = ((await env.DB.prepare(
    `SELECT n.number FROM whatsapp_numbers n WHERE n.id = ? AND n.business_id = ? AND n.status = 'active' AND n.deleted_at IS NULL`
  ).bind((item as { whatsapp_number_id: number | null }).whatsapp_number_id ?? 0, (biz as { id: number }).id).first()) as { number: string } | null)?.number
    || ((await env.DB.prepare(`SELECT number FROM whatsapp_numbers WHERE business_id = ? AND is_default = 1 AND status = 'active' AND deleted_at IS NULL ORDER BY id LIMIT 1`).bind((biz as { id: number }).id).first()) as { number: string } | null)?.number
    || null;

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

  return c.json({ ok: true, item: { ...data, audio }, business, wa, related });
});

/** Global search (businesses + published items). */
app.get('/search', async (c) => {
  const env = c.env;
  const q = (c.req.query('q') || '').trim();
  const page = clampInt(c.req.query('page'), 1, 100, 1);
  if (q.length < 2) return c.json({ ok: true, businesses: [], items: [], total: 0 });
  const like = `%${q.slice(0, 60)}%`;
  const businesses = (await env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.city FROM businesses b WHERE b.status = 'active' AND b.deleted_at IS NULL AND b.name LIKE ? LIMIT 8`
  ).bind(like).all()).results as Record<string, unknown>[];
  const items = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.price, l.price_type, t.url_segment, b.slug AS biz_slug, b.name AS biz_name,
            (SELECT m2.storage_key FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS storage_key0,
            (SELECT m2.driver FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS driver0
     FROM listings l JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     WHERE l.status = 'published' AND l.deleted_at IS NULL AND b.status = 'active' AND (l.name LIKE ? OR l.description LIKE ?)
     ORDER BY l.featured DESC, l.published_at DESC LIMIT 24`
  ).bind(like, like).all()).results as Record<string, unknown>[];
  const itemsOut = items.map((it) => {
    const i = it as { id: number; name: string; slug: string; price: number | null; price_type: string; url_segment: string; biz_slug: string; biz_name: string; storage_key0: string | null; driver0: 'd1' | 'gateway' | null };
    return {
      id: i.id, name: i.name, slug: i.slug, url_segment: i.url_segment, biz_slug: i.biz_slug, biz_name: i.biz_name,
      price_display: i.price_type === 'negotiable' ? 'Price on request' : formatNaira(i.price),
      image: i.storage_key0 && i.driver0 ? mediaUrl(env, { driver: i.driver0, storage_key: i.storage_key0, id: i.id }) : null,
    };
  });
  return c.json({ ok: true, businesses, items: itemsOut, total: businesses.length + itemsOut.length, page });
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
  const biz = (await env.DB.prepare('SELECT * FROM businesses WHERE id = ? AND status = "active" AND deleted_at IS NULL').bind(bizId).first()) as Record<string, unknown> | null;
  if (!biz) throw notFound('Business not found.');
  interface InquiryItem { id: number; name: string; item_type_id: number; item_type_slug: string; url_segment: string; slug: string; price: number | null; whatsapp_number_id: number | null }
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
      `SELECT l.id, l.name, l.price, l.whatsapp_number_id FROM listings l
       WHERE l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL AND l.id IN (${qm})`
    ).bind(bizId, ...ids).all()).results as { id: number; name: string; price: number | null; whatsapp_number_id: number | null }[];
    cartItems = rows
      .sort((a, b) => a.id - b.id)
      .map((r) => ({
        id: r.id, name: r.name, price: r.price, whatsapp_number_id: r.whatsapp_number_id,
        item_type_id: 0, item_type_slug: '', url_segment: '', slug: '', qty: seen.get(r.id) ?? 1,
      }));
    if (cartItems.length === 0) throw notFound('Item not found.');
    item = { ...cartItems[0]! };
  } else if (listingId) {
    const l = (await env.DB.prepare(
      `SELECT l.id, l.name, l.slug, l.price, l.item_type_id, l.whatsapp_number_id, t.slug AS item_type_slug, t.url_segment, t.whatsapp_template_key
       FROM listings l JOIN item_types t ON t.id = l.item_type_id
       WHERE l.id = ? AND l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL`
    ).bind(listingId, bizId).first()) as InquiryItem | null;
    if (!l) throw notFound('Item not found.');
    item = l;
  }
  const number = ((await env.DB.prepare(
    `SELECT n.number FROM whatsapp_numbers n WHERE n.id = ? AND n.business_id = ? AND n.status = 'active' AND n.deleted_at IS NULL`
  ).bind(item?.whatsapp_number_id ?? 0, bizId).first()) as { number: string } | null)?.number
    || ((await env.DB.prepare(`SELECT number FROM whatsapp_numbers WHERE business_id = ? AND is_default = 1 AND status = 'active' AND deleted_at IS NULL ORDER BY id LIMIT 1`).bind(bizId).first()) as { number: string } | null)?.number;
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
    message = [
      `Hello ${(biz as { name: string }).name}, I found you on CyberShop and I'd like to enquire about these items:`,
      '',
      ...cartItems.map((i, n) => `${n + 1}. ${i.name} × ${i.qty} — ${i.price !== null ? formatNaira(i.price) : 'Price on request'}`),
      '',
      `Estimated total: ${totalLabel}`,
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
  }
  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  const user = await getSession(env, c);
  const waNumberRow = (await env.DB.prepare(
    `SELECT id FROM whatsapp_numbers WHERE business_id = ? AND number = ? AND status = 'active' ORDER BY is_default DESC LIMIT 1`
  ).bind(bizId, number).first()) as { id: number } | null;
  const itemsJson = cartItems
    ? JSON.stringify(cartItems.map((i) => ({ listing_id: i.id, quantity: i.qty, name: i.name })))
    : null;
  await env.DB.prepare(
    `INSERT INTO inquiries (business_id, listing_id, whatsapp_number_id, buyer_user_id, buyer_name, buyer_phone, message, wa_url, source, items_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(bizId, item?.id ?? null, waNumberRow?.id ?? null, user?.id ?? null, name, phone, message.slice(0, 2000), waUrl.slice(0, 500), cartItems ? 'cart' : item ? 'item_page' : 'storefront', itemsJson).run();
  await trackEvent(env, c, {
    businessId: bizId,
    eventType: 'wa_click',
    listingId: item?.id ?? null,
    userId: user?.id ?? null,
    meta: cartItems ? { items: cartItems.length, quantity: cartItems.reduce((s, i) => s + i.qty, 0) } : { quantity },
  });
  return c.json({ ok: true, wa_url: waUrl });
});

export default app;
