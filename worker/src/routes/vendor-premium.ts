import { Hono } from 'hono';
import type { Env } from '../config';
import { requireVendor } from '../lib/auth';
import { badRequest, notFound, forbidden } from '../lib/errors';
import { nowIso } from '../lib/util';
import { optStr, reqStr, reqInt } from '../lib/validate';
import { assertAddon, featuredRemaining, hasAddon, publicPremium, releaseDeposit } from '../lib/premium';
import { formatNaira } from '../lib/money';
import { assertMediaOwnership } from '../lib/media';

const app = new Hono<{ Bindings: Env }>();

app.get('/premium', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const biz = (await c.env.DB.prepare('SELECT verification_status FROM businesses WHERE id = ?').bind(business.id).first()) as { verification_status: string };
  const flags = await publicPremium(c.env, business.id, biz.verification_status);
  const featured = await featuredRemaining(c.env, business.id);
  return c.json({ ok: true, flags, featured });
});

app.get('/threads', async (c) => {
  const { business } = await requireVendor(c.env, c);
  if (!(await hasAddon(c.env, business.id, 'in_app_chat'))) {
    return c.json({ ok: true, threads: [], locked: true, message: 'Buy the In-app inbox add-on to chat here. WhatsApp stays free.' });
  }
  const rows = (await c.env.DB.prepare(
    `SELECT t.id, t.buyer_name, t.buyer_phone, t.status, t.updated_at, t.created_at, l.name AS item_name,
            (SELECT body FROM thread_messages WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) AS last_body
     FROM threads t LEFT JOIN listings l ON l.id = t.listing_id
     WHERE t.business_id = ? ORDER BY t.updated_at DESC LIMIT 80`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, threads: rows, locked: false });
});

app.get('/threads/:id', async (c) => {
  const { business } = await requireVendor(c.env, c);
  await assertAddon(c.env, business.id, 'in_app_chat', 'Buy the In-app inbox add-on first.');
  const id = reqInt(c.req.param('id'), { min: 1 });
  const thread = (await c.env.DB.prepare(
    `SELECT t.*, l.name AS item_name FROM threads t LEFT JOIN listings l ON l.id = t.listing_id
     WHERE t.id = ? AND t.business_id = ?`
  ).bind(id, business.id).first()) as Record<string, unknown> | null;
  if (!thread) throw notFound('Conversation not found.');
  const messages = (await c.env.DB.prepare(
    `SELECT id, author, body, created_at FROM thread_messages WHERE thread_id = ? ORDER BY id`
  ).bind(id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, thread, messages });
});

app.post('/threads/:id/messages', async (c) => {
  const { business } = await requireVendor(c.env, c);
  await assertAddon(c.env, business.id, 'in_app_chat', 'Buy the In-app inbox add-on first.');
  const id = reqInt(c.req.param('id'), { min: 1 });
  const body = await c.req.json().catch(() => null);
  const text = reqStr(body?.body, { min: 1, max: 2000 });
  const thread = (await c.env.DB.prepare('SELECT id, status FROM threads WHERE id = ? AND business_id = ?').bind(id, business.id).first()) as { id: number; status: string } | null;
  if (!thread) throw notFound('Conversation not found.');
  if (thread.status !== 'open') throw forbidden('This conversation is closed.');
  await c.env.DB.prepare(`INSERT INTO thread_messages (thread_id, author, body) VALUES (?, 'vendor', ?)`).bind(id, text).run();
  await c.env.DB.prepare(`UPDATE threads SET updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  return c.json({ ok: true });
});

app.get('/deposits', async (c) => {
  const { business } = await requireVendor(c.env, c);
  if (!(await hasAddon(c.env, business.id, 'buyer_escrow'))) {
    return c.json({ ok: true, deposits: [], locked: true, message: 'Buy Deposits via Paystack to accept recorded deposits. CyberShop is not a bank.' });
  }
  const rows = (await c.env.DB.prepare(
    `SELECT d.*, l.name AS item_name FROM deposits d LEFT JOIN listings l ON l.id = d.listing_id
     WHERE d.business_id = ? ORDER BY d.id DESC LIMIT 80`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return c.json({
    ok: true,
    locked: false,
    deposits: rows.map((d) => ({ ...d, amount_display: formatNaira(Number(d.amount)) })),
    disclaimer: 'CyberShop records these deposits. We do not hold the money as a bank. Release after you meet and inspect.',
  });
});

app.post('/deposits/:id/release', async (c) => {
  const { business } = await requireVendor(c.env, c);
  await assertAddon(c.env, business.id, 'buyer_escrow', 'Buy the deposits add-on first.');
  const id = reqInt(c.req.param('id'), { min: 1 });
  await releaseDeposit(c.env, business.id, id);
  return c.json({ ok: true });
});

app.get('/verification', async (c) => {
  const { business } = await requireVendor(c.env, c);
  const biz = (await c.env.DB.prepare('SELECT verification_status FROM businesses WHERE id = ?').bind(business.id).first()) as { verification_status: string };
  const paid = await hasAddon(c.env, business.id, 'verified_id');
  const latest = (await c.env.DB.prepare(
    `SELECT id, status, note, review_note, created_at, reviewed_at FROM verification_requests WHERE business_id = ? ORDER BY id DESC LIMIT 5`
  ).bind(business.id).all()).results as Record<string, unknown>[];
  return c.json({ ok: true, verification_status: biz.verification_status, addon: paid, requests: latest });
});

app.post('/verification', async (c) => {
  const { business } = await requireVendor(c.env, c);
  await assertAddon(c.env, business.id, 'verified_id', 'Buy the Verified ID add-on first, then submit your ID for review. Payment does not auto-verify you.');
  const body = await c.req.json().catch(() => null) || {};
  const note = optStr(body.note, 500);
  let mediaId: number | null = null;
  if (body.media_id != null) {
    mediaId = reqInt(body.media_id, { min: 1 });
    await assertMediaOwnership(c.env, mediaId, business.id);
  }
  const open = (await c.env.DB.prepare(
    `SELECT id FROM verification_requests WHERE business_id = ? AND status = 'pending'`
  ).bind(business.id).first()) as { id: number } | null;
  if (open) throw badRequest('You already have a request under review.');
  await c.env.DB.prepare(
    `INSERT INTO verification_requests (business_id, media_id, note) VALUES (?, ?, ?)`
  ).bind(business.id, mediaId, note).run();
  await c.env.DB.prepare(`UPDATE businesses SET verification_status = 'pending' WHERE id = ? AND verification_status = 'unverified'`).bind(business.id).run();
  return c.json({ ok: true, message: 'Submitted. An admin will review your ID. Buying the add-on does not verify you automatically.' });
});

export default app;
