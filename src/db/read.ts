/**
 * Read side. Public pages query through here so the tenant scoping and the
 * "what is indexable" rules live in one place (invariant I4, BUILD_PLAN 15).
 */
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import {
  analyticsEvents, businesses, businessTypes, catalogueItems, catalogueTypes, categories,
  fieldDefinitions, fieldOptions, itemFieldValues, itemMedia, media, offers, variants, whatsappNumbers, whatsappRouting,
} from "@/db/schema";
import { getDb } from "@/db/client";
import type { FieldDef } from "@/core/fields";

export const PUBLIC_BIZ = and(isNull(businesses.deletedAt), eq(businesses.status, "active"), eq(businesses.visibility, "public")) as SQL;
export const LIVE_ITEM = and(eq(catalogueItems.status, "published"), isNull(catalogueItems.deletedAt)) as SQL;

export async function getBusinessBySlug(slug: string) {
  const db = getDb();
  const [b] = await db.select().from(businesses)
    .where(and(eq(businesses.slug, slug), isNull(businesses.deletedAt)))
    .limit(1);
  return b ?? null;
}

/** a suspended/expired store stays reachable for the owner but must not be indexed (plan.md 41) */
export function isIndexable(b: { status: string; visibility: string } | null) {
  return !!b && b.status === "active" && b.visibility === "public";
}

export async function listItems(opts: {
  businessId?: string; typeKey?: string; limit?: number; offset?: number; search?: string;
  featured?: boolean; includeDrafts?: boolean; sort?: "recent" | "price_asc" | "price_desc" | "popular";
}) {
  const db = getDb();
  const conds: SQL[] = [];
  if (opts.businessId) conds.push(eq(catalogueItems.businessId, opts.businessId));
  if (!opts.includeDrafts) conds.push(LIVE_ITEM);
  if (opts.featured) conds.push(eq(catalogueItems.isFeatured, true));
  if (opts.typeKey) conds.push(eq(catalogueTypes.key, opts.typeKey));
  if (opts.search) {
    const p = `%${opts.search.toLowerCase()}%`;
    conds.push(or(like(sql`lower(${catalogueItems.name})`, p), like(sql`lower(${catalogueItems.summary})`, p), like(sql`lower(${catalogueItems.search})`, p))!);
  }
  const order = opts.sort === "price_asc" ? asc(catalogueItems.price)
    : opts.sort === "price_desc" ? desc(catalogueItems.price)
    : opts.sort === "popular" ? desc(catalogueItems.viewCount)
    : desc(catalogueItems.publishedAt);

  const heroUrl = sql<string | null>`(select m.public_url from item_media im join media m on m.id = im.media_id where im.item_id = ${catalogueItems.id} and m.deleted_at is null order by im.sort_order limit 1)`;
  const rows = await db.select({
    item: catalogueItems,
    type: catalogueTypes,
    business: { id: businesses.id, slug: businesses.slug, name: businesses.name, city: businesses.city, status: businesses.status },
    heroUrl,
  })
    .from(catalogueItems)
    .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
    .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
    .where(and(...conds))
    .orderBy(order)
    .limit(opts.limit ?? 24)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    ...r.item, typeKey: r.type.key, ctaVerb: r.type.ctaVerb, schemaKind: r.type.schemaKind,
    itemNoun: r.type.itemNoun, business: r.business, heroUrl: r.heroUrl ?? null,
  }));
}

export async function countItems(businessId: string) {
  const db = getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int`, live: sql<number>`count(*) filter (where ${catalogueItems.status} = 'published')::int` })
    .from(catalogueItems).where(and(eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt)));
  return { total: Number(r?.n ?? 0), published: Number(r?.live ?? 0) };
}

export async function getItemBySlug(businessSlug: string, typeKey: string, itemSlug: string) {
  const db = getDb();
  const [row] = await db.select({ item: catalogueItems, type: catalogueTypes })
    .from(catalogueItems)
    .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
    .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
    .where(and(eq(businesses.slug, businessSlug), eq(catalogueItems.slug, itemSlug), eq(catalogueTypes.key, typeKey), isNull(catalogueItems.deletedAt)))
    .limit(1);
  if (!row) return null;
  const [item, images, values, defs, activeOffer, variantRows] = await Promise.all([
    Promise.resolve(row.item),
    getMediaForItem(row.item.id),
    getFieldValueBag(row.item.id),
    getFieldDefs(row.item.catalogueTypeId),
    getActiveOffer(row.item.id),
    db.select().from(variants).where(eq(variants.itemId, row.item.id)).limit(50),
  ]);
  return {
    item, type: row.type, images, values, defs, offer: activeOffer,
    variants: variantRows.map((v) => ({ id: v.id, name: v.name, price: v.price, stockQty: v.stockQty, isAvailable: v.isAvailable, options: (v.options ?? {}) as Record<string, string> })),
  };
}

export async function getMediaForItem(itemId: string) {
  const db = getDb();
  return db.select({ id: media.id, url: media.publicUrl, alt: media.altText, w: media.width, h: media.height, kind: itemMedia.role })
    .from(itemMedia).innerJoin(media, eq(media.id, itemMedia.mediaId))
    .where(and(eq(itemMedia.itemId, itemId), isNull(media.deletedAt)))
    .orderBy(asc(itemMedia.sortorder));
}

/** field definitions for a type, with their options attached (the shape core/fields expects) */
export async function getFieldDefs(catalogueTypeId: string, businessId?: string | null): Promise<FieldDef[]> {
  const db = getDb();
  const rows = await db.select().from(fieldDefinitions)
    .where(and(
      or(eq(fieldDefinitions.catalogueTypeId, catalogueTypeId), businessId ? eq(fieldDefinitions.businessId, businessId) : undefined),
      isNull(fieldDefinitions.deprecatedAt),
    ))
    .orderBy(asc(fieldDefinitions.sortOrder));
  if (!rows.length) return [];
  const opts = await db.select().from(fieldOptions).where(inArray(fieldOptions.fieldDefinitionId, rows.map((r) => r.id)));
  const byField = new Map<string, Array<{ value: string; label: string }>>();
  for (const o of opts) byField.set(o.fieldDefinitionId, [...(byField.get(o.fieldDefinitionId) ?? []), { value: o.value, label: o.label }]);
  return rows.map((r) => ({
    id: r.id, key: r.key, label: r.label, type: r.type, helpText: r.helpText,
    isRequired: r.isRequired, isPublic: r.isPublic, isFilterable: r.isFilterable, isSearchable: r.isSearchable,
    placeholder: r.placeholder, config: (r.config ?? {}) as Record<string, unknown>, validation: (r.validation ?? {}) as Record<string, unknown>,
    options: byField.get(r.id) ?? [],
  }));
}

export async function getFieldValueBag(itemId: string) {
  const db = getDb();
  const rows = await db.select({ defId: itemFieldValues.fieldDefinitionId, value: itemFieldValues.value })
    .from(itemFieldValues).where(eq(itemFieldValues.itemId, itemId));
  return new Map(rows.map((r) => [r.defId, r.value as unknown]));
}

export async function getActiveOffer(itemId: string) {
  const db = getDb();
  const [o] = await db.select().from(offers).where(and(
    eq(offers.itemId, itemId), eq(offers.isActive, true),
    sql`(${offers.startsAt} is null or ${offers.startsAt} <= now())`,
    sql`(${offers.endsAt} is null or ${offers.endsAt} >= now())`,
  )).limit(1);
  return o ?? null;
}

export async function getWhatsappContext(businessId: string) {
  const db = getDb();
  const [numbers, rules] = await Promise.all([
    db.select().from(whatsappNumbers).where(eq(whatsappNumbers.businessId, businessId)),
    db.select().from(whatsappRouting).where(eq(whatsappRouting.businessId, businessId)),
  ]);
  return {
    numbers: numbers.map((n) => ({ id: n.id, e164: n.e164, label: n.label, isDefault: n.isDefault, isActive: n.isActive })),
    rules: rules.map((r) => ({ matchType: r.matchType as never, matchRef: r.matchRef, whatsappNumberId: r.whatsappNumberId, priority: r.priority })),
  };
}

export async function getTemplate(kind: string, scopeIds: Array<{ scope: string; refId: string | null }>) {
  const db = getDb();
  const { waTemplates } = await import("@/db/schema");
  for (const s of scopeIds) {
    const [t] = await db.select().from(waTemplates).where(and(
      eq(waTemplates.scope, s.scope), eq(waTemplates.kind, kind),
      s.refId ? eq(waTemplates.refId, s.refId) : isNull(waTemplates.refId),
      eq(waTemplates.isActive, true),
    )).limit(1);
    if (t) return t;
  }
  const [platform] = await db.select().from(waTemplates).where(and(eq(waTemplates.scope, "platform"), eq(waTemplates.kind, kind), eq(waTemplates.isActive, true))).limit(1);
  return platform ?? null;
}

export async function trackView(input: { kind: string; businessId: string; itemId?: string | null; req?: Request }) {
  try {
    const db = getDb();
    await db.insert(analyticsEvents).values({
      businessId: input.businessId, itemId: input.itemId ?? null, kind: input.kind,
      country: input.req?.headers.get("x-vercel-ip-country") ?? null,
      referrer: input.req?.headers.get("referer")?.slice(0, 200) ?? null,
    });
    if (input.itemId) await db.update(catalogueItems).set({ viewCount: sql`${catalogueItems.viewCount} + 1` }).where(eq(catalogueItems.id, input.itemId));
  } catch {
    /* analytics must never break a page (BUILD_PLAN 16) */
  }
}

export async function getCategoriesForBusiness(businessId: string) {
  const db = getDb();
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, count: sql<number>`count(*)::int` })
    .from(catalogueItems)
    .innerJoin(categories, eq(categories.id, catalogueItems.categoryId))
    .where(and(eq(catalogueItems.businessId, businessId), LIVE_ITEM))
    .groupBy(categories.id, categories.name, categories.slug)
    .orderBy(desc(sql`count(*)`));
}

export async function listBusinessTypes() {
  const db = getDb();
  return db.select({ id: businessTypes.id, key: businessTypes.key, name: businessTypes.name, icon: businessTypes.icon })
    .from(businessTypes).where(eq(businessTypes.isActive, true)).orderBy(asc(businessTypes.sortOrder));
}
