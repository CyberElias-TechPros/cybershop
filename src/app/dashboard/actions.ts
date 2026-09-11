"use server";

/**
 * All vendor mutations. Constitution rule 3 + BUILD_PLAN 10.2: every action starts with
 * requireMembership(tenant-scoped authz) and ends with an audit row where it matters.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  catalogueItems, catalogueTypes, fieldDefinitions, fieldOptions, itemFieldValues, itemMedia,
  media as mediaTable, businesses, whatsappNumbers, inquiries,
} from "@/db/schema";
import { getDb } from "@/db/client";
import { ok, fail, uuidv7, ensureUniqueSlug, slugify, sanitizeHtml, htmlToText, type AnyResult } from "@/lib/util";
import { requireMembership, audit } from "@/core/auth";
import { projectValues, validateValues, type FieldDef } from "@/core/fields";
import { checkQuota } from "@/core/quotas";
import { normalizeWhatsapp } from "@/core/whatsapp";
import { enqueue } from "@/core/jobs";
import { PUBLIC_IMAGE_MIME, checksumOf, uploadViaDriver } from "@/core/media";

export type ItemFormPayload = {
  businessId: string;
  id?: string | null;
  typeKey: string;
  name: string;
  slug?: string;
  summary?: string;
  description?: string;
  price?: string;
  priceType?: string;
  sku?: string;
  stockQty?: string;
  isOutOfStock?: boolean;
  status?: string;
  whatsappNumberId?: string | null;
  categoryId?: string | null;
  fields: Record<string, unknown>;
  mediaIds: string[];
  expectedUpdatedAt?: string | null;
};

export async function saveItemAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const businessId = String(form.get("businessId") ?? "");
  const itemId = (form.get("id") as string) || null;
  const typeKey = String(form.get("typeKey") ?? "product");
  const { user } = await requireMembership(businessId, itemId ? "catalogue.edit" : "catalogue.edit");

  const db = getDb();
  const [type] = await db.select().from(catalogueTypes).where(eq(catalogueTypes.key, typeKey)).limit(1);
  if (!type) return fail("type", "Unknown catalogue type.");

  const status = String(form.get("status") ?? "draft");
  if (status === "published" || status === "scheduled") {
    const quota = await checkQuota(businessId, "catalogue_items", itemId ? 0 : 1);
    if (!quota.allowed) return fail("quota", quota.message ?? "Item limit reached.");
  }

  const defsRaw = await db.select().from(fieldDefinitions)
    .where(and(
      sql`(${fieldDefinitions.catalogueTypeId} = ${type.id} or ${fieldDefinitions.businessId} = ${businessId})`,
      isNull(fieldDefinitions.deprecatedAt),
    ))
    .orderBy(sql`sort_order`);
  const opts = defsRaw.length
    ? await db.select().from(fieldOptions)
        .where(and(inArray(fieldOptions.fieldDefinitionId, defsRaw.map((d) => d.id)), eq(fieldOptions.isActive, true)))
        .orderBy(sql`sort_order`)
    : [];
  const byField = new Map<string, Array<{ value: string; label: string }>>();
  for (const o of opts) {
    byField.set(o.fieldDefinitionId, [...(byField.get(o.fieldDefinitionId) ?? []), { value: o.value, label: o.label }]);
  }
  const defs: FieldDef[] = defsRaw.map((r: typeof fieldDefinitions.$inferSelect) => ({
    id: r.id, key: r.key, label: r.label, type: r.type, helpText: r.helpText,
    isRequired: r.isRequired, isPublic: r.isPublic, isFilterable: r.isFilterable, isSearchable: r.isSearchable,
    placeholder: r.placeholder, config: (r.config ?? {}) as Record<string, unknown>,
    validation: (r.validation ?? {}) as Record<string, unknown>, options: byField.get(r.id) ?? [],
  }));

  const fieldsPayload: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = form.get(`f:${def.key}`);
    if (raw === null) {
      const multi = form.getAll(`fm:${def.key}`);
      if (multi.length) fieldsPayload[def.key] = multi.map(String);
      continue;
    }
    const text = String(raw);
    fieldsPayload[def.key] = ["multiselect", "checkbox"].includes(def.type)
      ? text ? JSON.parse(text) : []
      : def.type === "location" ? (text ? JSON.parse(text) : { label: "", lat: null, lng: null })
      : def.type === "boolean" ? text === "on" || text === "true"
      : text;
  }

  const { values, errors } = validateValues(defs, fieldsPayload);
  const coreErrors: Record<string, string> = {};
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) coreErrors.name = "Give it a name buyers will recognise.";
  if (name.length > 140) coreErrors.name = "Keep the name under 140 characters.";
  const descriptionHtml = sanitizeHtml(String(form.get("description") ?? ""));
  const priceRaw = String(form.get("price") ?? "").trim();
  if (priceRaw && !/^\d{1,12}(\.\d{1,2})?$/.test(priceRaw)) coreErrors.price = "Use digits only, e.g. 45000 or 45000.50";

  const allErrors = { ...coreErrors, ...(errors ?? {}) };
  if (Object.keys(allErrors).length) return fail("validation", "Please fix the highlighted fields.", allErrors);

  const slugBase = String(form.get("slug") ?? "").trim() || name;
  const mediaIds = String(form.get("mediaIds") ?? "").split(",").filter(Boolean);
  const heroMediaId = mediaIds[0] ?? null;
  if (type.key === "product" && (form.get("requireImage") === "1") && !mediaIds.length) {
    coreErrors.media = "Add at least one photo - listings with photos get far more WhatsApp clicks.";
    return fail("validation", "Please fix the highlighted fields.", coreErrors);
  }

  const record = {
    name, slug: "", summary: String(form.get("summary") ?? "").trim() || null,
    descriptionHtml: descriptionHtml || null, descriptionText: htmlToText(descriptionHtml).slice(0, 2000) || null,
    status: status as never, price: priceRaw || null, priceType: (form.get("priceType") ?? "fixed") as never,
    sku: String(form.get("sku") ?? "").trim() || null,
    stockQty: form.get("stockQty") ? Number(form.get("stockQty")) : null,
    isOutOfStock: form.get("isOutOfStock") === "on",
    whatsappNumberId: String(form.get("whatsappNumberId") ?? "") || null,
    categoryId: String(form.get("categoryId") ?? "") || null,
  };

  let savedId = itemId;
  await db.transaction(async (tx) => {
    if (itemId) {
      const [current] = await tx.select().from(catalogueItems)
        .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt)))
        .limit(1);
      if (!current) throw new Error("not found");
      // optimistic lock (BUILD_PLAN 9.3): two staff members must not silently overwrite
      const expected = String(form.get("expectedUpdatedAt") ?? "");
      if (expected && current.updatedAt.toISOString() !== expected) {
        throw new Error("conflict: someone else saved this item while you were editing.");
      }
      const taken = new Set((await tx.select({ slug: catalogueItems.slug }).from(catalogueItems)
        .where(and(eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt), sql`id <> ${itemId}`))).map((r) => r.slug));
      const slug = ensureUniqueSlug(slugify(slugBase), taken);
      await tx.update(catalogueItems).set({ ...record, slug, updatedAt: new Date(), publishedAt: record.status === "published" && !current.publishedAt ? new Date() : current.publishedAt })
        .where(eq(catalogueItems.id, itemId));
      await tx.delete(itemFieldValues).where(eq(itemFieldValues.itemId, itemId));
      await tx.delete(itemMedia).where(eq(itemMedia.itemId, itemId));
      savedId = itemId;
    } else {
      const taken = new Set((await tx.select({ slug: catalogueItems.slug }).from(catalogueItems)
        .where(and(eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt)))).map((r) => r.slug));
      const [row] = await tx.insert(catalogueItems).values({
        id: uuidv7(), businessId, catalogueTypeId: type.id,
        ...record, slug: ensureUniqueSlug(slugify(slugBase), taken),
        publishedAt: record.status === "published" ? new Date() : null,
        createdBy: user.userId,
        search: `${name} ${record.summary ?? ""} ${record.descriptionText ?? ""}`,
      }).returning({ id: catalogueItems.id });
      savedId = row!.id;
    }

    const projections = projectValues(defs, values);
    for (const p of projections) {
      await tx.insert(itemFieldValues).values({
        itemId: savedId!, fieldDefinitionId: p.fieldDefinitionId, value: p.value as never,
        valueText: p.valueText, valueNum: p.valueNum, valueJson: (p.valueJson ?? null) as never,
      }).onConflictDoNothing();
    }
    for (let i = 0; i < mediaIds.length; i++) {
      await tx.insert(itemMedia).values({ itemId: savedId!, mediaId: mediaIds[i]!, role: i === 0 ? "hero" : "gallery", sortorder: i }).onConflictDoNothing();
    }
    if (mediaIds.length) {
      await tx.update(mediaTable).set({ status: "attached", attachedAt: new Date(), lastSeenAt: new Date(), entityRef: savedId, entityKind: "item_image", quotaCharged: true })
        .where(and(inArray(mediaTable.id, mediaIds), eq(mediaTable.businessId, businessId)));
    }
    await tx.update(catalogueItems).set({ search: sql`concat(${name}::text, ' ', coalesce(${record.summary}::text, ''), ' ', coalesce(${record.descriptionText}::text, ''))` })
      .where(eq(catalogueItems.id, savedId!));
  });

  await audit({
    actorUserId: user.userId, action: itemId ? "item.update" : "item.create", resource: "catalogue_item",
    resourceId: savedId, businessId, after: { name, status: record.status, fields: Object.keys(values).length },
  });

  revalidatePath(`/business/${await slugOf(businessId)}`);
  revalidatePath("/dashboard/catalogue");
  return ok({ id: savedId });
}

export async function itemStatusAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const next = String(form.get("status") ?? "");
  const { user } = await requireMembership(businessId, next === "archived" ? "catalogue.delete" : "catalogue.edit");
  const db = getDb();
  const allowed = ["published", "unpublished", "archived", "draft"];
  if (!allowed.includes(next)) return;
  const [before] = await db.select({ status: catalogueItems.status, name: catalogueItems.name }).from(catalogueItems)
    .where(and(eq(catalogueItems.id, id), eq(catalogueItems.businessId, businessId))).limit(1);
  if (!before) return;
  await db.update(catalogueItems).set({
    status: next as never, updatedAt: new Date(),
    publishedAt: next === "published" ? new Date() : undefined,
  }).where(and(eq(catalogueItems.id, id), eq(catalogueItems.businessId, businessId)));
  await audit({ actorUserId: user.userId, action: `item.${next}`, resource: "catalogue_item", resourceId: id, businessId, before });
  revalidatePath("/dashboard/catalogue");
  return;
}

export async function deleteItemAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const { user } = await requireMembership(businessId, "catalogue.delete");
  const db = getDb();
  const [item] = await db.select({ id: catalogueItems.id, name: catalogueItems.name }).from(catalogueItems)
    .where(and(eq(catalogueItems.id, id), eq(catalogueItems.businessId, businessId))).limit(1);
  if (!item) return;
  await db.update(catalogueItems).set({ deletedAt: new Date(), status: "archived" }).where(eq(catalogueItems.id, id));
  // schedule the files, do not delete synchronously (plan.md 58 / BUILD_PLAN 17.3)
  await db.update(mediaTable).set({ status: "unused", lastSeenAt: new Date() })
    .where(and(eq(mediaTable.entityRef, id), eq(mediaTable.businessId, businessId)));
  await enqueue("media.orphan_sweep", { reason: "item_deleted", itemId: id }, { dedupeKey: `orphan:${id}`, runAt: new Date(Date.now() + 60_000) });
  await audit({ actorUserId: user.userId, action: "item.delete", resource: "catalogue_item", resourceId: id, businessId, before: item });
  revalidatePath("/dashboard/catalogue");
  redirect("/dashboard/catalogue");
}

export async function duplicateItemAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const { user } = await requireMembership(businessId, "catalogue.edit");
  const quota = await checkQuota(businessId, "catalogue_items");
  if (!quota.allowed) return;
  const db = getDb();
  const [src] = await db.select().from(catalogueItems).where(and(eq(catalogueItems.id, id), eq(catalogueItems.businessId, businessId))).limit(1);
  if (!src) return;
  const taken = new Set((await db.select({ slug: catalogueItems.slug }).from(catalogueItems).where(eq(catalogueItems.businessId, businessId))).map((r) => r.slug));
  const [copy] = await db.insert(catalogueItems).values({
    id: uuidv7(), businessId, catalogueTypeId: src.catalogueTypeId, categoryId: src.categoryId,
    slug: ensureUniqueSlug(`${src.slug}-copy`, taken), name: `${src.name} (copy)`, summary: src.summary,
    descriptionHtml: src.descriptionHtml, descriptionText: src.descriptionText, status: "draft",
    price: src.price, priceType: src.priceType, currency: src.currency, sku: src.sku ? `${src.sku}-C` : null,
    whatsappNumberId: src.whatsappNumberId, createdBy: user.userId, search: src.search,
  }).returning({ id: catalogueItems.id });
  const vals = await db.select().from(itemFieldValues).where(eq(itemFieldValues.itemId, id));
  for (const v of vals) {
    await db.insert(itemFieldValues).values({ itemId: copy!.id, fieldDefinitionId: v.fieldDefinitionId, value: v.value as never, valueText: v.valueText, valueNum: v.valueNum, valueJson: v.valueJson as never }).onConflictDoNothing();
  }
  const links = await db.select().from(itemMedia).where(eq(itemMedia.itemId, id));
  for (const l of links) await db.insert(itemMedia).values({ itemId: copy!.id, mediaId: l.mediaId, role: l.role, sortorder: l.sortorder }).onConflictDoNothing();
  await audit({ actorUserId: user.userId, action: "item.duplicate", resource: "catalogue_item", resourceId: copy!.id, businessId });
  revalidatePath("/dashboard/catalogue");
  return;
}

/* ------------------------------ WhatsApp numbers ------------------------------ */
export async function addWhatsappNumberAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const businessId = String(form.get("businessId") ?? "");
  const { user } = await requireMembership(businessId, "whatsapp.manage");
  const norm = normalizeWhatsapp(String(form.get("number") ?? ""));
  if (!norm.ok) return fail("number", norm.reason, { number: norm.reason });
  const quota = await checkQuota(businessId, "whatsapp_numbers");
  if (!quota.allowed) return fail("quota", quota.message ?? "Number limit reached.", { number: quota.message ?? "" });

  const db = getDb();
  const count = await db.select({ n: sql<number>`count(*)::int` }).from(whatsappNumbers).where(eq(whatsappNumbers.businessId, businessId));
  const id = uuidv7();
  await db.insert(whatsappNumbers).values({
    id, businessId, e164: norm.e164, label: String(form.get("label") ?? "General").slice(0, 40) || "General",
    isDefault: Number(count[0]?.n ?? 0) === 0, isActive: true, verifiedAt: new Date(),
  });
  await audit({ actorUserId: user.userId, action: "whatsapp.number_add", resource: "whatsapp_number", resourceId: id, businessId, after: { label: String(form.get("label") ?? "General") } });
  revalidatePath("/dashboard/whatsapp");
  return ok({ id });
}

export async function whatsappAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const op = String(form.get("op") ?? "");
  const { user } = await requireMembership(businessId, "whatsapp.manage");
  const db = getDb();
  if (op === "default") {
    await db.update(whatsappNumbers).set({ isDefault: false }).where(eq(whatsappNumbers.businessId, businessId));
    await db.update(whatsappNumbers).set({ isDefault: true, isActive: true }).where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.businessId, businessId)));
  } else if (op === "toggle") {
    const [n] = await db.select({ isActive: whatsappNumbers.isActive }).from(whatsappNumbers).where(eq(whatsappNumbers.id, id)).limit(1);
    await db.update(whatsappNumbers).set({ isActive: !n?.isActive }).where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.businessId, businessId)));
  } else if (op === "delete") {
    const [n] = await db.select().from(whatsappNumbers).where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.businessId, businessId))).limit(1);
    if (!n) return;
    if (n.isDefault) {
      const [alt] = await db.select({ id: whatsappNumbers.id }).from(whatsappNumbers)
        .where(and(eq(whatsappNumbers.businessId, businessId), sql`id <> ${id}`, eq(whatsappNumbers.isActive, true))).limit(1);
      if (alt) await db.update(whatsappNumbers).set({ isDefault: true }).where(eq(whatsappNumbers.id, alt.id));
    }
    await db.delete(whatsappNumbers).where(eq(whatsappNumbers.id, id));
    await audit({ actorUserId: user.userId, action: "whatsapp.number_delete", resource: "whatsapp_number", resourceId: id, businessId, before: { label: n.label } });
  }
  revalidatePath("/dashboard/whatsapp");
  return;
}

/* ------------------------------ media ------------------------------ */
export async function uploadMediaAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const businessId = String(form.get("businessId") ?? "");
  const { user } = await requireMembership(businessId, "media.delete");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("file", "Choose a photo to upload.");

  const quota = await checkQuota(businessId, "media_bytes", file.size);
  if (!quota.allowed) return fail("quota", quota.message ?? "Storage full.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadViaDriver({
    businessId, entityKind: "item_image", folder: "catalogue/unsorted", originalName: file.name,
    bytes: file.size, declaredMime: file.type, visibility: "public",
    maxBytes: 8_000_000, allowedMime: PUBLIC_IMAGE_MIME,
  }, bytes);
  if (!res.ok) return fail("invalid", res.reason, { file: res.reason });

  const db = getDb();
  const [existing] = await db.select({ id: mediaTable.id }).from(mediaTable)
    .where(and(eq(mediaTable.businessId, businessId), eq(mediaTable.checksum, res.stored.checksum), isNull(mediaTable.deletedAt))).limit(1);
  if (existing) return ok({ id: existing.id, deduped: true });

  const id = uuidv7();
  await db.insert(mediaTable).values({
    id, businessId, ownerUserId: user.userId, entityKind: "item_image",
    storageKey: res.stored.storageKey, publicUrl: res.stored.publicUrl, originalName: res.stored.extension === "bin" ? file.name : file.name,
    mimeType: res.stored.mimeType, extension: res.stored.extension, byteSize: res.stored.byteSize,
    width: res.stored.width, height: res.stored.height, checksum: checksumOf(bytes),
    altText: String(form.get("alt") ?? "").slice(0, 200) || null, visibility: "public", status: "available", quotaCharged: true,
  });
  await audit({ actorUserId: user.userId, action: "media.upload", resource: "media", resourceId: id, businessId, after: { bytes: res.stored.byteSize } });
  revalidatePath("/dashboard/media");
  return ok({ id });
}

export async function deleteMediaAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const { user } = await requireMembership(businessId, "media.delete");
  const db = getDb();
  const [m] = await db.select().from(mediaTable).where(and(eq(mediaTable.id, id), eq(mediaTable.businessId, businessId))).limit(1);
  if (!m) return;
  const [usedBy] = await db.select({ n: sql<number>`count(*)::int` }).from(itemMedia).where(eq(itemMedia.mediaId, id));
  await db.update(mediaTable).set({ status: "unused", lastSeenAt: new Date(), deletedAt: new Date(), quotaCharged: false }).where(eq(mediaTable.id, id));
  await enqueue("media.orphan_sweep", { reason: "manual", mediaId: id }, { dedupeKey: `orphan:${id}`, runAt: new Date(Date.now() + 60_000) });
  await audit({ actorUserId: user.userId, action: "media.delete", resource: "media", resourceId: id, businessId, before: { key: m.storageKey, usedBy: Number(usedBy?.n ?? 0) } });
  revalidatePath("/dashboard/media");
  return;
}

/* ------------------------------ settings / storefront ------------------------------ */
export async function updateSettingsAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const businessId = String(form.get("businessId") ?? "");
  const { user } = await requireMembership(businessId, "business.update");
  const db = getDb();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2) return fail("validation", "Business name is too short.", { name: "Enter your business name." });
  const patch: Partial<typeof businesses.$inferInsert> = {
    name, tagline: String(form.get("tagline") ?? "").slice(0, 120) || null,
    description: String(form.get("description") ?? "").slice(0, 4000) || null,
    city: String(form.get("city") ?? "").slice(0, 60) || null,
    phone: String(form.get("phone") ?? "").slice(0, 30) || null,
    email: String(form.get("email") ?? "").slice(0, 120) || null,
    address: String(form.get("address") ?? "").slice(0, 200) || null,
    serviceArea: String(form.get("service_area") ?? "").slice(0, 200) || null,
    visibilityPausedByVendor: form.get("paused") === "on",
    updatedAt: new Date(),
  };
  const slug = slugify(String(form.get("slug") ?? ""));
  if (slug && slug.length > 2) {
    const [current] = await db.select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (current?.slug !== slug) {
      const taken = new Set((await db.select({ slug: businesses.slug }).from(businesses).where(sql`id <> ${businessId}`)).map((r) => r.slug));
      if (taken.has(slug)) return fail("slug_taken", "That web address is taken.", { slug: "Someone else already uses that address." });
      patch.slug = slug;
    }
  }
  await db.update(businesses).set(patch).where(eq(businesses.id, businessId));
  await audit({ actorUserId: user.userId, action: "business.update", resource: "business", resourceId: businessId, businessId, after: patch });
  revalidatePath("/dashboard/settings");
  revalidatePath(`/business/${patch.slug ?? "store"}`);
  return ok(null);
}

export async function saveStorefrontAction(prev: AnyResult | null, form: FormData): Promise<AnyResult | null> {
  const businessId = String(form.get("businessId") ?? "");
  const { user } = await requireMembership(businessId, "storefront.edit");
  const sections = form.getAll("sections").map(String).filter(Boolean);
  const db = getDb();
  const [before] = await db.select({ storefront: businesses.storefront }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  await db.update(businesses).set({
    storefront: {
      ...((before?.storefront ?? {}) as Record<string, unknown>),
      style: String(form.get("style") ?? "classic"),
      accent: String(form.get("accent") ?? "").slice(0, 7) || null,
      sections,
    } as never,
    updatedAt: new Date(),
  }).where(eq(businesses.id, businessId));
  await audit({ actorUserId: user.userId, action: "storefront.update", resource: "business", resourceId: businessId, businessId, before, after: { sections } });
  revalidatePath("/dashboard/storefront");
  return ok(null);
}

export async function updateLeadStatusAction(form: FormData): Promise<void> {
  const businessId = String(form.get("businessId") ?? "");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  const { user } = await requireMembership(businessId, "leads.edit");
  const allowed = ["new", "contacted", "interested", "negotiating", "converted", "lost"];
  if (!allowed.includes(status)) return;
  await getDb().update(inquiries).set({ status: status as never, statusChangedAt: new Date(), outcomeNote: String(form.get("note") ?? "").slice(0, 500) || null })
    .where(and(eq(inquiries.id, id), eq(inquiries.businessId, businessId)));
  await audit({ actorUserId: user.userId, action: "lead.status", resource: "inquiry", resourceId: id, businessId, after: { status } });
  revalidatePath("/dashboard/leads");
  return;
}

async function slugOf(businessId: string) {
  const [b] = await getDb().select({ slug: businesses.slug }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return b?.slug ?? "store";
}
