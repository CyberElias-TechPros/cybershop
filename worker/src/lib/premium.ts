import type { Env } from '../config';
import { forbidden, quotaExceeded, notFound, conflict, badRequest } from './errors';
import { nowIso } from './util';
import { notify } from './notify';
import { paystackMock } from '../config';
import { verifyPaystackReference } from './paystack';
import { effectiveQuotas } from './quotas';
import { likeContains } from './search';

export const PREMIUM_TYPES = [
  'in_app_chat',
  'buyer_escrow',
  'jobs_board',
  'verified_id',
  'reply_badge',
  'inspection_reports',
] as const;

export type PremiumType = (typeof PREMIUM_TYPES)[number];

export async function activeAddonTypes(env: Env, businessId: number): Promise<Set<string>> {
  const rows = (await env.DB.prepare(
    `SELECT a.type FROM vendor_addons va
     JOIN addons a ON a.id = va.addon_id
     WHERE va.business_id = ? AND va.status = 'active'
       AND (va.expires_at IS NULL OR va.expires_at > datetime('now'))`
  ).bind(businessId).all()).results as { type: string }[];
  return new Set(rows.map((r) => r.type));
}

export async function hasAddon(env: Env, businessId: number, type: string): Promise<boolean> {
  const types = await activeAddonTypes(env, businessId);
  return types.has(type);
}

export async function assertAddon(env: Env, businessId: number, type: string, message: string): Promise<void> {
  if (!(await hasAddon(env, businessId, type))) throw forbidden(message);
}

export async function assertFeaturedSlot(env: Env, businessId: number, listingId: number | null, wantFeatured: boolean): Promise<void> {
  if (!wantFeatured) return;
  const q = await effectiveQuotas(env, businessId);
  if (q.featured_listings < 0) return;
  let sql = `SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND featured = 1 AND deleted_at IS NULL`;
  const params: (number)[] = [businessId];
  if (listingId) {
    sql += ' AND id != ?';
    params.push(listingId);
  }
  const row = (await env.DB.prepare(sql).bind(...params).first()) as { n: number };
  if (row.n >= q.featured_listings) {
    throw quotaExceeded(
      q.featured_listings === 0
        ? 'Boosted ads need the Featured listing add-on (or a plan that includes them). Buy it under Plan & billing.'
        : `You already have ${q.featured_listings} boosted ad${q.featured_listings === 1 ? '' : 's'}. Unboost one or buy another Featured listing add-on.`,
      { limit: q.featured_listings, used: row.n }
    );
  }
}

export async function featuredRemaining(env: Env, businessId: number): Promise<{ used: number; limit: number }> {
  const q = await effectiveQuotas(env, businessId);
  const row = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND featured = 1 AND deleted_at IS NULL`
  ).bind(businessId).first()) as { n: number };
  return { used: row.n, limit: q.featured_listings };
}

/** Median first-response minutes, only when the vendor bought the badge and has ≥3 samples. */
export async function replyBadge(env: Env, businessId: number, types?: Set<string>): Promise<string | null> {
  const t = types ?? await activeAddonTypes(env, businessId);
  if (!t.has('reply_badge')) return null;
  const rows = (await env.DB.prepare(
    `SELECT (julianday(first_response_at) - julianday(created_at)) * 24 * 60 AS mins
     FROM inquiries
     WHERE business_id = ? AND first_response_at IS NOT NULL
     ORDER BY mins ASC`
  ).bind(businessId).all()).results as { mins: number }[];
  if (rows.length < 3) return null;
  const mid = rows[Math.floor(rows.length / 2)]!.mins;
  if (!Number.isFinite(mid) || mid < 0) return null;
  if (mid < 60) return `Typically replies in about ${Math.max(1, Math.round(mid))} min`;
  const hours = mid / 60;
  if (hours < 24) return `Typically replies in about ${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = hours / 24;
  return `Typically replies in about ${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? '' : 's'}`;
}

export async function publicPremium(env: Env, businessId: number, verificationStatus?: string): Promise<{
  chat: boolean;
  escrow: boolean;
  jobs: boolean;
  verified_id: boolean;
  reply: string | null;
}> {
  const types = await activeAddonTypes(env, businessId);
  return {
    chat: types.has('in_app_chat'),
    escrow: types.has('buyer_escrow'),
    jobs: types.has('jobs_board'),
    verified_id: verificationStatus === 'verified',
    reply: await replyBadge(env, businessId, types),
  };
}

export function depositReference(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.getRandomValues(new Uint8Array(6));
  for (const x of b) s += chars[x % chars.length];
  return `CS-DEP-${new Date().getFullYear()}-${s}`;
}

export async function markDepositPaid(env: Env, reference: string, ip: string | null): Promise<{ ok: boolean; detail: string }> {
  const dep = (await env.DB.prepare(
    `SELECT * FROM deposits WHERE reference = ? OR paystack_reference = ?`
  ).bind(reference, reference).first()) as {
    id: number; business_id: number; amount: number; status: string; reference: string;
  } | null;
  if (!dep) return { ok: false, detail: 'deposit not found' };
  if (dep.status === 'paid' || dep.status === 'released' || dep.status === 'refunded') {
    return { ok: true, detail: 'already settled (idempotent)' };
  }
  if (dep.status !== 'pending') return { ok: false, detail: `deposit ${dep.status}` };

  let verified: { success: boolean; amountKobo: number };
  if (paystackMock(env)) {
    verified = { success: true, amountKobo: dep.amount };
  } else {
    verified = await verifyPaystackReference(env, reference);
  }
  if (!verified.success) {
    await env.DB.prepare(`UPDATE deposits SET status = 'failed' WHERE id = ? AND status = 'pending'`).bind(dep.id).run();
    return { ok: false, detail: 'paystack verification failed' };
  }
  if (verified.amountKobo + 1 < dep.amount) {
    await env.DB.prepare(`UPDATE deposits SET status = 'failed' WHERE id = ?`).bind(dep.id).run();
    return { ok: false, detail: 'amount mismatch' };
  }
  await env.DB.prepare(
    `UPDATE deposits SET status = 'paid', paid_at = ?, paystack_reference = COALESCE(paystack_reference, ?) WHERE id = ?`
  ).bind(nowIso(), reference, dep.id).run();
  const owner = (await env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(dep.business_id).first()) as { owner_user_id: number } | null;
  if (owner) {
    await notify(env, {
      userId: owner.owner_user_id,
      type: 'deposit.paid',
      title: 'Buyer deposit recorded',
      body: `${dep.reference} — CyberShop recorded the payment. Confirm handover when you meet, then release it in Deposits. We are not a bank.`,
      data: { deposit_id: dep.id },
    });
  }
  void ip;
  return { ok: true, detail: 'deposit paid' };
}

export async function releaseDeposit(env: Env, businessId: number, depositId: number): Promise<void> {
  const dep = (await env.DB.prepare('SELECT * FROM deposits WHERE id = ? AND business_id = ?').bind(depositId, businessId).first()) as { id: number; status: string; buyer_user_id: number | null; reference: string } | null;
  if (!dep) throw notFound('Deposit not found.');
  if (dep.status !== 'paid') throw conflict(`Deposit is ${dep.status}, not waiting for release.`);
  await env.DB.prepare(`UPDATE deposits SET status = 'released', released_at = ? WHERE id = ?`).bind(nowIso(), dep.id).run();
  if (dep.buyer_user_id) {
    await notify(env, {
      userId: dep.buyer_user_id,
      type: 'deposit.released',
      title: 'The seller confirmed handover',
      body: `${dep.reference} is marked released. CyberShop does not move the money — this is the seller’s record.`,
      data: { deposit_id: dep.id },
    });
  }
}

/** Record-only. CyberShop never moves bank funds. */
export async function refundDeposit(env: Env, businessId: number, depositId: number): Promise<void> {
  const dep = (await env.DB.prepare('SELECT * FROM deposits WHERE id = ? AND business_id = ?').bind(depositId, businessId).first()) as { id: number; status: string; buyer_user_id: number | null; reference: string } | null;
  if (!dep) throw notFound('Deposit not found.');
  if (dep.status !== 'paid') throw conflict(`Deposit is ${dep.status}. Only a recorded payment can be marked refunded.`);
  await env.DB.prepare(`UPDATE deposits SET status = 'refunded', released_at = ? WHERE id = ?`).bind(nowIso(), dep.id).run();
  if (dep.buyer_user_id) {
    await notify(env, {
      userId: dep.buyer_user_id,
      type: 'deposit.refunded',
      title: 'The seller marked your deposit refunded',
      body: `${dep.reference} — confirm the money is back in your account. CyberShop does not hold or return funds.`,
      data: { deposit_id: dep.id },
    });
  }
}

export async function notifySavedSearches(env: Env): Promise<number> {
  const searches = (await env.DB.prepare(
    `SELECT * FROM saved_searches WHERE buyer_user_id IS NOT NULL`
  ).all()).results as {
    id: number; buyer_user_id: number; q: string | null; city: string | null; category: string | null;
    min_price: number | null; max_price: number | null; last_seen_listing_id: number;
  }[];
  let n = 0;
  for (const s of searches) {
    let where = `WHERE l.status = 'published' AND l.deleted_at IS NULL AND b.status = 'active' AND b.paused_at IS NULL AND l.id > ?`;
    const params: (string | number)[] = [s.last_seen_listing_id];
    if (s.q) { where += ` AND (l.name LIKE ? OR l.description LIKE ?)`; params.push(likeContains(s.q), likeContains(s.q)); }
    if (s.city) { where += ` AND LOWER(b.city) = LOWER(?)`; params.push(s.city); }
    if (s.category) { where += ` AND EXISTS (SELECT 1 FROM categories c WHERE c.id = l.category_id AND c.slug = ?)`; params.push(s.category); }
    if (s.min_price != null) { where += ` AND l.price IS NOT NULL AND l.price >= ?`; params.push(s.min_price); }
    if (s.max_price != null) { where += ` AND l.price IS NOT NULL AND l.price <= ?`; params.push(s.max_price); }
    const hit = (await env.DB.prepare(
      `SELECT MAX(l.id) AS max_id, COUNT(*) AS n
       FROM listings l JOIN businesses b ON b.id = l.business_id ${where}`
    ).bind(...params).first()) as { max_id: number | null; n: number };
    if (!hit.n || !hit.max_id) continue;
    await notify(env, {
      userId: s.buyer_user_id,
      type: 'saved_search.match',
      title: 'New ads match your search',
      body: `${hit.n} new listing${hit.n === 1 ? '' : 's'} since you last checked.`,
      data: { saved_search_id: s.id },
    });
    await env.DB.prepare(
      `UPDATE saved_searches SET last_seen_listing_id = ?, last_notified_at = ? WHERE id = ?`
    ).bind(hit.max_id, nowIso(), s.id).run();
    n++;
  }
  return n;
}

/** Drop extra boosts when quota shrinks (addon expired). Oldest first. */
export async function trimFeaturedOverflow(env: Env): Promise<number> {
  const biz = (await env.DB.prepare(
    `SELECT DISTINCT business_id FROM listings WHERE featured = 1 AND deleted_at IS NULL`
  ).all()).results as { business_id: number }[];
  let n = 0;
  for (const b of biz) {
    const q = await effectiveQuotas(env, b.business_id);
    if (q.featured_listings < 0) continue;
    const rows = (await env.DB.prepare(
      `SELECT id FROM listings WHERE business_id = ? AND featured = 1 AND deleted_at IS NULL ORDER BY updated_at ASC`
    ).bind(b.business_id).all()).results as { id: number }[];
    const extra = rows.length - q.featured_listings;
    if (extra <= 0) continue;
    for (const r of rows.slice(0, extra)) {
      await env.DB.prepare(`UPDATE listings SET featured = 0 WHERE id = ?`).bind(r.id).run();
      n++;
    }
  }
  return n;
}

export async function expireVerifiedBadges(env: Env): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE businesses SET verification_status = 'unverified'
     WHERE verification_status = 'verified'
       AND id NOT IN (
         SELECT va.business_id FROM vendor_addons va
         JOIN addons a ON a.id = va.addon_id
         WHERE a.type = 'verified_id' AND va.status = 'active'
           AND (va.expires_at IS NULL OR va.expires_at > datetime('now'))
       )`
  ).run();
  return Number(res.meta?.changes || 0);
}

export function parseInspection(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string') {
    const notes = raw.trim().slice(0, 4000);
    if (!notes) return null;
    return JSON.stringify({ notes });
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const notes = typeof o.notes === 'string' ? o.notes.trim().slice(0, 4000) : '';
    if (!notes) return null;
    return JSON.stringify({ notes, inspected_at: typeof o.inspected_at === 'string' ? o.inspected_at.slice(0, 40) : null });
  }
  throw badRequest('Invalid inspection report.');
}
