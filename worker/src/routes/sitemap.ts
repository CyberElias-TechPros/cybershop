import { Hono } from 'hono';
import type { Env } from '../config';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const env = c.env;
  const businesses = (await env.DB.prepare(
    `SELECT slug FROM businesses WHERE status = 'active' AND paused_at IS NULL AND deleted_at IS NULL ORDER BY id LIMIT 5000`
  ).all()).results as { slug: string }[];
  const items = (await env.DB.prepare(
    `SELECT b.slug AS biz, t.url_segment, l.slug FROM listings l
     JOIN businesses b ON b.id = l.business_id JOIN item_types t ON t.id = l.item_type_id
     WHERE l.status = 'published' AND l.deleted_at IS NULL AND b.status = 'active' AND b.paused_at IS NULL
     ORDER BY l.id LIMIT 10000`
  ).all()).results as { biz: string; url_segment: string; slug: string }[];
  const categories = (await env.DB.prepare(`SELECT slug FROM categories WHERE is_active = 1 AND deleted_at IS NULL`).all()).results as { slug: string }[];
  const base = env.APP_URL.replace(/\/$/, '');
  const urls: string[] = [
    `<url><loc>${base}/</loc></url>`,
    `<url><loc>${base}/businesses</loc></url>`,
    `<url><loc>${base}/listings</loc></url>`,
    `<url><loc>${base}/jobs</loc></url>`,
    `<url><loc>${base}/search</loc></url>`,
    `<url><loc>${base}/safety</loc></url>`,
    `<url><loc>${base}/content-policy</loc></url>`,
    `<url><loc>${base}/terms</loc></url>`,
    `<url><loc>${base}/privacy</loc></url>`,
    `<url><loc>${base}/contact</loc></url>`,
    ...categories.map((x) => `<url><loc>${base}/categories/${x.slug}</loc></url>`),
    ...businesses.map((x) => `<url><loc>${base}/business/${x.slug}</loc></url>`),
    ...items.map((x) => `<url><loc>${base}/business/${x.biz}/${x.url_segment}/${x.slug}</loc></url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
});

export default app;
