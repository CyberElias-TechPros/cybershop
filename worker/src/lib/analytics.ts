import type { Context } from 'hono';
import type { Env } from '../config';
import { VISITOR_COOKIE } from '../config';
import { nowIso, nowUnix, randomToken, ipHash } from './util';
import { badRequest } from './errors';
import { getCookie } from './cookies';
import { clientIp } from './ip';

const EVENT_TYPES = new Set(['storefront_view', 'item_view', 'wa_click', 'search', 'add_to_favorites']);

export function visitorSession(c: Context): string {
  let sid = getCookie(c.req.raw, VISITOR_COOKIE);
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
    sid = randomToken(16);
    c.header('Set-Cookie', `${VISITOR_COOKIE}=${sid}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`);
  }
  return sid;
}

export async function trackEvent(
  env: Env,
  c: Context,
  args: {
    businessId: number;
    eventType: string;
    listingId?: number | null;
    userId?: number | null;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  if (!EVENT_TYPES.has(args.eventType)) throw badRequest('Unknown event type.');
  const ip = clientIp(c);
  const iph = ip && ip !== 'unknown' ? await ipHash(ip, env.IP_SALT) : null;
  const ua = (c.req.header('user-agent') || '').slice(0, 250);
  await env.DB.prepare(
    `INSERT INTO analytics_events (business_id, event_type, listing_id, buyer_user_id, session_id, ip_hash, user_agent, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    args.businessId,
    args.eventType,
    args.listingId ?? null,
    args.userId ?? null,
    visitorSession(c),
    iph,
    ua,
    args.meta ? JSON.stringify(args.meta) : null,
    nowIso()
  ).run();
}

export async function recentViewsForUser(env: Env, userId: number, days = 30): Promise<number[]> {
  const rows = (await env.DB.prepare(
    `SELECT listing_id FROM recent_views WHERE buyer_user_id = ? AND viewed_at > datetime('now', ?) ORDER BY viewed_at DESC LIMIT 20`
  ).bind(userId, `-${days} days`).all()).results as { listing_id: number }[];
  return rows.map((r) => r.listing_id);
}

export async function recordView(env: Env, userId: number | null, listingId: number): Promise<void> {
  if (!userId) return;
  await env.DB.prepare(
    `INSERT INTO recent_views (buyer_user_id, listing_id, viewed_at) VALUES (?, ?, ?)
     ON CONFLICT(buyer_user_id, listing_id) DO UPDATE SET viewed_at = excluded.viewed_at`
  ).bind(userId, listingId, nowIso()).run();
}

export function unixNow(): number {
  return nowUnix();
}
