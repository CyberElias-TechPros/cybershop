import { NextResponse } from "next/server";
import { requireMembership } from "@/core/auth";
import { checkQuota } from "@/core/quotas";
import { PUBLIC_IMAGE_MIME, uploadViaDriver } from "@/core/media";
import { uuidv7, sha256 } from "@/lib/util";
import { media as mediaTable } from "@/db/schema";
import { getDb } from "@/db/client";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

/**
 * Metadata endpoint for uploads. The bytes themselves go browser -> media host
 * (BUILD_PLAN 7.2); this route only issues tickets, records rows, and in `local`
 * dev mode also accepts the body so the demo works with one origin.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business");
  if (!businessId) return NextResponse.json({ error: "missing business" }, { status: 400 });
  try {
    await requireMembership(businessId, "media.delete");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "forbidden" }, { status: e instanceof Error && e.message.includes("sign in") ? 401 : 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: "That file is too large. Pick an image under 8MB." }, { status: 413 });

  const quota = await checkQuota(businessId, "media_bytes", file.size);
  if (!quota.allowed) return NextResponse.json({ error: quota.message ?? "Storage is full." }, { status: 402 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadViaDriver({
    businessId, entityKind: "item_image", folder: "catalogue/products", originalName: file.name,
    bytes: file.size, declaredMime: file.type, visibility: "public", maxBytes: 8_000_000, allowedMime: PUBLIC_IMAGE_MIME,
  }, bytes);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

  const db = getDb();
  const checksum = sha256(bytes.toString("base64"));
  const [dup] = await db.select({ id: mediaTable.id, url: mediaTable.publicUrl }).from(mediaTable)
    .where(eq(mediaTable.checksum, checksum)).limit(1);
  if (dup) return NextResponse.json({ id: dup.id, url: dup.url, deduped: true });

  const id = uuidv7();
  await db.insert(mediaTable).values({
    id, businessId, entityKind: "item_image", storageKey: res.stored.storageKey, publicUrl: res.stored.publicUrl,
    originalName: file.name, mimeType: res.stored.mimeType, extension: res.stored.extension,
    byteSize: res.stored.byteSize, width: res.stored.width, height: res.stored.height, checksum,
    visibility: "public", status: "available", quotaCharged: true,
  });
  return NextResponse.json({ id, url: res.stored.publicUrl, bytes: res.stored.byteSize }, { status: 201 });
}
