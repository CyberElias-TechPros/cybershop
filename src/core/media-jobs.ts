/** Job handlers referenced by core/jobs.ts registry. */
import { and, eq, isNull, isNotNull, lte, lt, sql, gt } from "drizzle-orm";
import { media, businesses, subscriptions, plans, planQuotas, usageRecords } from "@/db/schema";
import { getDb } from "@/db/client";
import { mediaDriver } from "@/core/media";
import { recalcUsage } from "@/core/quotas";

const ORPHAN_GRACE_DAYS = 7;

/**
 * plan.md 58: an upload that was never attached to a record is deleted after a grace
 * period, so 100GB does not silently fill with abandoned drafts. Idempotent: re-running
 * deletes already-gone files without error (driver.delete swallows 404).
 */
export async function sweepOrphans(db = getDb()) {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_DAYS * 864e5);
  const orphans = await db.select().from(media)
    .where(and(
      sql`${media.status} in ('available', 'unused')`,
      lte(media.lastSeenAt, cutoff),
      isNull(media.deletedAt),
      sql`not exists (select 1 from item_media im where im.media_id = "media"."id")`,
    ))
    .limit(200) as typeof media.$inferSelect[];

  let removed = 0, bytes = 0;
  for (const m of orphans) {
    await mediaDriver.delete(m.storageKey, m.visibility).catch(() => undefined);
    await db.update(media).set({ status: "deleted", deletedAt: new Date(), quotaCharged: false }).where(eq(media.id, m.id));
    removed++; bytes += m.byteSize;
  }
  return { removed, bytes };
}
/** plan.md 41 / BUILD_PLAN 11.3: active -> expiring -> grace -> suspended. Never deletes. */
export async function expirySweep(db = getDb(), graceDays = 7) {
  const now = new Date();
  const expired = await db.select({ id: subscriptions.id, businessId: subscriptions.businessId })
    .from(subscriptions)
    .where(and(
      sql`${subscriptions.status} in ('active','trialing','past_due','grace')`,
      lt(subscriptions.currentPeriodEnd, now),
      sql`coalesce(${subscriptions.graceEndsAt}, now() - interval '1 second') < now()`,
    ))
    .limit(200);

  for (const s of expired) {
    await db.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.id, s.id));
    await db.update(businesses).set({ status: "suspended", updatedAt: now }).where(and(eq(businesses.id, s.businessId), eq(businesses.status, "active")));
  }

  // entering grace: past end date but within grace window -> notify, keep serving
  const entering = await db.select({ id: subscriptions.id, businessId: subscriptions.businessId, end: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, now)))
    .limit(200);
  for (const s of entering) {
    await db.update(subscriptions).set({ status: "grace", graceEndsAt: new Date(s.end.getTime() + graceDays * 864e5) })
      .where(and(eq(subscriptions.id, s.id), isNull(subscriptions.graceEndsAt)));
  }

  // stores suspended for a lapsed plan stay recoverable: nothing here touches catalogue rows
  return { expired: expired.length };
}

export async function recountAllUsage(db = getDb()) {
  const rows = await db.select({ id: businesses.id }).from(businesses).limit(500);
  for (const r of rows) await recalcUsage(r.id);
  return { businesses: rows.length };
}
