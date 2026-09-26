import { Hono } from 'hono';
import type { Env } from '../config';
import { requireAdmin } from '../lib/auth';
import { notFound } from '../lib/errors';
import { reqInt, optStr, reqStr } from '../lib/validate';
import { nowIso } from '../lib/util';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
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

/** Add days to the current term. Does not unsuspend a store an admin closed for policy. */
app.post('/subscriptions/:id/extend', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const days = reqInt(body?.days, { min: 1, max: 365 });
  const sub = (await c.env.DB.prepare(
    `SELECT s.id, s.business_id, s.expires_at, b.owner_user_id, b.name, b.status AS business_status
     FROM subscriptions s JOIN businesses b ON b.id = s.business_id WHERE s.id = ?`
  ).bind(id).first()) as { id: number; business_id: number; expires_at: string | null; owner_user_id: number; name: string; business_status: string } | null;
  if (!sub) throw notFound('Subscription not found.');
  const base = sub.expires_at && sub.expires_at > nowIso() ? new Date(sub.expires_at).getTime() : Date.now();
  const next = new Date(base + days * 86400_000).toISOString();
  await c.env.DB.prepare(`UPDATE subscriptions SET status = 'active', expires_at = ?, renews_at = ?, grace_until = NULL WHERE id = ?`).bind(next, next, id).run();
  if (sub.business_status === 'expired') {
    await c.env.DB.prepare(`UPDATE businesses SET status = 'active' WHERE id = ? AND status = 'expired'`).bind(sub.business_id).run();
  }
  await notify(c.env, {
    userId: sub.owner_user_id,
    type: 'subscription.extended',
    title: `Your plan was extended by ${days} days`,
    body: sub.business_status === 'suspended'
      ? `${sub.name} is still suspended. The extra days apply once an admin reactivates the store.`
      : `${sub.name} is covered until ${next.slice(0, 10)}.`,
  });
  await audit(c.env, { actor: admin, action: 'subscription.extend', entityType: 'subscription', entityId: id, ip: clientIp(c), meta: { days, expires_at: next } });
  return c.json({ ok: true, expires_at: next });
});

/** Stop the plan. The catalogue stays; the storefront goes dark. */
app.post('/subscriptions/:id/revoke', async (c) => {
  const admin = await requireAdmin(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const note = reqStr(body?.note, { min: 5, max: 500 });
  const sub = (await c.env.DB.prepare(
    `SELECT s.id, s.business_id, b.owner_user_id, b.name FROM subscriptions s JOIN businesses b ON b.id = s.business_id WHERE s.id = ?`
  ).bind(id).first()) as { id: number; business_id: number; owner_user_id: number; name: string } | null;
  if (!sub) throw notFound('Subscription not found.');
  await c.env.DB.prepare(`UPDATE subscriptions SET status = 'cancelled', grace_until = NULL WHERE id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE businesses SET status = 'suspended' WHERE id = ? AND status IN ('active','expired')`).bind(sub.business_id).run();
  await notify(c.env, {
    userId: sub.owner_user_id,
    type: 'business.suspended',
    title: 'Your plan was revoked',
    body: `${sub.name} is hidden from buyers. ${note}`,
  });
  await audit(c.env, { actor: admin, action: 'subscription.revoke', entityType: 'subscription', entityId: id, ip: clientIp(c), meta: { note } });
  return c.json({ ok: true });
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

function csv(rows: (string | number | null)[][]): Response {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return new Response(body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cybershop-export.csv"', 'cache-control': 'no-store' },
  });
}

/** A copy the operator can keep. Not a substitute for D1 backups. */
app.get('/export', async (c) => {
  await requireAdmin(c.env, c);
  const kind = c.req.query('kind') || 'businesses';
  if (kind === 'listings') {
    const rows = (await c.env.DB.prepare(
      `SELECT l.id, b.slug AS store, l.name, l.slug AS item_slug, l.status, l.price, l.created_at FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.deleted_at IS NULL ORDER BY l.id LIMIT 5000`
    ).all()).results as Record<string, unknown>[];
    return csv([['id', 'store', 'name', 'slug', 'status', 'price_kobo', 'created_at'], ...rows.map((r) => [r.id as number, String(r.store), String(r.name), String(r.item_slug), String(r.status), r.price as number, String(r.created_at)])]);
  }
  if (kind === 'payments') {
    const rows = (await c.env.DB.prepare(
      `SELECT p.id, p.reference, p.amount, p.method, p.status, p.created_at, b.name AS store FROM payments p JOIN businesses b ON b.id = p.business_id ORDER BY p.id DESC LIMIT 5000`
    ).all()).results as Record<string, unknown>[];
    return csv([['id', 'reference', 'amount_kobo', 'method', 'status', 'created_at', 'store'], ...rows.map((r) => [r.id as number, String(r.reference), r.amount as number, String(r.method), String(r.status), String(r.created_at), String(r.store)])]);
  }
  const rows = (await c.env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.status, b.city, u.email, b.created_at FROM businesses b JOIN users u ON u.id = b.owner_user_id WHERE b.deleted_at IS NULL ORDER BY b.id LIMIT 5000`
  ).all()).results as Record<string, unknown>[];
  return csv([['id', 'name', 'slug', 'status', 'city', 'owner_email', 'created_at'], ...rows.map((r) => [r.id as number, String(r.name), String(r.slug), String(r.status), r.city == null ? '' : String(r.city), String(r.email), String(r.created_at)])]);
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
