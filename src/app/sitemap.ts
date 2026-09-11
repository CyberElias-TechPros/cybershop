import type { MetadataRoute } from "next";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { businesses, catalogueItems, catalogueTypes } from "@/db/schema";
import { getDb } from "@/db/client";
import { PUBLIC_BIZ, LIVE_ITEM } from "@/db/read";
import { env } from "@/lib/env";

/**
 * Only live, public, published things are listed (plan.md 13.4). Suspended/expired/
 * unlisted stores keep working URLs for their owner but are excluded here AND noindexed.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const origin = env.PUBLIC_APP_URL.replace(/\/$/, "");

  const [stores, items] = await Promise.all([
    db.select({ slug: businesses.slug, updatedAt: businesses.updatedAt })
      .from(businesses)
      .where(PUBLIC_BIZ)
      .orderBy(desc(businesses.updatedAt)),
    db.select({
      bizSlug: businesses.slug, itemSlug: catalogueItems.slug, typeKey: catalogueTypes.key,
      updatedAt: catalogueItems.updatedAt,
    })
      .from(catalogueItems)
      .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
      .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
      .where(and(LIVE_ITEM, PUBLIC_BIZ))
      .orderBy(desc(catalogueItems.publishedAt))
      .limit(45_000),
  ]);

  return [
    { url: `${origin}/`, changeFrequency: "hourly" as const, priority: 0.8 },
    { url: `${origin}/discover`, changeFrequency: "daily" as const, priority: 0.7 },
    ...stores.map((s) => ({
      url: `${origin}/business/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "daily" as const, priority: 0.6,
    })),
    ...items.map((i) => ({
      url: `${origin}/business/${i.bizSlug}/${i.typeKey}/${i.itemSlug}`, lastModified: i.updatedAt, changeFrequency: "weekly" as const, priority: 0.5,
    })),
  ];
}
