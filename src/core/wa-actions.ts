/**
 * The conversion path (BUILD_PLAN 8.3): every CTA creates a wa_link + lead row and
 * then redirects. A raw <a href="https://wa.me/..."> would be faster and completely blind.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { catalogueItems, inquiries, waLinks, whatsappNumbers } from "@/db/schema";
import { getDb } from "@/db/client";
import { env } from "@/lib/env";
import { shortCode, truncate, uuidv7 } from "@/lib/util";
import { buildWaLink, DEFAULT_TEMPLATES, renderTemplate, resolveNumber, type MessageContext } from "@/core/whatsapp";
import { messageLines, type FieldDef } from "@/core/fields";
import { getTemplate } from "@/db/read";

export type EnquiryInput = {
  businessId: string;
  businessName: string;
  itemId?: string | null;
  itemName?: string | null;
  price?: string | null;
  currency?: string;
  sku?: string | null;
  quantity?: number;
  variantLabel?: string | null;
  offerLine?: string | null;
  fieldLines?: string[];
  imageUrl?: string | null;
  pagePath?: string | null;
  numberId?: string | null;
  kind?: string;
  cart?: Array<{ name: string; qty: number; price?: string | null }>;
  totalLine?: string | null;
  visitorId?: string | null;
};

/** Build the composed message + destination number for an item, from the template chain. */
export async function composeEnquiry(input: EnquiryInput) {
  const db = getDb();
  const [bizNumbers, rules] = await Promise.all([
    db.select().from(whatsappNumbers).where(eq(whatsappNumbers.businessId, input.businessId)),
    import("@/db/schema").then((S) => db.select().from(S.whatsappRouting).where(eq(S.whatsappRouting.businessId, input.businessId))),
  ]);
  const numbers = bizNumbers.map((n) => ({ id: n.id, e164: n.e164, label: n.label, isDefault: n.isDefault, isActive: n.isActive }));

  const chosen = input.numberId
    ? numbers.find((n) => n.id === input.numberId && n.isActive) ?? null
    : null;
  const target = chosen
    ?? resolveNumber(
      { id: input.itemId ?? "", whatsappNumberId: null, categoryId: null, catalogueTypeId: null },
      numbers,
      rules.map((r) => ({ matchType: r.matchType as never, matchRef: r.matchRef, whatsappNumberId: r.whatsappNumberId, priority: r.priority })),
    );

  if (!target) {
    return { error: "This business has no active WhatsApp number yet. Use the contact form instead." } as const;
  }

  const kind = input.kind ?? (input.itemId ? "purchase_enquiry" : "general_enquiry");
  const template = await getTemplate(kind, input.itemId ? [{ scope: "item", refId: input.itemId }] : []);
  const body = template?.bodyText ?? DEFAULT_TEMPLATES[kind] ?? DEFAULT_TEMPLATES.general_enquiry!;

  const itemUrl = input.pagePath ? `${env.PUBLIC_APP_URL}${input.pagePath}` : null;
  const ctx: MessageContext = {
    businessName: input.businessName,
    itemName: input.itemName ?? input.businessName,
    itemUrl,
    imageUrl: input.imageUrl ? `${env.PUBLIC_APP_URL}${input.imageUrl}` : null,
    price: input.price ?? null,
    currency: input.currency ?? "NGN",
    quantity: input.quantity ?? 1,
    variant: input.variantLabel ?? null,
    sku: input.sku ?? null,
    offerLine: input.offerLine ?? null,
    fieldLines: input.fieldLines ?? [],
    cartLines: input.cart ?? [],
    totalLine: input.totalLine ?? null,
    businessUrl: `${env.PUBLIC_APP_URL}/business/${input.businessId}`,
  };
  const text = renderTemplate(body, ctx);
  const link = buildWaLink(target.e164, text);
  return { target, text: link.text, url: link.url, truncated: link.truncated, templateId: template?.id ?? null } as const;
}

export async function recordLead(input: {
  businessId: string; itemId: string | null; visitorId: string | null; message: string; numberId: string | null; source: string;
}) {
  const db = getDb();
  if (input.itemId) {
    const [recent] = await db.select({ id: inquiries.id }).from(inquiries)
      .where(and(
        eq(inquiries.itemId, input.itemId),
        input.visitorId ? eq(inquiries.visitorId, input.visitorId) : sql`true`,
        sql`${inquiries.createdAt} > now() - interval '10 minutes'`,
      )).limit(1);
    if (recent) return recent.id;
  }
  const [row] = await db.insert(inquiries).values({
    id: uuidv7(), businessId: input.businessId, itemId: input.itemId, visitorId: input.visitorId,
    message: input.message, source: input.source, whatsappNumberId: input.numberId,
  }).returning({ id: inquiries.id });
  return row!.id;
}

/**
 * Storefront-level "message this store" link. Returned as a /w/:code URL rather than a raw
 * wa.me URL so the click is still counted (BUILD_PLAN 8.3).
 */
export async function generalEnquiryLink(businessId: string, opts: { slug: string; name: string }): Promise<string | null> {
  const db = getDb();
  const [num] = await db.select().from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.businessId, businessId), eq(whatsappNumbers.isActive, true)))
    .orderBy(sql`${whatsappNumbers.isDefault} desc`).limit(1);
  if (!num) return null;
  const text = renderTemplate(DEFAULT_TEMPLATES.general_enquiry!, {
    businessName: opts.name,
    itemName: `${opts.name} on Cybershop`,
    itemUrl: `${env.PUBLIC_APP_URL}/business/${opts.slug}`,
  });
  const [row] = await db.insert(waLinks).values({
    id: uuidv7(), code: shortCode(8), businessId, whatsappNumberId: num.id,
    messageSnapshot: text, targetUrl: buildWaLink(num.e164, text).url,
    expiresAt: new Date(Date.now() + 30 * 864e5),
  }).returning({ code: waLinks.code });
  return `/w/${row!.code}`;
}

export function fieldLinesFrom(defs: FieldDef[], values: Record<string, unknown>) {
  const bag: Record<string, { value: unknown; def: FieldDef }> = {};
  for (const d of defs) if (values[d.key] !== undefined && values[d.key] !== null) bag[d.key] = { value: values[d.key], def: d };
  return messageLines(defs, bag);
}

export function summarize(text: string, max = 90) {
  return truncate(text.replace(/\n+/g, " \u00b7 "), max);
}

