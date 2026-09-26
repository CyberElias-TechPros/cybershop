import { Hono } from 'hono';
import type { Env } from '../config';
import { requireAdmin } from '../lib/auth';
import { notFound } from '../lib/errors';
import { reqInt, optStr } from '../lib/validate';
import { nowIso } from '../lib/util';
import { audit } from '../lib/audit';
import { clientIp } from '../lib/ip';


const app = new Hono<{ Bindings: Env }>();

app.get('/subscriptions', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT s.id, s.status, s.starts_at, s.expires_at, s.grace_until, b.id AS business_id, b.name AS business_name, b.slug, b.status AS business_status,
            p.name AS plan_name, p.slug AS plan_slug, u.email AS owner_email
     FROM subscriptions s
     JOIN businesses b ON b.id = s.business_id
     JOIN plans p ON p.id = s.plan_id
     JOIN users u ON u.id = b.owner_user_id
     WHERE b.deleted_at IS NULL
     ORDER BY CASE WHEN s.status IN ('expiring','expired','grace') THEN 0 ELSE 1 END, s.id DESC
     LIMIT 200`
  ).all()).results;
  return c.json({ ok: true, subscriptions: rows });
});

app.get('/reviews', async (c) => {
  await requireAdmin(c.env, c);
  const status = c.req.query('status') || 'published';
  const rows = (await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.title, r.body, r.status, r.created_at, r.vendor_reply,
            b.name AS business_name, u.email AS buyer_email, l.name AS item_name
     FROM reviews r
     JOIN businesses b ON b.id = r.business_id
     JOIN users u ON u.id = r.buyer_user_id
     LEFT JOIN listings l ON l.id = r.listing_id
     WHERE r.status = ?
     ORDER BY r.id DESC LIMIT 100`
  ).bind(status === 'hidden' ? 'hidden' : 'published').all()).results;
  return c.json({ ok: true, reviews: rows });
});

app.post('/reviews/:id/hide', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const note = optStr(body?.note, 300);
  const res = await c.env.DB.prepare(`UPDATE reviews SET status = 'hidden', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  if (res.meta.changes === 0) throw notFound('Review not found.');
  await audit(c.env, { actor: admin, action: 'review.hide', entityType: 'review', entityId: id, ip: clientIp(c), meta: note ? { note } : undefined });
  return c.json({ ok: true });
});

app.post('/reviews/:id/restore', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare(`UPDATE reviews SET status = 'published', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  if (res.meta.changes === 0) throw notFound('Review not found.');
  await audit(c.env, { actor: admin, action: 'review.restore', entityType: 'review', entityId: id, ip: clientIp(c) });
  return c.json({ ok: true });
});

app.get('/domains', async (c) => {
  await requireAdmin(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT id, name, slug, custom_domain, custom_domain_status FROM businesses
     WHERE custom_domain IS NOT NULL AND deleted_at IS NULL ORDER BY id DESC LIMIT 100`
  ).all()).results;
  return c.json({ ok: true, domains: rows });
});

export default app;
