import type { Env } from '../config';
import { nowUnix } from './util';

export type SitemapPart = { kind: 'index' | 'static' | 'businesses' | 'listings'; page: number };
const PAGE_SIZE = 1000;
const MAX_STALE_SECONDS = 3600;
export const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const entry = (url: string, tag: string) => `<${tag}><loc>${xmlEscape(url)}</loc></${tag}>`;
function documentXml(entries: string[], index = false): string {
  const tag = index ? 'sitemapindex' : 'urlset';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</${tag}>`;
  // Leave room below D1's per-row limit; fail loudly rather than truncate inventory.
  if (entries.length > 50_000 || new TextEncoder().encode(xml).length > 1_500_000) throw new Error('Sitemap capacity exceeded');
  return xml;
}
export async function buildSitemap(env: Env, part: SitemapPart): Promise<string> {
  const base = new URL(env.APP_URL).origin;
  const component = encodeURIComponent;
  if (part.kind === 'index') {
    const [businesses, listings] = await env.DB.batch<{ page: number }>([
      env.DB.prepare(`SELECT DISTINCT CAST(id/${PAGE_SIZE} AS INTEGER) AS page FROM businesses WHERE status='active' AND paused_at IS NULL AND deleted_at IS NULL ORDER BY page LIMIT 50001`),
      env.DB.prepare(`SELECT DISTINCT CAST(l.id/${PAGE_SIZE} AS INTEGER) AS page FROM listings l JOIN businesses b ON b.id=l.business_id
        WHERE l.status='published' AND l.deleted_at IS NULL AND b.status='active' AND b.paused_at IS NULL AND b.deleted_at IS NULL ORDER BY page LIMIT 50001`),
    ]);
    return documentXml([
      entry(`${base}/sitemaps/static/0.xml`, 'sitemap'),
      ...businesses.results.map((r) => entry(`${base}/sitemaps/businesses/${r.page}.xml`, 'sitemap')),
      ...listings.results.map((r) => entry(`${base}/sitemaps/listings/${r.page}.xml`, 'sitemap')),
    ], true);
  }
  if (part.kind === 'static') {
    const categories = (await env.DB.prepare('SELECT slug FROM categories WHERE is_active=1 AND deleted_at IS NULL ORDER BY id LIMIT 50001').all()).results;
    return documentXml([
      ...['/', '/businesses', '/listings', '/jobs', '/search', '/safety', '/content-policy', '/terms', '/privacy', '/contact'].map((p) => entry(base + p, 'url')),
      ...categories.map((r) => entry(`${base}/categories/${component(String(r.slug))}`, 'url')),
    ]);
  }
  const lower = part.page * PAGE_SIZE;
  if (part.kind === 'businesses') {
    const rows = (await env.DB.prepare(`SELECT slug FROM businesses WHERE id>=? AND id<? AND status='active' AND paused_at IS NULL AND deleted_at IS NULL ORDER BY id`).bind(lower, lower + PAGE_SIZE).all()).results;
    return documentXml(rows.map((r) => entry(`${base}/business/${component(String(r.slug))}`, 'url')));
  }
  const rows = (await env.DB.prepare(`SELECT b.slug AS biz,t.url_segment,l.slug FROM listings l JOIN businesses b ON b.id=l.business_id JOIN item_types t ON t.id=l.item_type_id
    WHERE l.id>=? AND l.id<? AND l.status='published' AND l.deleted_at IS NULL AND b.status='active' AND b.paused_at IS NULL AND b.deleted_at IS NULL ORDER BY l.id`)
    .bind(lower, lower + PAGE_SIZE).all()).results;
  return documentXml(rows.map((r) => entry(`${base}/business/${component(String(r.biz))}/${component(String(r.url_segment))}/${component(String(r.slug))}`, 'url')));
}

/** Durable last-good XML, plus regional cache fallback if D1 is unavailable. No homepage-only success. */
export async function serveSitemap(env: Env, part: SitemapPart, generate = () => buildSitemap(env, part)): Promise<Response> {
  const name = `sitemap:${new URL(env.APP_URL).origin}:${part.kind}:${part.page}`;
  const cacheKey = new Request(`https://sitemap-cache.cybershop.invalid/${encodeURIComponent(name)}`);
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'x-content-type-options': 'nosniff' };
  try {
    const payload = await generate();
    const at = nowUnix();
    let persisted = true;
    try {
      await env.DB.prepare(`INSERT INTO public_snapshots (name,payload,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
        .bind(name, payload, at).run();
      await caches.default.put(cacheKey, new Response(payload, { headers: { ...headers, 'x-generated-at': String(at), 'cache-control': `public,max-age=${MAX_STALE_SECONDS}` } }));
    } catch { persisted = false; console.error('[sitemap] snapshot_write_failed'); }
    return new Response(payload, { headers: { ...headers, 'cache-control': 'public,max-age=300', 'x-sitemap-state': 'fresh', 'x-sitemap-snapshot': persisted ? 'saved' : 'unavailable', 'x-sitemap-age': '0' } });
  } catch {
    console.error('[sitemap] regeneration_failed');
    let snapshot: { payload: string; updated_at: number } | null = null;
    try { snapshot = await env.DB.prepare('SELECT payload,updated_at FROM public_snapshots WHERE name=?').bind(name).first(); } catch { /* Try regional cache below. */ }
    try {
      const cached = await caches.default.match(cacheKey);
      const at = Number(cached?.headers.get('x-generated-at'));
      if (cached && Number.isFinite(at) && at > (snapshot?.updated_at ?? 0)) snapshot = { payload: await cached.text(), updated_at: at };
    } catch { /* Cold cache is not evidence that inventory is empty. */ }
    if (snapshot && nowUnix() - snapshot.updated_at <= MAX_STALE_SECONDS) {
      return new Response(snapshot.payload, { headers: { ...headers, 'cache-control': 'no-store', warning: '110 - "Stale sitemap"', 'x-sitemap-state': 'stale', 'x-sitemap-age': String(Math.max(0, nowUnix() - snapshot.updated_at)) } });
    }
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '120', 'x-sitemap-state': 'unavailable' } });
  }
}
