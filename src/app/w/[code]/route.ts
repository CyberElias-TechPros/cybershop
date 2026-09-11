import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { waLinks } from "@/db/schema";
import { getDb } from "@/db/client";
import { recordLead } from "@/core/wa-actions";

export const dynamic = "force-dynamic";

/**
 * GET /w/:code -> record the enquiry, then 302 to wa.me (BUILD_PLAN 8.3).
 * This single endpoint is why click analytics exist at all: a raw external link
 * gives us no signal, and this one also keeps old shared QR codes working after a
 * vendor changes their number (the stored target is re-resolved).
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const [link] = await db.select().from(waLinks).where(and(eq(waLinks.code, code), gt(waLinks.expiresAt, new Date()))).limit(1);
  if (!link) {
    // A stale QR must not dead-end a buyer.
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  const ua = req.headers.get("user-agent") ?? "";
  const device = /android|iphone|ipad|mobile/i.test(ua) ? "mobile" : "desktop";
  const openedApp = /WhatsApp/i.test(ua) || req.url.includes("opened=app");

  await db.update(waLinks).set({ hitCount: sql`${waLinks.hitCount} + 1` }).where(eq(waLinks.id, link.id)).catch(() => undefined);

  await recordLead({
    businessId: link.businessId, itemId: link.itemId, visitorId: null,
    message: link.messageSnapshot, numberId: link.whatsappNumberId, source: "short_link",
  }).catch(() => undefined);

  const { analyticsEvents } = await import("@/db/schema");
  await getDb().insert(analyticsEvents).values({
    businessId: link.businessId, itemId: link.itemId, kind: openedApp ? "wa_app_opened" : "cta_click",
    device, country: req.headers.get("x-vercel-ip-country"), referrer: req.headers.get("referer")?.slice(0, 200) ?? null,
  }).catch(() => undefined);

  return NextResponse.redirect(link.targetUrl, { status: 302, headers: { "x-request-id": code } });
}
