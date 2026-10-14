import { Hono } from 'hono';
import type { Env } from '../config';
import { AppError } from '../lib/errors';
import { sha256Hex, nowIso } from '../lib/util';
import { mediaUrl } from '../lib/media';
import { formatNaira } from '../lib/money';

/**
 * Read-only public catalogue API for power sellers' own sites/apps.
 * Auth: `Authorization: Bearer csk_...` (keys are created in the
 * dashboard, hashed at rest, revocable). Returns only published data
 * that is already public on the storefront.
 */
const app = new Hono<{ Bindings: Env }>();

app.get('/catalog', async (c) => {
  const env = c.env;
  const auth = c.req.header('authorization') || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (c.req.query('key') || '');
  if (!key.startsWith('csk_')) throw new AppError(401, 'unauthorized', 'API key required.');
  const hash = await sha256Hex(key);
  const row = (await env.DB.prepare(
    `SELECT k.id, k.business_id, b.name, b.slug, b.city FROM api_keys k
     JOIN businesses b ON b.id = k.business_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL AND b.deleted_at IS NULL`,
  ).bind(hash).first()) as { id: number; business_id: number; name: string; slug: string; city: string | null } | null;
  if (!row) throw new AppError(401, 'unauthorized', 'Invalid or revoked API key.');
  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(nowIso(), row.id).run();
  const items = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.description, l.price, l.price_type, l.stock_status, l.updated_at,
            t.url_segment,
            (SELECT m2.storage_key FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS sk,
            (SELECT m2.driver FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS drv,
            (SELECT m2.id FROM item_media im2 JOIN media m2 ON m2.id = im2.media_id WHERE im2.listing_id = l.id ORDER BY im2.position LIMIT 1) AS mid
     FROM listings l JOIN item_types t ON t.id = l.item_type_id
     WHERE l.business_id = ? AND l.status = 'published' AND l.deleted_at IS NULL
     ORDER BY l.published_at DESC LIMIT 500`,
  ).bind(row.business_id).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    business: { name: row.name, slug: row.slug, city: row.city, url: `${env.APP_URL}/business/${row.slug}` },
    items: items.map((i) => ({
      id: i.id, name: i.name, slug: i.slug,
      url: `${env.APP_URL}/business/${row.slug}/${i.url_segment}/${i.slug}`,
      description: i.description,
      price_display: i.price_type === 'negotiable' ? 'Price on request' : formatNaira(i.price as number | null),
      price_kobo: i.price, price_type: i.price_type, stock_status: i.stock_status,
      image: i.mid && i.sk && i.drv ? mediaUrl(env, { driver: i.drv as 'd1' | 'gateway', storage_key: i.sk as string, id: i.mid as number }) : null,
      updated_at: i.updated_at,
    })),
  });
});

export default app;
