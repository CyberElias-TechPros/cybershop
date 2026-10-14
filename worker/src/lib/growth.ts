import type { Env } from '../config';
import { notify } from './notify';
import { nowIso } from './util';

/**
 * Growth loops: tell buyers when things they care about change, tell
 * sellers what their week looked like, and let stores show how fast
 * they reply. All best-effort — a failed notification must never fail
 * the request or job that triggered it.
 */

/** Price drop or back-in-stock on a saved listing → notify the saver. */
export async function notifySavedItemChanges(env: Env): Promise<number> {
  let sent = 0;
  const rows = (await env.DB.prepare(
    `SELECT f.buyer_user_id, f.listing_id, f.price_snapshot, f.stock_snapshot,
            l.price, l.stock_status, l.name AS listing_name, b.name AS business_name
     FROM favorites f
     JOIN listings l ON l.id = f.listing_id
     JOIN businesses b ON b.id = l.business_id
     WHERE l.deleted_at IS NULL AND l.status = 'published'
       AND (
         (f.price_snapshot IS NOT NULL AND l.price IS NOT NULL AND l.price < f.price_snapshot)
         OR (f.stock_snapshot = 'out_of_stock' AND l.stock_status = 'in_stock')
       )`,
  ).all()).results as {
    buyer_user_id: number; listing_id: number; price_snapshot: number | null; stock_snapshot: string | null;
    price: number | null; stock_status: string; listing_name: string; business_name: string;
  }[];
  for (const r of rows) {
    const priceDropped = r.price_snapshot != null && r.price != null && r.price < r.price_snapshot;
    try {
      await notify(env, {
        userId: r.buyer_user_id,
        type: priceDropped ? 'saved.price_drop' : 'saved.back_in_stock',
        title: priceDropped ? `Price drop: ${r.listing_name}` : `Back in stock: ${r.listing_name}`,
        body: priceDropped
          ? `${r.business_name} reduced this saved item. Open it before it goes.`
          : `${r.business_name} has this saved item back in stock.`,
        data: { listing_id: r.listing_id },
      });
      sent++;
    } catch { /* best effort */ }
    // Re-baseline so the same change never notifies twice.
    await env.DB.prepare(
      'UPDATE favorites SET price_snapshot = ?, stock_snapshot = ? WHERE buyer_user_id = ? AND listing_id = ?',
    ).bind(r.price, r.stock_status, r.buyer_user_id, r.listing_id).run();
  }
  return sent;
}

/** A store you saved published something new → hear about it. */
export async function notifyStoreFollowers(env: Env, businessId: number, businessName: string, listingId: number, listingName: string): Promise<void> {
  const followers = (await env.DB.prepare(
    'SELECT buyer_user_id FROM saved_businesses WHERE business_id = ? LIMIT 500',
  ).bind(businessId).all()).results as { buyer_user_id: number }[];
  for (const f of followers) {
    try {
      await notify(env, {
        userId: f.buyer_user_id,
        type: 'store.new_listing',
        title: `${businessName} just listed something new`,
        body: listingName,
        data: { listing_id: listingId, business_id: businessId },
      });
    } catch { /* best effort */ }
  }
}

/**
 * Weekly seller digest. Runs inside the hourly cron but sends at most
 * once per ~7 days per store (tracked in alert_state). Numbers come
 * from analytics_daily + inquiries, so the digest is the seller's ROI
 * receipt: views, WhatsApp taps, leads, sales marked.
 */
export async function sellerWeeklyDigests(env: Env): Promise<number> {
  let sent = 0;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const stores = (await env.DB.prepare(
    `SELECT b.id, b.name, b.owner_user_id FROM businesses b
     WHERE b.status = 'active' AND b.deleted_at IS NULL`,
  ).all()).results as { id: number; name: string; owner_user_id: number }[];
  for (const b of stores) {
    const key = `digest:${b.id}`;
    const state = (await env.DB.prepare('SELECT last_sent_at FROM alert_state WHERE alert_key = ?').bind(key).first()) as { last_sent_at: string } | null;
    if (state && Date.now() - new Date(state.last_sent_at).getTime() < 6.5 * 86400_000) continue;
    const agg = (await env.DB.prepare(
      `SELECT COALESCE(SUM(storefront_views),0) AS views, COALESCE(SUM(item_views),0) AS items,
              COALESCE(SUM(wa_clicks),0) AS taps
       FROM analytics_daily WHERE business_id = ? AND day >= date('now','-7 days')`,
    ).bind(b.id).first()) as { views: number; items: number; taps: number } | null;
    const leads = (await env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS sold
       FROM inquiries WHERE business_id = ? AND created_at >= ?`,
    ).bind(b.id, since).first()) as { n: number; sold: number | null } | null;
    const views = (agg?.views ?? 0) + (agg?.items ?? 0);
    const taps = agg?.taps ?? 0;
    const leadCount = leads?.n ?? 0;
    if (views === 0 && taps === 0 && leadCount === 0) {
      // No story to tell; still stamp so quiet stores are not retried hourly.
      await env.DB.prepare(
        `INSERT INTO alert_state (alert_key, last_sent_at, count) VALUES (?, ?, 1)
         ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at`,
      ).bind(key, nowIso()).run();
      continue;
    }
    try {
      await notify(env, {
        userId: b.owner_user_id,
        type: 'seller.digest',
        title: `Your week at ${b.name}`,
        body: `${views} views · ${taps} WhatsApp taps · ${leadCount} new leads · ${leads?.sold ?? 0} marked sold. See what is working in Analytics.`,
        data: { business_id: b.id },
      });
      sent++;
    } catch { /* best effort */ }
    await env.DB.prepare(
      `INSERT INTO alert_state (alert_key, last_sent_at, count) VALUES (?, ?, 1)
       ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at`,
    ).bind(key, nowIso()).run();
  }
  return sent;
}

/** Median first-response time (hours) from real enquiries, last 90 days. */
export async function medianResponseHours(env: Env, businessId: number): Promise<{ hours: number; sample: number } | null> {
  const rows = (await env.DB.prepare(
    `SELECT (julianday(first_response_at) - julianday(created_at)) * 24 AS hrs
     FROM inquiries
     WHERE business_id = ? AND first_response_at IS NOT NULL
       AND created_at >= datetime('now', '-90 days')
     ORDER BY hrs LIMIT 200`,
  ).bind(businessId).all()).results as { hrs: number }[];
  if (rows.length < 5) return null;
  const mid = rows[Math.floor(rows.length / 2)]!;
  return { hours: Math.max(0.1, Math.round(mid.hrs * 10) / 10), sample: rows.length };
}
