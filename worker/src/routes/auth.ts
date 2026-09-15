import { Hono } from 'hono';
import type { Env } from '../config';
import { hashPassword, verifyPassword, passwordNeedsUpgrade } from '../lib/crypto';
import { createSession, requireUser, destroySession, getSession } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { AppError, badRequest, validationError, conflict } from '../lib/errors';
import { slugify, assertSlugAvailable, nowIso, randomToken } from '../lib/util';
import { reqStr, reqEmail, reqPassword, optStr, isEmail, reqPhone } from '../lib/validate';
import { activateFreePlan } from '../lib/payments';
import { normalizeWaNumber } from '../lib/wa';
import { clientIp } from '../lib/ip';

const app = new Hono<{ Bindings: Env }>();

/**
 * Vendor + buyer registration. For vendors, business basics are captured here
 * (the onboarding wizard's first screen); plan selection + payment come next.
 */
app.post('/register', async (c) => {
  const ip = clientIp(c);
  await rateLimit(c.env, 'register', ip, 3, 3600);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Invalid request.');
  const role = body.role === 'buyer' ? 'buyer' : 'vendor';
  const name = reqStr(body.name, { min: 2, max: 120 });
  const email = reqEmail(body.email);
  const password = reqPassword(body.password);
  const phone = body.phone ? reqPhone(body.phone) : null;

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existing) throw conflict('An account with this email already exists.');

  const hash = await hashPassword(password);
  const res = await c.env.DB.prepare('INSERT INTO users (role, name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(role, name, email, phone, hash, 'active').run();
  const userId = Number(res.meta.last_row_id);

  let businessId: number | null = null;
  if (role === 'vendor') {
    const businessName = reqStr(body.business_name, { min: 2, max: 160 });
    let slug = reqStr(body.slug || '', { max: 170 }) || slugify(businessName);
    assertSlugAvailable(slug);
    const slugTaken = await c.env.DB.prepare('SELECT id FROM businesses WHERE slug = ? AND deleted_at IS NULL').bind(slug).first();
    if (slugTaken) throw conflict('This store name is already taken. Try another.');
    const categorySlug = reqStr(body.category_slug || '', { min: 2, max: 140 });
    const category = (await c.env.DB.prepare('SELECT id, name FROM categories WHERE slug = ? AND is_active = 1 AND deleted_at IS NULL').bind(categorySlug).first()) as { id: number; name: string } | null;
    if (!category) throw validationError('Choose a valid business category.');
    const whatsapp = body.whatsapp_number ? normalizeWaNumber(String(body.whatsapp_number)) : null;

    const bres = await c.env.DB.prepare(
      `INSERT INTO businesses (owner_user_id, name, slug, status, city, state_region) VALUES (?, ?, ?, 'pending_payment', ?, ?)`
    ).bind(userId, businessName, slug, optStr(body.city, 120), optStr(body.state_region, 120)).run();
    businessId = Number(bres.meta.last_row_id);
    await c.env.DB.prepare('INSERT INTO business_categories (business_id, category_id) VALUES (?, ?)').bind(businessId, category.id).run();
    if (whatsapp) {
      await c.env.DB.prepare(`INSERT INTO whatsapp_numbers (business_id, number, label, is_default) VALUES (?, ?, 'General', 1)`).bind(businessId, whatsapp).run();
    }
    // default free subscription (trial) so the store can be activated via the free plan or upgraded later
    const freePlan = (await c.env.DB.prepare(`SELECT id FROM plans WHERE slug = 'free' AND is_active = 1 LIMIT 1`).first()) as { id: number } | null;
    if (freePlan) {
      await c.env.DB.prepare(`INSERT INTO subscriptions (business_id, plan_id, status, starts_at) VALUES (?, ?, 'trialing', ?)`).bind(businessId, freePlan.id, nowIso()).run();
    }
  }

  const user = { id: userId, role, name, email, business_id: businessId } as const;
  await createSession(c.env, c, user as never);
  return c.json({ ok: true, user: { id: userId, role, name, email, business_id: businessId } });
});

app.post('/login', async (c) => {
  const ip = clientIp(c);
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  await rateLimit(c.env, 'login', `${ip}:${email}`, 5, 900);
  if (!email) throw badRequest('Enter your email.');
  const user = (await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()) as
    | { id: number; role: string; name: string; email: string; password_hash: string; status: string }
    | null;
  // constant-shape response: same error for unknown email / bad password
  if (!user || !(await verifyPassword(String(body?.password || ''), user.password_hash))) {
    throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
  }
  if (user.status !== 'active') throw new AppError(403, 'account_suspended', 'This account is suspended. Contact support.');
  await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), user.id).run();
  const biz = user.role === 'vendor'
    ? ((await c.env.DB.prepare('SELECT id FROM businesses WHERE owner_user_id = ? AND deleted_at IS NULL').bind(user.id).first()) as { id: number } | null)?.id ?? null
    : null;
  await createSession(c.env, c, { id: user.id, role: user.role as never, name: user.name, email: user.email, business_id: biz } as never);
  return c.json({ ok: true, user: { id: user.id, role: user.role, name: user.name, email: user.email, business_id: biz } });
});

app.post('/logout', async (c) => {
  const session = await getSession(c.env, c);
  if (session) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.id).run();
  }
  destroySession(c.env, c);
  return c.json({ ok: true });
});

app.get('/me', async (c) => {
  const user = await requireUser(c.env, c);
  let business: Record<string, unknown> | null = null;
  if (user.role === 'vendor' && user.business_id) {
    business = await c.env.DB.prepare(
      `SELECT b.id, b.name, b.slug, b.status, b.about, b.city, b.state_region, s.plan_id, p.name AS plan_name, s.status AS sub_status, s.expires_at
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id AND s.status IN ('active','trialing','expiring','grace')
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE b.id = ? AND b.deleted_at IS NULL ORDER BY s.id DESC LIMIT 1`
    ).bind(user.business_id).first();
  }
  const unread = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first()) as { n: number };
  return c.json({ ok: true, user: { id: user.id, role: user.role, name: user.name, email: user.email }, business, unread_notifications: unread.n });
});

app.post('/forgot', async (c) => {
  const ip = clientIp(c);
  await rateLimit(c.env, 'forgot', ip, 3, 3600);
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  // never reveal whether the account exists
  const generic = { ok: true, message: 'If an account exists with that email, a reset link was issued.' };
  if (!isEmail(email)) return c.json(generic);
  const user = (await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()) as { id: number } | null;
  if (user) {
    const token = randomToken(24);
    const expires = Math.floor(Date.now() / 1000) + 3600;
    await c.env.DB.prepare(`UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?`)
      .bind(token, String(expires), user.id).run();
    if (c.env.SESSION_SECURE === '0') {
      // dev mode: no SMTP configured — surface the link so the flow is testable
      return c.json({ ...generic, dev_mode: true, reset_url: `${c.env.APP_URL}/reset-password?token=${token}` });
    }
  }
  return c.json(generic);
});

app.post('/reset', async (c) => {
  const ip = clientIp(c);
  await rateLimit(c.env, 'reset', ip, 5, 3600);
  const body = await c.req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = reqPassword(body?.password);
  if (!/^[a-f0-9]{48}$/.test(token)) throw badRequest('Invalid or expired reset link.');
  const user = (await c.env.DB.prepare('SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > ?').bind(token, String(Math.floor(Date.now() / 1000))).first()) as { id: number } | null;
  if (!user) throw badRequest('Invalid or expired reset link.');
  const hash = await hashPassword(password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?').bind(hash, user.id).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

export default app;
