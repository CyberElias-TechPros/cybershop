import type { Env } from '../config';
import { nowIso, daysFromNow } from './util';
import { audit } from './audit';
import { notify } from './notify';

/**
 * Platform entitlement — a plan granted to a store permanently, free of charge.
 *
 * CyberShop belongs to Cyber Elias Academy, so CEA's own store never pays: it
 * sits on Enterprise forever. This module is the single place that decides that,
 * so the rule cannot drift between quotas, billing, the admin screens and the
 * expiry cron.
 *
 * Two representations, kept in step:
 *  - `businesses.plan_override` — the source of truth.
 *  - a `subscriptions` row for that plan with `expires_at = NULL` — so all the
 *    screens that already read the subscription work unchanged, and so the
 *    hourly expiry sweep (which only touches `expires_at IS NOT NULL`) cannot
 *    ever touch it.
 */

export interface Entitlement {
  /** Plan slug granted permanently, or null when the store pays normally. */
  plan_slug: string | null;
  plan_name: string | null;
  /** Why it was granted — shown to the vendor and recorded in the audit log. */
  reason: string | null;
  granted_at: string | null;
  /** The platform owner's own store: verified, featured, never billed. */
  is_platform_owner: boolean;
}

interface OverrideRow {
  id: number;
  name: string;
  owner_user_id: number;
  plan_override: string | null;
  plan_override_reason: string | null;
  plan_override_at: string | null;
  is_platform_owner: number;
}

const OVERRIDE_COLS = `id, name, owner_user_id, plan_override, plan_override_reason, plan_override_at, is_platform_owner`;

/** Read the entitlement as the store currently holds it. Read-only, no writes. */
export async function entitlementFor(env: Env, businessId: number): Promise<Entitlement | null> {
  const b = (await env.DB.prepare(`SELECT ${OVERRIDE_COLS} FROM businesses WHERE id = ?`).bind(businessId).first()) as
    | OverrideRow
    | null;
  if (!b || !b.plan_override) return null;
  const plan = (await env.DB.prepare('SELECT id, name, slug FROM plans WHERE slug = ?').bind(b.plan_override).first()) as
    | { id: number; name: string; slug: string }
    | null;
  return {
    plan_slug: b.plan_override,
    plan_name: plan?.name ?? b.plan_override,
    reason: b.plan_override_reason,
    granted_at: b.plan_override_at,
    is_platform_owner: !!b.is_platform_owner,
  };
}

/** True when the store is on a plan it was granted rather than one it paid for. */
export async function hasEntitlement(env: Env, businessId: number): Promise<boolean> {
  const row = (await env.DB.prepare('SELECT plan_override FROM businesses WHERE id = ?').bind(businessId).first()) as
    | { plan_override: string | null }
    | null;
  return Boolean(row?.plan_override);
}

/**
 * Re-assert the stored entitlement (idempotent).
 *
 * Self-healing on purpose: if an admin suspends the store, an old subscription
 * row is cancelled, or a migration lands out of order, the next hourly cron puts
 * the granted store back on its granted plan instead of leaving it degraded.
 */
export async function syncEntitlement(env: Env, businessId: number): Promise<Entitlement | null> {
  const b = (await env.DB.prepare(`SELECT ${OVERRIDE_COLS} FROM businesses WHERE id = ?`).bind(businessId).first()) as
    | OverrideRow
    | null;
  if (!b?.plan_override) return null;
  const plan = (await env.DB.prepare('SELECT id, name FROM plans WHERE slug = ?').bind(b.plan_override).first()) as
    | { id: number; name: string }
    | null;
  if (!plan) return null;

  // A granted plan is a plan that never runs out: expires_at stays NULL and the
  // expiry sweep skips NULLs by construction.
  const perpetual = (await env.DB.prepare(
    `SELECT id FROM subscriptions WHERE business_id = ? AND plan_id = ? AND status = 'active' AND expires_at IS NULL ORDER BY id DESC LIMIT 1`
  ).bind(businessId, plan.id).first()) as { id: number } | null;

  if (perpetual) {
    await env.DB.prepare(`UPDATE subscriptions SET grace_until = NULL, cancel_at_renewal = 0 WHERE id = ?`).bind(perpetual.id).run();
  } else {
    const current = (await env.DB.prepare(
      `SELECT id FROM subscriptions WHERE business_id = ? AND status IN ('active','trialing','expiring','expired','grace') ORDER BY id DESC LIMIT 1`
    ).bind(businessId).first()) as { id: number } | null;
    if (current) {
      await env.DB.prepare(
        `UPDATE subscriptions SET plan_id = ?, status = 'active', expires_at = NULL, renews_at = NULL, grace_until = NULL, cancel_at_renewal = 0 WHERE id = ?`
      ).bind(plan.id, current.id).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO subscriptions (business_id, plan_id, status, starts_at, expires_at) VALUES (?, ?, 'active', ?, NULL)`
      ).bind(businessId, plan.id, nowIso()).run();
    }
  }

  // A store that is paid for in full is a store that is live. Never leave the
  // platform owner's own storefront suspended.
  await env.DB.prepare(
    `UPDATE businesses SET status = 'active' WHERE id = ? AND status IN ('pending_payment','pending_approval','suspended','expired')`
  ).bind(businessId).run();

  // The platform owner's store also carries the trust signals it would
  // otherwise have to buy.
  if (b.is_platform_owner) {
    await env.DB.prepare(
      `UPDATE businesses SET verification_status = 'verified', is_featured = 1, featured_until = NULL WHERE id = ?`
    ).bind(businessId).run();
  }

  return entitlementFor(env, businessId);
}

/** Put a store on a plan permanently, free of charge. */
export async function grantEntitlement(
  env: Env,
  args: { businessId: number; planSlug: string; reason: string; actorId: number | null }
): Promise<Entitlement> {
  const plan = (await env.DB.prepare('SELECT id, name, slug FROM plans WHERE slug = ?').bind(args.planSlug).first()) as
    | { id: number; name: string; slug: string }
    | null;
  if (!plan) {
    // A typo'd slug must not silently downgrade anyone — fail loudly.
    throw new Error(`Unknown plan slug: ${args.planSlug}`);
  }
  await env.DB.prepare(
    `UPDATE businesses SET plan_override = ?, plan_override_reason = ?, plan_override_by = ?, plan_override_at = ? WHERE id = ?`
  ).bind(plan.slug, args.reason.slice(0, 500) || null, args.actorId, nowIso(), args.businessId).run();

  const ent = await syncEntitlement(env, args.businessId);
  const b = (await env.DB.prepare('SELECT name, owner_user_id FROM businesses WHERE id = ?').bind(args.businessId).first()) as
    | { name: string; owner_user_id: number }
    | null;

  await notify(env, {
    userId: b?.owner_user_id ?? 0,
    type: 'entitlement.granted',
    title: `${plan.name} plan granted`,
    body: args.reason
      ? `${b?.name ?? 'Your store'} is now on ${plan.name} at no cost. ${args.reason}`
      : `${b?.name ?? 'Your store'} is now on ${plan.name} at no cost. It never expires and you will never be billed for it.`,
    data: { business_id: args.businessId, plan_slug: plan.slug },
  });

  await audit(env, {
    actor: { id: args.actorId, role: args.actorId ? 'admin' : 'system' },
    action: 'entitlement.grant',
    entityType: 'business',
    entityId: args.businessId,
    meta: { plan_slug: plan.slug, reason: args.reason.slice(0, 500) || null },
  });

  return ent ?? { plan_slug: plan.slug, plan_name: plan.name, reason: args.reason, granted_at: nowIso(), is_platform_owner: false };
}

/**
 * Return a store to the normal paid lifecycle.
 *
 * Deliberately not an instant cut-off: the perpetual subscription is given 30
 * days so the vendor has time to buy a plan before anything disappears.
 */
export async function revokeEntitlement(
  env: Env,
  args: { businessId: number; actorId: number | null; reason?: string | null }
): Promise<void> {
  const before = await entitlementFor(env, args.businessId);
  if (!before) return;

  await env.DB.prepare(
    `UPDATE businesses SET plan_override = NULL, plan_override_reason = NULL, plan_override_by = NULL, plan_override_at = NULL WHERE id = ?`
  ).bind(args.businessId).run();

  const grace = daysFromNow(30);
  await env.DB.prepare(
    `UPDATE subscriptions SET expires_at = ?, renews_at = ?, status = 'active' WHERE business_id = ? AND expires_at IS NULL AND status = 'active'`
  ).bind(grace, grace, args.businessId).run();

  const b = (await env.DB.prepare('SELECT name, owner_user_id FROM businesses WHERE id = ?').bind(args.businessId).first()) as
    | { name: string; owner_user_id: number }
    | null;

  await notify(env, {
    userId: b?.owner_user_id ?? 0,
    type: 'entitlement.revoked',
    title: 'Complimentary plan ending',
    body: `The complimentary ${before.plan_name ?? 'plan'} on ${b?.name ?? 'your store'} ends in 30 days. Choose a plan before then to keep everything live.`,
    data: { business_id: args.businessId },
  });

  await audit(env, {
    actor: { id: args.actorId, role: args.actorId ? 'admin' : 'system' },
    action: 'entitlement.revoke',
    entityType: 'business',
    entityId: args.businessId,
    meta: { was_plan_slug: before.plan_slug, reason: args.reason?.slice(0, 500) ?? null },
  });
}

/** Mark (or unmark) a business as the platform owner's own store. */
export async function setPlatformOwner(
  env: Env,
  args: { businessId: number; isOwner: boolean; actorId: number | null }
): Promise<void> {
  await env.DB.prepare(`UPDATE businesses SET is_platform_owner = ? WHERE id = ?`).bind(args.isOwner ? 1 : 0, args.businessId).run();
  if (args.isOwner) await syncEntitlement(env, args.businessId);
  await audit(env, {
    actor: { id: args.actorId, role: args.actorId ? 'admin' : 'system' },
    action: args.isOwner ? 'platform_owner.set' : 'platform_owner.clear',
    entityType: 'business',
    entityId: args.businessId,
  });
}

/** Every store holding a granted plan — used by the hourly cron to self-heal. */
export async function entitledBusinessIds(env: Env): Promise<number[]> {
  const rows = (await env.DB.prepare(
    `SELECT id FROM businesses WHERE plan_override IS NOT NULL AND deleted_at IS NULL`
  ).all()).results as { id: number }[];
  return rows.map((r) => r.id);
}
