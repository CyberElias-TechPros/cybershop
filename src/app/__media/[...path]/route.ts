import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { media } from "@/db/schema";
import { getDb } from "@/db/client";
import { readLocalMedia } from "@/core/media";
import { requireUser } from "@/core/auth";

/**
 * Dev-only static media serving for the `local` driver, and the private-file door:
 * public images are open, private ones (payment proofs) require an authorised user
 * and write an audit trail (invariant I6, plan.md 14).
 */
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", mp4: "video/mp4", pdf: "application/pdf",
};

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.map(decodeURIComponent).join("/");
  if (key.includes("..") || key.startsWith("/")) {
    return new NextResponse("bad key", { status: 400 });
  }

  const db = getDb();
  const [row] = await db.select().from(media).where(and(eq(media.storageKey, key), isNull(media.deletedAt))).limit(1);
  const isPrivate = row?.visibility === "private" || key.startsWith("private/");

  if (isPrivate) {
    try {
      const user = await requireUser();
      const privileged = user.platformRoles.length > 0;
      const mine = row?.businessId && user.memberships.some((m) => m.businessId === row.businessId);
      if (!privileged && !mine) return new NextResponse("forbidden", { status: 403 });
      if (!privileged) {
        const { audit } = await import("@/core/auth");
        await audit({ actorUserId: user.userId, action: "media.private_view", resource: "media", resourceId: row!.id, businessId: row!.businessId, req });
      }
    } catch {
      return new NextResponse("authentication required", { status: 401 });
    }
  }

  const buf = await readLocalMedia(key);
  if (!buf) return new NextResponse("not found", { status: 404 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
