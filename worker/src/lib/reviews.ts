import type { Env } from '../config';

export interface ReviewSummary {
  count: number;
  average: number | null;
}

/** Real reviews only. Never invent a rating when count is 0. */
export async function reviewSummary(env: Env, businessId: number, listingId?: number | null): Promise<ReviewSummary> {
  const sql = listingId
    ? `SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE business_id = ? AND listing_id = ? AND status = 'published'`
    : `SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE business_id = ? AND status = 'published'`;
  const row = (await env.DB.prepare(sql).bind(...(listingId ? [businessId, listingId] : [businessId])).first()) as { n: number; avg: number | null };
  const count = Number(row?.n || 0);
  return { count, average: count ? Math.round(Number(row.avg) * 10) / 10 : null };
}

export async function reviewList(env: Env, listingId: number, limit = 8): Promise<Record<string, unknown>[]> {
  const rows = (await env.DB.prepare(
    `SELECT r.id, r.rating, r.title, r.body, r.vendor_reply, r.created_at, u.name AS buyer_name
     FROM reviews r JOIN users u ON u.id = r.buyer_user_id
     WHERE r.listing_id = ? AND r.status = 'published'
     ORDER BY r.id DESC LIMIT ?`
  ).bind(listingId, limit).all()).results as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    vendor_reply: r.vendor_reply,
    created_at: r.created_at,
    buyer_name: String(r.buyer_name || 'Buyer').split(' ')[0],
  }));
}
