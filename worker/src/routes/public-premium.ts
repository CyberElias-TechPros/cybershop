import { Hono } from 'hono';
import type { Env } from '../config';
import { rateLimit } from '../lib/ratelimit';
import { badRequest, notFound, validationError, forbidden } from '../lib/errors';
import { getSession, requireUser } from '../lib/auth';
import { isBlocked } from '../lib/blocks';
import { clampInt, randomToken, nowIso, parseMoneyKobo } from '../lib/util';
import { optStr, reqStr } from '../lib/validate';
import { notify } from '../lib/notify';
import { initiatePaystack } from '../lib/paystack';
import { assertAddon, depositReference, hasAddon } from '../lib/premium';
import { formatNaira } from '../lib/money';

const app = new Hono<{ Bindings: Env }>();

const IP = (c: { req: { header(n: string): string | undefined | null } }) =>
  c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

/** Start an in-app thread. Gated: vendor must have paid for in_app_chat. WhatsApp stays free. */
app.post('/threads', async (c) => {
  const env = c.env;
  const ip = IP(c);
  await rateLimit(env, 'thread', ip, 12, 3600);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const bizId = Number((body as { business_id?: number }).business_id);
  if (!Number.isInteger(bizId) || bizId < 1) throw validationError('Choose a seller.');
  const listingId = (body as { listing_id?: number }).listing_id ? Number((body as { listing_id: number }).listing_id) : null;
  const name = optStr((body as { name?: string }).name, 120);
  const phone = typeof (body as { phone?: string }).phone === 'string' ? (body as { phone: string }).phone.replace(/[^\d+]/g, '').slice(0, 20) : null;
  const text = reqStr((body as { body?: string }).body, { min: 2, max: 2000 });
  const biz = (await env.DB.prepare('SELECT id, owner_user_id, name, status FROM businesses WHERE id = ? AND deleted_at IS NULL').bind(bizId).first()) as { id: number; owner_user_id: number; name: string; status: string } | null;
  if (!biz || biz.status !== 'active') throw notFound('Business not found.');
  if (!(await hasAddon(env, bizId, 'in_app_chat'))) {
    throw forbidden('This seller uses WhatsApp. In-app chat is a paid add-on they have not bought.');
  }
  if (listingId) {
    const l = (await env.DB.prepare('SELECT id FROM listings WHERE id = ? AND business_id = ? AND status = \'published\' AND deleted_at IS NULL').bind(listingId, bizId).first()) as { id: number } | null;
    if (!l) throw notFound('Listing not found.');
  }
  const user = await getSession(env, c);
  if (await isBlocked(env, user?.id, bizId)) throw forbidden('You blocked this business.');
  const token = randomToken(16);
  const res = await env.DB.prepare(
    `INSERT INTO threads (business_id, listing_id, buyer_user_id, buyer_name, buyer_phone, token)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(bizId, listingId, user?.id ?? null, name, phone, token).run();
  const threadId = Number(res.meta.last_row_id);
  await env.DB.prepare(`INSERT INTO thread_messages (thread_id, author, body) VALUES (?, 'buyer', ?)`).bind(threadId, text).run();
  if (biz.owner_user_id) {
    await notify(env, {
      userId: biz.owner_user_id,
      type: 'thread.new',
      title: name ? `${name} messaged you` : 'New in-app message',
      body: text.slice(0, 180),
      data: { thread_id: threadId },
    });
  }
  return c.json({ ok: true, token, thread_id: threadId });
});

app.get('/threads/:token', async (c) => {
  const token = c.req.param('token').slice(0, 80);
  const thread = (await c.env.DB.prepare(
    `SELECT t.*, b.name AS business_name, l.name AS item_name
     FROM threads t JOIN businesses b ON b.id = t.business_id
     LEFT JOIN listings l ON l.id = t.listing_id
     WHERE t.token = ?`
  ).bind(token).first()) as Record<string, unknown> | null;
  if (!thread) throw notFound('Conversation not found.');
  const messages = (await c.env.DB.prepare(
    `SELECT id, author, body, created_at FROM thread_messages WHERE thread_id = ? ORDER BY id`
  ).bind(thread.id).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    thread: {
      id: thread.id,
      token: thread.token,
      status: thread.status,
      business_name: thread.business_name,
      item_name: thread.item_name,
      created_at: thread.created_at,
    },
    messages,
  });
});

app.post('/threads/:token/messages', async (c) => {
  const env = c.env;
  await rateLimit(env, 'thread_msg', IP(c), 40, 3600);
  const token = c.req.param('token').slice(0, 80);
  const body = await c.req.json().catch(() => null);
  const text = reqStr(body?.body, { min: 1, max: 2000 });
  const thread = (await env.DB.prepare('SELECT * FROM threads WHERE token = ?').bind(token).first()) as { id: number; business_id: number; status: string } | null;
  if (!thread) throw notFound('Conversation not found.');
  if (thread.status !== 'open') throw forbidden('This conversation is closed.');
  if (!(await hasAddon(env, thread.business_id, 'in_app_chat'))) {
    throw forbidden('This seller no longer has in-app chat. Use WhatsApp.');
  }
  await env.DB.prepare(`INSERT INTO thread_messages (thread_id, author, body) VALUES (?, 'buyer', ?)`).bind(thread.id, text).run();
  await env.DB.prepare(`UPDATE threads SET updated_at = ? WHERE id = ?`).bind(nowIso(), thread.id).run();
  const owner = (await env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(thread.business_id).first()) as { owner_user_id: number } | null;
  if (owner) {
    await notify(env, { userId: owner.owner_user_id, type: 'thread.message', title: 'New in-app message', body: text.slice(0, 180), data: { thread_id: thread.id } });
  }
  return c.json({ ok: true });
});

/**
 * Buyer deposit via Paystack. Only if the vendor bought buyer_escrow.
 * CyberShop records the payment; we do not hold funds as a bank.
 */
app.post('/deposits', async (c) => {
  const env = c.env;
  await rateLimit(env, 'deposit', IP(c), 8, 3600);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const listingId = Number((body as { listing_id?: number }).listing_id);
  if (!Number.isInteger(listingId) || listingId < 1) throw validationError('Choose a listing.');
  const listing = (await env.DB.prepare(
    `SELECT l.id, l.name, l.price, l.business_id, b.name AS biz_name, b.status, b.owner_user_id
     FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.id = ? AND l.status = 'published' AND l.deleted_at IS NULL AND b.deleted_at IS NULL`
  ).bind(listingId).first()) as { id: number; name: string; price: number | null; business_id: number; biz_name: string; status: string; owner_user_id: number } | null;
  if (!listing || listing.status !== 'active') throw notFound('Listing not found.');
  await assertAddon(env, listing.business_id, 'buyer_escrow', 'This seller has not bought deposits. Pay them directly after you inspect — never send money through CyberShop unless they offer this add-on.');
  let amount: number;
  try {
    amount = parseMoneyKobo((body as { amount_kobo?: number }).amount_kobo);
  } catch {
    throw validationError('Enter a valid amount in kobo.');
  }
  if (amount < 10000) throw validationError('Minimum deposit is ₦100.');
  if (listing.price != null && listing.price > 0 && amount > listing.price) throw validationError('Deposit cannot be more than the asking price.');
  const name = optStr((body as { name?: string }).name, 120);
  const phone = typeof (body as { phone?: string }).phone === 'string' ? (body as { phone: string }).phone.replace(/[^\d+]/g, '').slice(0, 20) : null;
  const email = reqStr((body as { email?: string }).email || 'buyer@cybershop.ng', { min: 5, max: 190 });
  const note = optStr((body as { note?: string }).note, 500);
  const user = await getSession(env, c);
  const reference = depositReference();
  await env.DB.prepare(
    `INSERT INTO deposits (business_id, listing_id, buyer_user_id, buyer_name, buyer_phone, buyer_email, amount, reference, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(listing.business_id, listing.id, user?.id ?? null, name, phone, email, amount, reference, note).run();
  const initiated = await initiatePaystack(env, {
    reference,
    amountKobo: amount,
    email,
    name: name || 'CyberShop buyer',
    meta: { kind: 'deposit', listing_id: String(listing.id), business_id: String(listing.business_id) },
  });
  if (initiated.paystackReference) {
    await env.DB.prepare('UPDATE deposits SET paystack_reference = ? WHERE reference = ?').bind(initiated.paystackReference, reference).run();
  }
  return c.json({
    ok: true,
    reference,
    amount,
    amount_display: formatNaira(amount),
    paystack: initiated,
    disclaimer: 'CyberShop records this deposit. We are not a bank and do not hold the cash. Meet in public, inspect, then the seller releases the record.',
  });
});

app.get('/deposits/:reference', async (c) => {
  const reference = c.req.param('reference').slice(0, 80);
  const dep = (await c.env.DB.prepare(
    `SELECT d.reference, d.amount, d.status, d.created_at, d.paid_at, d.released_at, l.name AS item_name, b.name AS business_name
     FROM deposits d JOIN businesses b ON b.id = d.business_id LEFT JOIN listings l ON l.id = d.listing_id
     WHERE d.reference = ?`
  ).bind(reference).first()) as Record<string, unknown> | null;
  if (!dep) throw notFound('Deposit not found.');
  return c.json({
    ok: true,
    deposit: {
      ...dep,
      amount_display: formatNaira(Number(dep.amount)),
      disclaimer: 'CyberShop records this deposit. We are not a bank.',
    },
  });
});

app.get('/saved-searches', async (c) => {
  const user = await requireUser(c.env, c);
  const rows = (await c.env.DB.prepare(
    `SELECT id, q, city, category, min_price, max_price, created_at FROM saved_searches WHERE buyer_user_id = ? ORDER BY id DESC LIMIT 40`
  ).bind(user.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, searches: rows });
});

app.post('/saved-searches', async (c) => {
  const user = await requireUser(c.env, c);
  const body = await c.req.json().catch(() => null) || {};
  const q = optStr(body.q, 80);
  const city = optStr(body.city, 80);
  const category = optStr(body.category, 60);
  const minPrice = body.min_price != null && body.min_price !== '' ? clampInt(body.min_price, 0, 100_000_000_000, 0) : null;
  const maxPrice = body.max_price != null && body.max_price !== '' ? clampInt(body.max_price, 0, 100_000_000_000, 0) : null;
  if (!q && !city && !category && minPrice == null && maxPrice == null) throw validationError('Save a search with at least one filter.');
  const last = ((await c.env.DB.prepare(`SELECT COALESCE(MAX(id),0) AS n FROM listings`).first()) as { n: number }).n;
  const res = await c.env.DB.prepare(
    `INSERT INTO saved_searches (buyer_user_id, q, city, category, min_price, max_price, last_seen_listing_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(user.id, q, city, category, minPrice, maxPrice, last).run();
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.delete('/saved-searches/:id', async (c) => {
  const user = await requireUser(c.env, c);
  const id = clampInt(c.req.param('id'), 1, 1e12, 0);
  const res = await c.env.DB.prepare(`DELETE FROM saved_searches WHERE id = ? AND buyer_user_id = ?`).bind(id, user.id).run();
  if (res.meta.changes === 0) throw notFound('Saved search not found.');
  return c.json({ ok: true });
});

export default app;
