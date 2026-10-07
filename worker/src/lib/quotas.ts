import type { Env } from '../config';
import { quotaExceeded, forbidden } from './errors';

export interface Quotas {
  max_whatsapp_numbers: number;
  max_storage_mb: number;
  max_listings: number; // -1 = unlimited
  max_categories: number;
  max_staff: number;
  featured_listings: number;
  plan_slug: string;
  plan_name: string;
}

const UNLIMITED: Record<string, number> = { max_listings: -1, max_categories: -1, featured_listings: -1, max_storage_mb: -1 };

function parseQuota(json: string | null): Partial<Omit<Quotas, 'plan_slug' | 'plan_name'>> {
  try {
    const q = JSON.parse(json || '{}') as Record<string, number>;
    const out: Partial<Quotas> = {};
    for (const k of Object.keys(UNLIMITED) as (keyof typeof UNLIMITED)[]) {
      if (Number.isFinite(q[k])) (out as Record<string, number>)[k] = q[k];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Effective quotas = plan quota + active add-ons. -1 means unlimited.
 *
 * A granted plan (see lib/entitlement) wins outright: it is the plan the store
 * is entitled to, so it applies whether or not a paid subscription row happens
 * to be current. That makes the entitlement impossible to break by accident.
 */
export async function effectiveQuotas(env: Env, businessId: number): Promise<Quotas> {
  const override = (await env.DB.prepare(
    `SELECT p.id AS plan_id, p.name, p.slug, p.quota FROM businesses b
     JOIN plans p ON p.slug = b.plan_override
     WHERE b.id = ? AND b.plan_override IS NOT NULL`
  ).bind(businessId).first()) as { plan_id: number; name: string; slug: string; quota: string } | null;
  if (override) return quotasFrom(override, await addonBoosts(env, businessId));

  const sub = (await env.DB.prepare(
    `SELECT p.id AS plan_id, p.name, p.slug, p.quota FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.business_id = ? AND s.status IN ('active','trialing','expiring','grace')
     ORDER BY s.id DESC LIMIT 1`
  ).bind(businessId).first()) as { plan_id: number; name: string; slug: string; quota: string } | null;

  return quotasFrom(sub, await addonBoosts(env, businessId));
}

interface QuotaPlanRow {
  plan_id: number;
  name: string;
  slug: string;
  quota: string;
}

/** Boosts purchased on top of a plan, keyed by add-on type. */
async function addonBoosts(env: Env, businessId: number): Promise<Record<string, number>> {
  const addons = (await env.DB.prepare(
    `SELECT a.type, COALESCE(SUM(va.quantity), 0) AS qty FROM vendor_addons va
     JOIN addons a ON a.id = va.addon_id
     WHERE va.business_id = ? AND va.status = 'active'
       AND (va.expires_at IS NULL OR va.expires_at > datetime('now'))
     GROUP BY a.type`
  ).bind(businessId).all()).results as { type: string; qty: number }[];
  const out: Record<string, number> = {};
  for (const a of addons) out[a.type] = a.qty;
  return out;
}

/** Plan quota + add-on boosts, resolved once. `plan` is null when unsubscribed. */
function quotasFrom(plan: QuotaPlanRow | null, addons: Record<string, number>): Quotas {
  const base = plan ? parseQuota(plan.quota) : parseQuota(null);
  const q: Quotas = {
    max_whatsapp_numbers: base.max_whatsapp_numbers ?? 1,
    max_storage_mb: base.max_storage_mb ?? 500,
    max_listings: base.max_listings ?? 10,
    max_categories: base.max_categories ?? 1,
    max_staff: base.max_staff ?? 0,
    featured_listings: base.featured_listings ?? 0,
    plan_slug: plan?.slug || 'none',
    plan_name: plan?.name || 'No plan',
  };

  // A granted Enterprise plan is genuinely unlimited on the axes that gate a
  // catalogue, so short-circuit the arithmetic rather than relying on -1
  // surviving a `+=` somewhere downstream.
  const unlimited = q.max_listings < 0 && q.max_storage_mb < 0 && q.featured_listings < 0;
  if (unlimited) return { ...q, max_whatsapp_numbers: Math.max(q.max_whatsapp_numbers, 10), max_staff: Math.max(q.max_staff, 10) };

  for (const [type, qty] of Object.entries(addons)) {
    if (type === 'extra_whatsapp_number') q.max_whatsapp_numbers += qty;
    if (type === 'extra_storage') q.max_storage_mb += qty * 10; // each add-on = 10GB
    if (type === 'extra_category') q.max_categories += qty;
    if (type === 'featured_listing') q.featured_listings += qty;
    if (type === 'staff_account') q.max_staff += qty;
  }
  return q;
}

export async function assertListingQuota(env: Env, businessId: number): Promise<void> {
  const q = await effectiveQuotas(env, businessId);
  if (q.max_listings < 0) return;
  const row = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM listings WHERE business_id = ? AND deleted_at IS NULL`
  ).bind(businessId).first()) as { n: number };
  if (row.n >= q.max_listings) {
    throw quotaExceeded(
      `Your ${q.plan_name} plan includes ${q.max_listings} catalogue items. Upgrade your plan or remove items.`,
      { limit: q.max_listings }
    );
  }
}

export async function assertNumberQuota(env: Env, businessId: number): Promise<void> {
  const q = await effectiveQuotas(env, businessId);
  if (q.max_whatsapp_numbers < 0) return;
  const row = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM whatsapp_numbers WHERE business_id = ? AND deleted_at IS NULL`
  ).bind(businessId).first()) as { n: number };
  if (row.n >= q.max_whatsapp_numbers) {
    throw quotaExceeded(
      `Your ${q.plan_name} plan includes ${q.max_whatsapp_numbers} WhatsApp number${q.max_whatsapp_numbers === 1 ? '' : 's'}. Buy the "Extra WhatsApp number" add-on or upgrade.`,
      { limit: q.max_whatsapp_numbers }
    );
  }
}

export async function assertStorageQuota(env: Env, businessId: number, incomingBytes: number): Promise<{ usedMb: number; limitMb: number; pct: number }> {
  const q = await effectiveQuotas(env, businessId);
  const used = await (async () => {
    const row = (await env.DB.prepare(
      `SELECT COALESCE(SUM(size_bytes),0) AS u FROM media WHERE business_id = ? AND status != 'deleted' AND deleted_at IS NULL`
    ).bind(businessId).first()) as { u: number };
    return row.u;
  })();
  if (q.max_storage_mb < 0) return { usedMb: used / 1048576, limitMb: -1, pct: 0 };
  const totalMb = (used + incomingBytes) / 1048576;
  const limitMb = q.max_storage_mb;
  if (totalMb > limitMb) {
    throw quotaExceeded(
      `You have used ${(used / 1048576).toFixed(1)}MB of ${limitMb}MB storage. Buy extra storage or remove media.`,
      { limitMb, usedMb: used / 1048576 }
    );
  }
  return { usedMb: used / 1048576, limitMb, pct: Math.min(100, Math.round((totalMb / limitMb) * 100)) };
}

/** Business must be in a state that allows publishing/modification. */
export function assertBusinessWritable(status: string): void {
  if (status !== 'active' && status !== 'pending_payment' && status !== 'pending_approval') {
    throw forbidden(`Your store is ${status.replace('_', ' ')}. Renew your subscription to manage your catalogue.`);
  }
}
