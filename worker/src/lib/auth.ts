import type { Context } from 'hono';
import type { Env } from '../config';
import { SESSION_COOKIE, SESSION_DAYS } from '../config';
import { randomToken, nowUnix } from './util';
import { AppError, unauthorized, forbidden } from './errors';
import { getCookie } from './cookies';

export interface SessionUser {
  id: number;
  role: 'admin' | 'vendor' | 'buyer';
  name: string;
  email: string;
  business_id: number | null;
}

interface SessionRow {
  id: string;
  user_id: number;
  payload: string;
  last_activity: number;
}

const SESSION_MAX_AGE = SESSION_DAYS * 86400;
const SLIDE_THRESHOLD = 600;

export function sessionCookieOptions(env: Env): Record<string, string | number | boolean> {
  return {
    httpOnly: true,
    secure: env.SESSION_SECURE === '1',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

export async function createSession(env: Env, c: Context, user: SessionUser): Promise<void> {
  const id = randomToken(32);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, payload, last_activity) VALUES (?, ?, ?, ?)')
    .bind(id, user.id, JSON.stringify(user), nowUnix())
    .run();
  c.header('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax${env.SESSION_SECURE === '1' ? '; Secure' : ''}; Max-Age=${SESSION_MAX_AGE}`);
}

export function destroySession(env: Env, c: Context): void {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function getSession(env: Env, c: Context): Promise<SessionUser | null> {
  const id = getCookie(c.req.raw, SESSION_COOKIE);
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
  const row = (await env.DB.prepare(
    `SELECT s.id, s.user_id, s.payload, s.last_activity, u.status AS user_status
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).bind(id).first()) as (SessionRow & { user_status: string }) | null;
  if (!row || row.user_status !== 'active') {
    if (row) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  const now = nowUnix();
  if (now - row.last_activity > SESSION_MAX_AGE) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  if (now - row.last_activity > SLIDE_THRESHOLD) {
    await env.DB.prepare('UPDATE sessions SET last_activity = ? WHERE id = ?').bind(now, id).run();
  }
  try {
    const payload = JSON.parse(row.payload) as SessionUser;
    // refresh business_id from DB (business may have been recreated / deleted)
    if (payload.role === 'vendor') {
      const biz = (await env.DB.prepare('SELECT id FROM businesses WHERE owner_user_id = ? AND deleted_at IS NULL').bind(payload.id).first()) as { id: number } | null;
      payload.business_id = biz ? biz.id : null;
    } else {
      payload.business_id = null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Authenticated user or 401. */
export async function requireUser(env: Env, c: Context): Promise<SessionUser> {
  const user = await getSession(env, c);
  if (!user) throw unauthorized();
  c.set('user', user);
  return user;
}

/** Admin user or 403. Server-side role check only — never trusts client. */
export async function requireAdmin(env: Env, c: Context): Promise<SessionUser> {
  const user = await requireUser(env, c);
  if (user.role !== 'admin') throw forbidden('Admin access required.');
  return user;
}

export interface VendorCtx {
  user: SessionUser;
  business: {
    id: number;
    name: string;
    slug: string;
    status: string;
    owner_user_id: number;
  };
}

/** Vendor owner of an existing business, or 403 with a machine-readable code. */
export async function requireVendor(env: Env, c: Context): Promise<VendorCtx> {
  const user = await requireUser(env, c);
  if (user.role !== 'vendor') throw forbidden('Vendor account required.');
  const biz = (await env.DB.prepare(
    `SELECT id, name, slug, status, owner_user_id FROM businesses
     WHERE owner_user_id = ? AND deleted_at IS NULL`
  ).bind(user.id).first()) as VendorCtx['business'] | null;
  if (!biz) throw new AppError(403, 'no_business', 'No business found for this account.');
  c.set('user', user);
  c.set('business', biz);
  return { user, business: biz };
}

/** Fetch a business ensuring the caller owns it (IDOR guard). */
export async function ownedBusiness(env: Env, businessId: number, user: SessionUser): Promise<VendorCtx['business']> {
  const biz = (await env.DB.prepare(
    `SELECT id, name, slug, status, owner_user_id FROM businesses
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
  ).bind(businessId, user.id).first()) as VendorCtx['business'] | null;
  if (!biz) throw forbidden('Business not found.');
  return biz;
}
