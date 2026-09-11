/**
 * Quota + plan enforcement — BUILD_PLAN 6.4 / 7.4 / 11.3.
 * Enforcement lives in the action (before the write), and is re-checked by jobs, because
 * admin can change a plan retroactively.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { catalogueItems, media, planQuotas, plans, quotaResource, subscriptions, usageRecords, whatsappNumbers } from "@/db/schema";
import { getDb } from "@/db/client";

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number | null;      // null = unlimited
  pct: number | null;
  warning: boolean;           // >= soft limit
  message: string | null;     // upgrade copy in plain language (plan.md 13.5)
};

export async function planFor(businessId: string) {
  const db = getDb();
  const [row] = await db
    .select({ plan: plans, sub: subscriptions })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.businessId, businessId), sql`${subscriptions.currentPeriodEnd} > now() - interval '90 days'`))
    .orderBy(sql`${subscriptions.startedAt} desc`)
    .limit(1);
  return row?.plan ?? null;
}

/** expiry is also computed at read time (BUILD_PLAN 17.2) so a missed cron cannot grant privilege */
export function isPlanLive(sub: { status: string; currentPeriodEnd: Date; graceEndsAt: Date | null } | null, now = new Date()) {
  if (!sub) return false;
  if (sub.currentPeriodEnd > now) return true;
  return sub.status === "grace" && !!sub.graceEndsAt && sub.graceEndsAt > now;
}

export async function checkQuota(businessId: string, resource: (typeof quotaResource.enumValues)[number], addend = 1): Promise<QuotaCheck> {
  const db = getDb();
  const plan = await planFor(businessId);
  const [q] = plan
    ? await db.select().from(planQuotas).where(and(eq(planQuotas.planId, plan.id), eq(planQuotas.resource, resource))).limit(1)
    : [undefined];

  // null limit on an existing row = unlimited; no row at all = the platform default (10 items, 1 number, 500MB)
  const limit = q ? q.quotaLimit : DEFAULTS[resource] ?? 0;
  const used = await measure(businessId, resource);
  const projected = used + addend;

  if (limit === null) return { allowed: true, used, limit: null, pct: null, warning: false, message: null };
  const pct = limit === 0 ? 100 : Math.round((projected / limit) * 100);
  const soft = q?.softLimitPct ?? 80;
  const noun = NOUNS[resource] ?? resource;
  if (projected > limit) {
    return {
      allowed: false, used, limit, pct, warning: true,
      message: `Your ${plan?.name ?? "Free"} plan includes ${limit} ${noun}. Remove one or upgrade to add more — extra ${noun} is a paid add-on.`,
    };
  }
  return { allowed: true, used, limit, pct, warning: pct >= soft, message: pct >= soft ? `You are using ${pct}% of your ${noun} allowance.` : null };
}

const DEFAULTS: Partial<Record<string, number | null>> = {
  catalogue_items: 10, whatsapp_numbers: 1, media_bytes: 500 * 1024 * 1024, categories: 2,
  staff_seats: 1, offers: 0, featured_slots: 0, locations: 1, custom_fields: 0,
};

const NOUNS: Record<string, string> = {
  catalogue_items: "catalogue items", whatsapp_numbers: "WhatsApp numbers", media_bytes: "storage",
  staff_seats: "team seats", offers: "offers", featured_slots: "featured slots", locations: "business locations",
};

export async function measure(businessId: string, resource: string): Promise<number> {
  const db = getDb();
  switch (resource) {
    case "catalogue_items": {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(catalogueItems)
        .where(and(eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt)));
      return Number(r?.n ?? 0);
    }
    case "whatsapp_numbers": {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(whatsappNumbers)
        .where(and(eq(whatsappNumbers.businessId, businessId), eq(whatsappNumbers.isActive, true)));
      return Number(r?.n ?? 0);
    }
    case "media_bytes": {
      const [r] = await db.select({ n: sql<number>`coalesce(sum(${media.byteSize}),0)::bigint` }).from(media)
        .where(and(eq(media.businessId, businessId), eq(media.quotaCharged, true), isNull(media.deletedAt)));
      return Number(r?.n ?? 0);
    }
    default: {
      const [r] = await db.select({ used: usageRecords.used }).from(usageRecords)
        .where(and(eq(usageRecords.businessId, businessId), eq(usageRecords.resource, resource as never))).limit(1);
      return Number(r?.used ?? 0);
    }
  }
}

export async function recalcUsage(businessId: string) {
  const db = getDb();
  const resources = ["catalogue_items", "whatsapp_numbers", "media_bytes"] as const;
  for (const res of resources) {
    const used = await measure(businessId, res);
    await db.insert(usageRecords).values({ businessId, resource: res as never, used, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [usageRecords.businessId, usageRecords.resource], set: { used, updatedAt: new Date() } });
  }
  return { ok: true };
}

export function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
