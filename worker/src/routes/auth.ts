import { Hono } from 'hono';
import type { Env } from '../config';
import { hashPassword, verifyPassword, passwordNeedsUpgrade } from '../lib/crypto';
import { createSession, requireUser, destroySession, getSession } from '../lib/auth';
import { rateLimit } from '../lib/ratelimit';
import { AppError, badRequest, validationError, conflict, forbidden, notFound } from '../lib/errors';
import { slugify, assertSlugAvailable, nowIso, randomToken } from '../lib/util';
import { reqStr, reqEmail, reqPassword, optStr, isEmail, reqPhone } from '../lib/validate';
import { activateFreePlan } from '../lib/payments';
import { normalizeWaNumber } from '../lib/wa';
import { clientIp } from '../lib/ip';
import { resolveVendorBinding } from '../lib/access';
import { mailConfigured, sendEmail, mailHtml } from '../lib/mail';

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

  const user = { id: userId, role, name, email, business_id: businessId, member_role: role === 'vendor' ? 'owner' : null } as const;
  await createSession(c.env, c, user as never);
  if (mailConfigured(c.env)) {
    const token = randomToken(24);
    const expires = String(Math.floor(Date.now() / 1000) + 86400);
    await c.env.DB.prepare('UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?').bind(token, expires, userId).run();
    const url = `${c.env.APP_URL}/account/verify?token=${token}`;
    await sendEmail(c.env, {
      to: email,
      subject: 'Confirm your CyberShop email',
      text: `Welcome to CyberShop.\n\nConfirm your email (24 hours):\n${url}`,
      html: mailHtml('Welcome to CyberShop', 'Confirm this address so we can reach you about your account. The link works for 24 hours.', { label: 'Confirm email', url }),
    });
  }
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
  const binding = user.role === 'vendor' ? await resolveVendorBinding(c.env, user.id) : { business_id: null, member_role: null };
  await createSession(c.env, c, { id: user.id, role: user.role as never, name: user.name, email: user.email, business_id: binding.business_id, member_role: binding.member_role } as never);
  return c.json({ ok: true, user: { id: user.id, role: user.role, name: user.name, email: user.email, business_id: binding.business_id } });
});

app.post('/logout', async (c) => {
  const session = await getSession(c.env, c);
  if (session) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.id).run();
  }
  destroySession(c.env, c);
  return c.json({ ok: true });
});

/** Exit support impersonation: restore the impersonating admin's session. */
app.post('/impersonate/exit', async (c) => {
  const session = await getSession(c.env, c);
  if (!session || session.imp === undefined) throw forbidden('Not an impersonated session.');
  const admin = (await c.env.DB.prepare(`SELECT id, role, name, email FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL`).bind(session.imp).first()) as
    | { id: number; role: 'admin'; name: string; email: string }
    | null;
  if (!admin) throw forbidden('Impersonating admin no longer exists.');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.id).run();
  destroySession(c.env, c);
  await createSession(c.env, c, { id: admin.id, role: 'admin', name: admin.name, email: admin.email, business_id: null });
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
  const profile = (await c.env.DB.prepare('SELECT phone, email_verified_at FROM users WHERE id = ?').bind(user.id).first()) as { phone: string | null; email_verified_at: string | null } | null;
  return c.json({
    ok: true,
    user: {
      id: user.id, role: user.role, name: user.name, email: user.email,
      phone: profile?.phone ?? null,
      email_verified: !!profile?.email_verified_at,
      member_role: user.member_role ?? null,
    },
    business,
    unread_notifications: unread.n,
  });
});

/** Preview a staff invite without consuming it. */
app.get('/invites/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[a-f0-9]{48}$/.test(token)) throw badRequest('This invite link is not valid.');
  const row = (await c.env.DB.prepare(
    `SELECT i.email, i.role, i.expires_at, i.accepted_at, b.name AS business_name
     FROM staff_invites i JOIN businesses b ON b.id = i.business_id
     WHERE i.token = ?`
  ).bind(token).first()) as { email: string; role: string; expires_at: string; accepted_at: string | null; business_name: string } | null;
  if (!row) throw notFound('Invite not found.');
  const masked = row.email.replace(/^(.).+(@.*)$/, '$1***$2');
  return c.json({
    ok: true,
    business_name: row.business_name,
    role: row.role,
    email_masked: masked,
    expired: !!row.accepted_at || row.expires_at <= new Date().toISOString(),
  });
});

/** Accept a staff invite. Creates an account when the email is new. */
app.post('/invites/accept', async (c) => {
  const ip = clientIp(c);
  await rateLimit(c.env, 'invite-accept', ip, 8, 3600);
  const body = await c.req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[a-f0-9]{48}$/.test(token)) throw badRequest('This invite link is not valid.');
  const invite = (await c.env.DB.prepare(
    `SELECT * FROM staff_invites WHERE token = ?`
  ).bind(token).first()) as { id: number; business_id: number; email: string; role: string; expires_at: string; accepted_at: string | null } | null;
  if (!invite || invite.accepted_at || invite.expires_at <= new Date().toISOString()) throw badRequest('This invite has expired. Ask the owner to send a new one.');
  const session = await getSession(c.env, c);
  let userId: number;
  let name: string;
  let email = invite.email;
  if (session) {
    if (session.email.toLowerCase() !== invite.email) throw forbidden('Sign in with the invited email, or open the link in a private window.');
    if (session.role === 'admin') throw forbidden('Admin accounts cannot join a store as staff.');
    const owns = await c.env.DB.prepare('SELECT id FROM businesses WHERE owner_user_id = ? AND deleted_at IS NULL').bind(session.id).first();
    if (owns) throw conflict('This account already owns a store. Accept the invite with a different email.');
    if (session.role === 'buyer') {
      await c.env.DB.prepare(`UPDATE users SET role = 'vendor' WHERE id = ?`).bind(session.id).run();
    }
    userId = session.id;
    name = session.name;
  } else {
    const existing = (await c.env.DB.prepare('SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL').bind(invite.email).first()) as { id: number; role: string } | null;
    if (existing) throw conflict('An account with that email already exists. Sign in, then open the invite again.');
    name = reqStr(body?.name, { min: 2, max: 120 });
    const password = reqPassword(body?.password);
    const hash = await hashPassword(password);
    const res = await c.env.DB.prepare(`INSERT INTO users (role, name, email, password_hash, status) VALUES ('vendor', ?, ?, ?, 'active')`).bind(name, invite.email, hash).run();
    userId = Number(res.meta.last_row_id);
  }
  await c.env.DB.prepare(
    `INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, ?, 'active')
     ON CONFLICT(business_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'`
  ).bind(invite.business_id, userId, invite.role).run();
  await c.env.DB.prepare('UPDATE staff_invites SET accepted_at = ? WHERE id = ?').bind(nowIso(), invite.id).run();
  const owner = (await c.env.DB.prepare('SELECT owner_user_id, name FROM businesses WHERE id = ?').bind(invite.business_id).first()) as { owner_user_id: number; name: string };
  const { notify } = await import('../lib/notify');
  await notify(c.env, { userId: owner.owner_user_id, type: 'staff.joined', title: `${name} joined your team`, body: `${email} accepted the ${invite.role} invite for ${owner.name}.` });
  await createSession(c.env, c, { id: userId, role: 'vendor', name, email, business_id: invite.business_id, member_role: invite.role });
  return c.json({ ok: true, user: { id: userId, role: 'vendor', name, email, business_id: invite.business_id } });
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
    const resetUrl = `${c.env.APP_URL}/reset-password?token=${token}`;
    const { mailConfigured, sendEmail, mailHtml } = await import('../lib/mail');
    if (mailConfigured(c.env)) {
      const row = (await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(user.id).first()) as { name: string } | null;
      await sendEmail(c.env, {
        to: email,
        subject: 'Reset your CyberShop password',
        text: `Hi ${row?.name || 'there'},\n\nReset your password with this link (valid for 1 hour, single use):\n${resetUrl}\n\nIf you didn't request this, ignore this email — your password stays as it is.\n\n— CyberShop`,
        html: mailHtml(
          'Reset your password',
          `Hi ${row?.name ? row.name.replace(/</g, '&lt;') : 'there'} — here is your single-use reset link. It expires in one hour.`,
          { label: 'Choose a new password', url: resetUrl }
        ),
      });
      return c.json(generic);
    }
    if (c.env.SESSION_SECURE === '0') {
      // dev mode: no mail provider configured — surface the link so the flow is testable
      return c.json({ ...generic, dev_mode: true, reset_url: resetUrl });
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
