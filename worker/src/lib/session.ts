import type { Context } from 'hono';
import type { Env } from '../config';
import { SESSION_COOKIE, SESSION_DAYS } from '../config';
import { randomToken, nowUnix } from './util';
import { sha256Hex } from './util';

/**
 * Sessions, as a thing users can actually manage.
 *
 * Every login used to look identical from the inside: a random token and a row.
 * When somebody says "someone is in my account", that is not enough — you have
 * to be able to name the device, the time, and roughly where, and then kill
 * exactly that one. So each session now records when it was created, a trimmed
 * user-agent and a *hash* of the IP. Never the IP in clear: it is personal data
 * and nothing here needs the original.
 */

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: string | null;
  last_activity: number;
  user_agent: string | null;
  ip_hash: string | null;
  current?: number;
}

const SESSION_MAX_AGE = SESSION_DAYS * 86400;

/** "Chrome on Windows" — enough to identify a device, too little to fingerprint. */
export function deviceLabel(userAgent: string | null): string {
  const ua = (userAgent || '').trim();
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/i.test(ua) ? 'Windows'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Macintosh|Mac OS/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Create a session row, boxing the login with the device that made it.
 * Returns the raw id so callers can set the cookie themselves.
 */
export async function createSessionRow(env: Env, userId: number, payload: unknown, request?: Request): Promise<string> {
  const id = randomToken(32);
  const ip = request?.headers.get('cf-connecting-ip') || request?.headers.get('x-forwarded-for') || null;
  const ipHash = ip ? await sha256Hex(`ip:${ip}`) : null;
  const ua = request?.headers.get('user-agent') ?? null;
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, payload, last_activity, created_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, JSON.stringify(payload), nowUnix(), new Date().toISOString(), ua ? ua.slice(0, 300) : null, ipHash).run();
  return id;
}

/** Cookie header for a session id. */
export function sessionCookie(env: Env, id: string): string {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax${env.SESSION_SECURE === '1' ? '; Secure' : ''}; Max-Age=${SESSION_MAX_AGE}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function listSessions(env: Env, userId: number, currentId?: string): Promise<SessionRow[]> {
  const cutoff = nowUnix() - SESSION_MAX_AGE;
  const rows = (await env.DB.prepare(
    `SELECT id, user_id, created_at, last_activity, user_agent, ip_hash
     FROM sessions WHERE user_id = ? AND last_activity > ?
     ORDER BY last_activity DESC LIMIT 50`
  ).bind(userId, cutoff).all()).results as unknown as SessionRow[];
  return rows.map((r) => ({ ...r, current: currentId && r.id === currentId ? 1 : 0 }));
}

export async function revokeSession(env: Env, userId: number, sessionId: string): Promise<boolean> {
  const res = await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).run();
  return (res.meta.changes ?? 0) > 0;
}

/** Sign out everywhere else. Used after enabling 2FA, and by the security page. */
export async function revokeOtherSessions(env: Env, userId: number, keepId?: string): Promise<number> {
  const res = keepId
    ? await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(userId, keepId).run()
    : await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  return res.meta.changes ?? 0;
}

/** True when this request's session is the one the user is holding. */
export async function currentSessionId(c: Context): Promise<string | null> {
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([a-f0-9]{64})`));
  return m ? m[1]! : null;
}
