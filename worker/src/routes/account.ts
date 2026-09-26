import { Hono } from 'hono';
import type { Env } from '../config';
import { requireUser, destroySession } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { badRequest, forbidden, notFound, validationError } from '../lib/errors';
import { reqStr, reqPassword, optStr, reqInt } from '../lib/validate';
import { nowIso, randomToken } from '../lib/util';
import { mediaUrl } from '../lib/media';
import { formatNaira } from '../lib/money';
import { notify } from '../lib/notify';
import { mailConfigured, sendEmail, mailHtml } from '../lib/mail';
import { rateLimit } from '../lib/ratelimit';
import { clientIp } from '../lib/ip';
import { ensureReferralCode, referralLink, referralCredit } from '../lib/referral';

const app = new Hono<{ Bindings: Env }>();

function listingCard(env: Env, row: Record<string, unknown>) {
  const priceType = String(row.price_type || 'fixed');
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  return {
    listing_id: row.id,
    name: row.name,
    slug: row.slug,
    url_segment: row.url_segment,
    biz_slug: row.biz_slug,
    biz_name: row.biz_name,
    city: row.city ?? null,
    status: row.status,
    unavailable: row.lstatus !== 'published' || row.bstatus !== 'active',
    price_display: priceType === 'negotiable' ? 'Price on request' : priceType === 'free' ? 'Free' : formatNaira(price),
    image: row.media_id0 && row.storage_key0 && row.driver0
      ? mediaUrl(env, { driver: row.driver0 as 'd1', storage_key: String(row.storage_key0), id: Number(row.media_id0) })
      : null,
    saved_at: row.saved_at ?? row.viewed_at ?? null,
  };
}

const CARD_SQL = `
  l.id, l.name, l.slug, l.price, l.price_type, l.status AS lstatus, t.url_segment,
  b.slug AS biz_slug, b.name AS biz_name, b.city, b.status AS bstatus,
  (SELECT m.id FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS media_id0,
  (SELECT m.storage_key FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS storage_key0,
  (SELECT m.driver FROM item_media im JOIN media m ON m.id = im.media_id WHERE im.listing_id = l.id ORDER BY im.position LIMIT 1) AS driver0
`;

app.get('/home', async (c) => {
  const user = await requireUser(c.env, c);
  const fav = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM favorites WHERE buyer_user_id = ?').bind(user.id).first()) as { n: number };
  const inq = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE buyer_user_id = ?').bind(user.id).first()) as { n: number };
  const threads = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM threads WHERE buyer_user_id = ? AND status = \'open\'').bind(user.id).first()) as { n: number };
  const searches = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM saved_searches WHERE buyer_user_id = ?').bind(user.id).first()) as { n: number };
  const row = (await c.env.DB.prepare('SELECT phone, email_verified_at FROM users WHERE id = ?').bind(user.id).first()) as { phone: string | null; email_verified_at: string | null } | null;
  const code = await ensureReferralCode(c.env, user.id);
  const savedBiz = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM saved_businesses WHERE buyer_user_id = ?').bind(user.id).first()) as { n: number };
  return c.json({
    ok: true,
    user: { id: user.id, role: user.role, name: user.name, email: user.email, phone: row?.phone ?? null, email_verified: !!row?.email_verified_at, member_role: user.member_role ?? null },
    counts: { favorites: fav.n, inquiries: inq.n, threads: threads.n, saved_searches: searches.n, saved_businesses: savedBiz.n, unread: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first() as { n: number }).n },
    referral: { code, link: referralLink(c.env, code), credit_kobo: await referralCredit(c.env, user.id) },
  });
});

app.put('/profile', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const name = reqStr(body?.name, { min: 2, max: 120 });
  const phone = body?.phone ? String(body.phone).replace(/[^\d+]/g, '').slice(0, 20) : null;
  await c.env.DB.prepare('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?').bind(name, phone, nowIso(), user.id).run();
  return c.json({ ok: true });
});

app.post('/password', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const current = String(body?.current || '');
  const next = reqPassword(body?.password);
  const row = (await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first()) as { password_hash: string } | null;
  if (!row || !(await verifyPassword(current, row.password_hash))) throw forbidden('Current password is incorrect.');
  const hash = await hashPassword(next);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, nowIso(), user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  destroySession(c.env, c);
  return c.json({ ok: true, message: 'Password updated. Sign in again.' });
});

app.post('/verify-email/request', async (c) => {
  const user = await requireUser(c.env, c);
  await rateLimit(c.env, 'verify-email', String(user.id), 3, 3600);
  const token = randomToken(24);
  const expires = String(Math.floor(Date.now() / 1000) + 86400);
  await c.env.DB.prepare('UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?').bind(token, expires, user.id).run();
  const url = `${c.env.APP_URL}/verify-email?token=${token}`;
  if (mailConfigured(c.env)) {
    await sendEmail(c.env, {
      to: user.email,
      subject: 'Confirm your CyberShop email',
      text: `Confirm your email:\n${url}\n\nThe link works for 24 hours.`,
      html: mailHtml('Confirm your email', 'Tap below to confirm this address. The link works for 24 hours.', { label: 'Confirm email', url }),
    });
    return c.json({ ok: true, message: 'Confirmation email sent.' });
  }
  if (c.env.SESSION_SECURE === '0') return c.json({ ok: true, dev_mode: true, verify_url: url });
  return c.json({ ok: true, message: 'Email is not configured yet. Ask support to confirm your address.' });
});

app.post('/verify-email', async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[a-f0-9]{48}$/.test(token)) throw badRequest('Invalid or expired confirmation link.');
  const row = (await c.env.DB.prepare(
    'SELECT id FROM users WHERE email_verify_token = ? AND email_verify_expires > ? AND deleted_at IS NULL'
  ).bind(token, String(Math.floor(Date.now() / 1000))).first()) as { id: number } | null;
  if (!row) throw badRequest('Invalid or expired confirmation link.');
  await c.env.DB.prepare(
    'UPDATE users SET email_verified_at = ?, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?'
  ).bind(nowIso(), row.id).run();
  return c.json({ ok: true, message: 'Email confirmed.' });
});

app.get('/export', async (c) => {
  const user = await requireUser(c.env, c);
  const profile = await c.env.DB.prepare('SELECT id, role, name, email, phone, created_at, email_verified_at FROM users WHERE id = ?').bind(user.id).first();
  const inquiries = (await c.env.DB.prepare('SELECT id, business_id, listing_id, message, status, created_at FROM inquiries WHERE buyer_user_id = ? ORDER BY id DESC LIMIT 500').bind(user.id).all()).results;
  const favorites = (await c.env.DB.prepare('SELECT listing_id, created_at FROM favorites WHERE buyer_user_id = ?').bind(user.id).all()).results;
  const searches = (await c.env.DB.prepare('SELECT id, q, city, category, min_price, max_price, created_at FROM saved_searches WHERE buyer_user_id = ?').bind(user.id).all()).results;
  const reviews = (await c.env.DB.prepare('SELECT id, business_id, listing_id, rating, title, body, created_at FROM reviews WHERE buyer_user_id = ?').bind(user.id).all()).results;
  return c.json({ ok: true, export: { profile, inquiries, favorites, saved_searches: searches, reviews, generated_at: nowIso() } });
});

app.post('/close', async (c) => {
  const user = await requireUser(c.env, c);
  if (user.role === 'admin') throw forbidden('Admin accounts are closed from the database, not this form.');
  const body = await c.req.json().catch(() => null);
  const row = (await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first()) as { password_hash: string };
  if (!(await verifyPassword(String(body?.password || ''), row.password_hash))) throw forbidden('Password is incorrect.');
  const now = nowIso();
  const owned = (await c.env.DB.prepare('SELECT id FROM businesses WHERE owner_user_id = ? AND deleted_at IS NULL').bind(user.id).all()).results as { id: number }[];
  for (const b of owned) {
    await c.env.DB.prepare(`UPDATE businesses SET status = 'cancelled', deleted_at = ? WHERE id = ?`).bind(now, b.id).run();
    await c.env.DB.prepare(`UPDATE listings SET status = 'archived', deleted_at = ? WHERE business_id = ? AND deleted_at IS NULL`).bind(now, b.id).run();
  }
  await c.env.DB.prepare(`UPDATE business_members SET status = 'removed' WHERE user_id = ?`).bind(user.id).run();
  const closedEmail = `closed-${user.id}-${Date.now()}@closed.cybershop.invalid`;
  await c.env.DB.prepare(`UPDATE users SET status = 'deleted', deleted_at = ?, email = ? WHERE id = ?`).bind(now, closedEmail, user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  destroySession(c.env, c);
  return c.json({ ok: true, message: 'Account closed. Your storefront is unpublished.' });
});

app.get('/favorites', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT ${CARD_SQL}, f.created_at AS saved_at
     FROM favorites f
     JOIN listings l ON l.id = f.listing_id
     JOIN businesses b ON b.id = l.business_id
     JOIN item_types t ON t.id = l.item_type_id
     WHERE f.buyer_user_id = ? AND l.deleted_at IS NULL
     ORDER BY f.created_at DESC LIMIT 80`
  ).bind(user.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, favorites: rows.map((r) => listingCard(c.env, r)) });
});

app.post('/favorites', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const listingId = reqInt(body?.listing_id, { min: 1 });
  const exists = await c.env.DB.prepare('SELECT 1 FROM listings WHERE id = ? AND deleted_at IS NULL').bind(listingId).first();
  if (!exists) throw notFound('Listing not found.');
  const already = await c.env.DB.prepare('SELECT 1 FROM favorites WHERE buyer_user_id = ? AND listing_id = ?').bind(user.id, listingId).first();
  if (already) {
    await c.env.DB.prepare('DELETE FROM favorites WHERE buyer_user_id = ? AND listing_id = ?').bind(user.id, listingId).run();
    return c.json({ ok: true, saved: false });
  }
  await c.env.DB.prepare('INSERT INTO favorites (buyer_user_id, listing_id, created_at) VALUES (?, ?, ?)').bind(user.id, listingId, nowIso()).run();
  return c.json({ ok: true, saved: true });
});

app.get('/businesses', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.city, b.status, s.created_at
     FROM saved_businesses s JOIN businesses b ON b.id = s.business_id
     WHERE s.buyer_user_id = ? AND b.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 80`
  ).bind(user.id).all()).results;
  return c.json({ ok: true, businesses: rows });
});

app.post('/businesses', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const businessId = reqInt(body?.business_id, { min: 1 });
  const biz = await c.env.DB.prepare('SELECT id, owner_user_id FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(businessId).first() as { id: number; owner_user_id: number } | null;
  if (!biz) throw notFound('Business not found.');
  if (biz.owner_user_id === user.id) throw badRequest('You already own this store.');
  const already = await c.env.DB.prepare('SELECT 1 FROM saved_businesses WHERE buyer_user_id = ? AND business_id = ?').bind(user.id, businessId).first();
  if (already) {
    await c.env.DB.prepare('DELETE FROM saved_businesses WHERE buyer_user_id = ? AND business_id = ?').bind(user.id, businessId).run();
    return c.json({ ok: true, saved: false });
  }
  await c.env.DB.prepare('INSERT INTO saved_businesses (buyer_user_id, business_id, created_at) VALUES (?, ?, ?)').bind(user.id, businessId, nowIso()).run();
  return c.json({ ok: true, saved: true });
});

app.delete('/businesses/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await c.env.DB.prepare('DELETE FROM saved_businesses WHERE buyer_user_id = ? AND business_id = ?').bind(user.id, id).run();
  return c.json({ ok: true });
});

app.post('/favorites/sync', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.listing_ids) ? body.listing_ids.slice(0, 80) : [];
  let added = 0;
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) continue;
    const ok = await c.env.DB.prepare(`SELECT id FROM listings WHERE id = ? AND status = 'published' AND deleted_at IS NULL`).bind(id).first();
    if (!ok) continue;
    const res = await c.env.DB.prepare('INSERT OR IGNORE INTO favorites (buyer_user_id, listing_id, created_at) VALUES (?, ?, ?)').bind(user.id, id, nowIso()).run();
    added += Number(res.meta.changes || 0);
  }
  return c.json({ ok: true, added });
});

app.delete('/favorites/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await c.env.DB.prepare('DELETE FROM favorites WHERE buyer_user_id = ? AND listing_id = ?').bind(user.id, id).run();
  return c.json({ ok: true });
});

app.get('/recent', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT ${CARD_SQL}, rv.viewed_at
     FROM recent_views rv
     JOIN listings l ON l.id = rv.listing_id
     JOIN businesses b ON b.id = l.business_id
     JOIN item_types t ON t.id = l.item_type_id
     WHERE rv.buyer_user_id = ? AND l.deleted_at IS NULL
     ORDER BY rv.viewed_at DESC LIMIT 24`
  ).bind(user.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, recent: rows.map((r) => listingCard(c.env, r)) });
});

app.get('/inquiries', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT i.id, i.status, i.created_at, i.buyer_name, i.message, i.variant_label, l.name AS item_name, b.name AS business_name, b.slug AS business_slug
     FROM inquiries i JOIN businesses b ON b.id = i.business_id
     LEFT JOIN listings l ON l.id = i.listing_id
     WHERE i.buyer_user_id = ? ORDER BY i.id DESC LIMIT 100`
  ).bind(user.id).all()).results;
  return c.json({ ok: true, inquiries: rows });
});

app.get('/threads', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT t.id, t.token, t.status, t.updated_at, b.name AS business_name, l.name AS item_name
     FROM threads t JOIN businesses b ON b.id = t.business_id
     LEFT JOIN listings l ON l.id = t.listing_id
     WHERE t.buyer_user_id = ? ORDER BY t.updated_at DESC LIMIT 50`
  ).bind(user.id).all()).results;
  return c.json({ ok: true, threads: rows });
});

app.get('/deposits', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT d.id, d.reference, d.amount, d.status, d.created_at, d.refund_requested, b.name AS business_name, l.name AS item_name
     FROM deposits d JOIN businesses b ON b.id = d.business_id
     LEFT JOIN listings l ON l.id = d.listing_id
     WHERE d.buyer_user_id = ? ORDER BY d.id DESC LIMIT 40`
  ).bind(user.id).all()).results as { amount: number }[];
  return c.json({ ok: true, deposits: rows.map((d) => ({ ...d, amount_display: formatNaira(d.amount) })) });
});

app.post('/deposits/:id/refund-request', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const dep = (await c.env.DB.prepare('SELECT * FROM deposits WHERE id = ? AND buyer_user_id = ?').bind(id, user.id).first()) as { id: number; status: string; business_id: number; reference: string } | null;
  if (!dep) throw notFound('Deposit not found.');
  if (dep.status !== 'paid') throw badRequest('You can only ask for a refund on a recorded payment.');
  await c.env.DB.prepare('UPDATE deposits SET refund_requested = 1 WHERE id = ?').bind(id).run();
  const owner = (await c.env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(dep.business_id).first()) as { owner_user_id: number } | null;
  if (owner) {
    await notify(c.env, {
      userId: owner.owner_user_id,
      type: 'deposit.refund_requested',
      title: 'Buyer asked for a refund',
      body: `${dep.reference} — confirm you returned the money, then mark it refunded. CyberShop does not move funds.`,
      data: { deposit_id: dep.id },
    });
  }
  return c.json({ ok: true, message: 'The seller has been asked. CyberShop does not hold the money.' });
});

app.get('/notifications', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    'SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60'
  ).bind(user.id).all()).results;
  return c.json({ ok: true, notifications: rows });
});

app.post('/notifications/read', async (c) => {
  const user = await requireUser(c.env, c);
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(nowIso(), user.id).run();
  return c.json({ ok: true });
});

app.get('/blocks', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT b.id, b.name, b.slug, bl.created_at FROM blocks bl JOIN businesses b ON b.id = bl.business_id WHERE bl.buyer_user_id = ? ORDER BY bl.created_at DESC`
  ).bind(user.id).all()).results;
  return c.json({ ok: true, blocks: rows });
});

app.post('/blocks', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null);
  const businessId = reqInt(body?.business_id, { min: 1 });
  const biz = await c.env.DB.prepare('SELECT id, owner_user_id FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(businessId).first() as { id: number; owner_user_id: number } | null;
  if (!biz) throw notFound('Business not found.');
  if (biz.owner_user_id === user.id) throw badRequest('You cannot block your own store.');
  await c.env.DB.prepare('INSERT OR IGNORE INTO blocks (buyer_user_id, business_id, created_at) VALUES (?, ?, ?)').bind(user.id, businessId, nowIso()).run();
  return c.json({ ok: true });
});

app.delete('/blocks/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  await c.env.DB.prepare('DELETE FROM blocks WHERE buyer_user_id = ? AND business_id = ?').bind(user.id, id).run();
  return c.json({ ok: true });
});

app.get('/reviews', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.title, r.body, r.status, r.created_at, b.name AS business_name, l.name AS item_name
     FROM reviews r JOIN businesses b ON b.id = r.business_id LEFT JOIN listings l ON l.id = r.listing_id
     WHERE r.buyer_user_id = ? ORDER BY r.id DESC LIMIT 40`
  ).bind(user.id).all()).results;
  return c.json({ ok: true, reviews: rows });
});

app.post('/reviews', async (c) => {
  const user = await requireUser(c.env, c);
  await rateLimit(c.env, 'review', String(user.id), 10, 3600);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const businessId = reqInt(body.business_id, { min: 1 });
  const listingId = body.listing_id ? reqInt(body.listing_id, { min: 1 }) : null;
  const rating = reqInt(body.rating, { min: 1, max: 5 });
  const title = optStr(body.title, 120);
  const text = optStr(body.body, 2000);
  if (!text || text.length < 8) throw validationError('Write at least a sentence about the real conversation.');
  const biz = (await c.env.DB.prepare('SELECT id, owner_user_id, name FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(businessId).first()) as { id: number; owner_user_id: number; name: string } | null;
  if (!biz) throw notFound('Business not found.');
  if (biz.owner_user_id === user.id) throw forbidden('You cannot review your own store.');
  if (listingId) {
    const listing = await c.env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND deleted_at IS NULL').bind(listingId, businessId).first();
    if (!listing) throw notFound('Listing not found.');
  }
  const inquiry = (await c.env.DB.prepare(
    `SELECT id FROM inquiries WHERE buyer_user_id = ? AND business_id = ? ORDER BY id DESC LIMIT 1`
  ).bind(user.id, businessId).first()) as { id: number } | null;
  if (!inquiry) throw forbidden('Reviews are only for people who actually enquired. Send a WhatsApp enquiry first — we do not publish ratings without that.');
  try {
    await c.env.DB.prepare(
      `INSERT INTO reviews (business_id, listing_id, buyer_user_id, inquiry_id, rating, title, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`
    ).bind(businessId, listingId, user.id, inquiry.id, rating, title, text, nowIso(), nowIso()).run();
  } catch {
    throw validationError('You already reviewed this.');
  }
  await notify(c.env, {
    userId: biz.owner_user_id,
    type: 'review.new',
    title: `New ${rating}-star review`,
    body: `${user.name} reviewed ${biz.name}.`,
    data: { business_id: businessId, listing_id: listingId },
  });
  return c.json({ ok: true, message: 'Review published. It only shows because you enquired.' });
});

app.delete('/reviews/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = reqInt(c.req.param('id'), { min: 1 });
  const res = await c.env.DB.prepare('DELETE FROM reviews WHERE id = ? AND buyer_user_id = ?').bind(id, user.id).run();
  if (res.meta.changes === 0) throw notFound('Review not found.');
  return c.json({ ok: true });
});

export default app;
