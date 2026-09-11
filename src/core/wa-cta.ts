'use server';

/**
 * The single mutation on the public conversion path (BUILD_PLAN 8.3): record the lead,
 * stamp the click, then redirect to wa.me. Kept in its own module because a "use server"
 * file may only export async functions - composeEnquiry/recordLead stay pure server code.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { catalogueItems, waLinks } from "@/db/schema";
import { getDb } from "@/db/client";
import { uuidv7, shortCode } from "@/lib/util";
import { composeEnquiry, recordLead, type EnquiryInput } from "@/core/wa-actions";

export async function enquireAction(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) throw new Error("missing business");
  const num = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : dflt;
  };
  const input: EnquiryInput = {
    businessId,
    businessName: String(formData.get("businessName") ?? "the business"),
    itemId: (formData.get("itemId") as string) || null,
    itemName: (formData.get("itemName") as string) || null,
    price: (formData.get("price") as string) || null,
    currency: (formData.get("currency") as string) || "NGN",
    sku: (formData.get("sku") as string) || null,
    quantity: num(formData.get("quantity"), 1, 999, 1),
    variantLabel: (formData.get("variantLabel") as string) || null,
    offerLine: (formData.get("offerLine") as string) || null,
    fieldLines: String(formData.get("fieldLines") ?? "").split("\u001f").filter(Boolean),
    imageUrl: (formData.get("imageUrl") as string) || null,
    pagePath: (formData.get("pagePath") as string) || null,
    kind: (formData.get("kind") as string) || undefined,
    visitorId: (formData.get("visitorId") as string) || null,
  };

  const composed = await composeEnquiry(input);
  if ("error" in composed) {
    // No number configured: keep the buyer on the page rather than dead-ending them.
    redirect(`/business/${encodeURIComponent(input.businessName)}`);
  }

  const db = getDb();
  const [link] = await db.insert(waLinks).values({
    id: uuidv7(), code: shortCode(8), businessId, itemId: input.itemId,
    whatsappNumberId: composed.target.id, templateId: composed.templateId,
    messageSnapshot: composed.text, targetUrl: composed.url,
    expiresAt: new Date(Date.now() + 30 * 864e5),
  }).returning({ code: waLinks.code });

  await recordLead({
    businessId, itemId: input.itemId ?? null, visitorId: input.visitorId ?? null,
    message: composed.text, numberId: composed.target.id,
    source: input.itemId ? "item_page" : "storefront",
  });

  if (input.itemId) {
    await db.update(catalogueItems).set({ clickCount: sql`${catalogueItems.clickCount} + 1` }).where(eq(catalogueItems.id, input.itemId));
  }
  revalidatePath("/dashboard/leads");

  redirect(composed.url);
}
