import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { catalogueItems, catalogueTypes, fieldDefinitions, fieldOptions, itemFieldValues, itemMedia, media, whatsappNumbers } from "@/db/schema";
import { getDb } from "@/db/client";
import type { FieldDef } from "@/core/fields";
import type { EditorItem } from "./editor";

/** Shared loader for /new and /[id]/edit so both use one field-resolution path. */
export async function loadEditor(businessId: string, typeKey: string, itemId: string | null): Promise<EditorItem | { error: string }> {
  const db = getDb();
  const [type] = await db.select().from(catalogueTypes).where(eq(catalogueTypes.key, typeKey)).limit(1);
  if (!type) return { error: "Unknown catalogue type." };

  const [item] = itemId
    ? await db.select().from(catalogueItems).where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.businessId, businessId), isNull(catalogueItems.deletedAt))).limit(1)
    : [null];
  if (itemId && !item) return { error: "That item does not exist in your store." };

  const defsRows = await db.select().from(fieldDefinitions)
    .where(and(
      sql`(${fieldDefinitions.catalogueTypeId} = ${type.id} or ${fieldDefinitions.businessId} = ${businessId})`,
      isNull(fieldDefinitions.deprecatedAt),
    ))
    .orderBy(asc(fieldDefinitions.sortOrder));

  const opts = defsRows.length
    ? await db.select().from(fieldOptions).where(and(inArray(fieldOptions.fieldDefinitionId, defsRows.map((d) => d.id)), eq(fieldOptions.isActive, true))).orderBy(asc(fieldOptions.sortOrder))
    : [];
  const byField = new Map<string, Array<{ value: string; label: string }>>();
  for (const o of opts) byField.set(o.fieldDefinitionId, [...(byField.get(o.fieldDefinitionId) ?? []), { value: o.value, label: o.label }]);

  const defs: FieldDef[] = defsRows.map((r) => ({
    id: r.id, key: r.key, label: r.label, type: r.type, helpText: r.helpText,
    isRequired: r.isRequired, isPublic: r.isPublic, isFilterable: r.isFilterable, isSearchable: r.isSearchable,
    placeholder: r.placeholder, config: (r.config ?? {}) as Record<string, unknown>,
    validation: (r.validation ?? {}) as Record<string, unknown>, options: byField.get(r.id) ?? [],
    isAdvancedDefault: !r.isSearchable && !r.isFilterable && !r.isRequired && r.type !== "text" && r.type !== "textarea",
    defaultValue: (r.defaultValue ?? undefined) as unknown,
  }));

  const [valueRows, mediaRows, numbers] = await Promise.all([
    item ? db.select({ defId: itemFieldValues.fieldDefinitionId, value: itemFieldValues.value }).from(itemFieldValues).where(eq(itemFieldValues.itemId, item.id)) : Promise.resolve([]),
    item ? db.select({ id: media.id, url: media.publicUrl, alt: media.altText, role: itemMedia.role })
      .from(itemMedia).innerJoin(media, eq(media.id, itemMedia.mediaId))
      .where(and(eq(itemMedia.itemId, item.id), isNull(media.deletedAt))).orderBy(asc(itemMedia.sortorder)) : Promise.resolve([]),
    db.select().from(whatsappNumbers).where(and(eq(whatsappNumbers.businessId, businessId), eq(whatsappNumbers.isActive, true))),
  ]);

  const values: Record<string, unknown> = {};
  for (const v of valueRows) values[v.defId] = v.value;
  // key by field id (what FieldInput receives) AND by key (what the parser writes)
  const keyed: Record<string, unknown> = {};
  for (const d of defs) if (d.id in values) keyed[d.key] = values[d.id];

  const mediaIds = (mediaRows as Array<{ id: string; url: string | null; alt: string | null }>).map((m) => m.id);

  const editor: EditorItem = {
    id: item?.id ?? null,
      businessId,
      typeKey,
      itemNoun: type.itemNoun,
      ctaVerb: type.ctaVerb,
      requireImage: Boolean((type.mediaRules as { images?: { required?: boolean } })?.images?.required),
      updatedAt: item?.updatedAt.toISOString() ?? null,
      defs,
      values: keyed,
      initial: {
        name: item?.name ?? "", summary: item?.summary ?? "", description: stripTags(item?.descriptionHtml ?? ""),
        price: item?.price ?? "", priceType: item?.priceType ?? "fixed", sku: item?.sku ?? "",
        stockQty: item?.stockQty !== null && item?.stockQty !== undefined ? String(item.stockQty) : "",
        isOutOfStock: item?.isOutOfStock ?? false, status: item?.status ?? "draft",
        whatsappNumberId: item?.whatsappNumberId ?? "", slug: item?.slug ?? "",
      },
      numbers: numbers.map((n) => ({ id: n.id, label: n.label, e164: n.e164, isDefault: n.isDefault })),
      media: mediaIds.map((id, i) => ({ id, url: (mediaRows as Array<{ url: string | null }>)[i]?.url ?? null, alt: (mediaRows as Array<{ alt: string | null }>)[i]?.alt ?? null })),
  };
  return editor;
}

function stripTags(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<\/(li|ul|ol)>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}
