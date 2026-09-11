import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { itemMedia, media as mediaTable } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { deleteMediaAction } from "../actions";
import { formatBytes, measure } from "@/core/quotas";
import { Button, Card, EmptyState, Meter } from "@/ui/kit";
import { Uploader } from "./uploader";

export const dynamic = "force-dynamic";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ tab?: string; business?: string }> }) {
  const { tab = "all", business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/media");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "media.view");
  const db = getDb();

  const conds = [eq(mediaTable.businessId, membership.businessId), isNull(mediaTable.deletedAt), eq(mediaTable.visibility, "public")];
  if (tab === "unused") conds.push(sql`${itemMedia.mediaId} is null`);
  const rows = await db.select({ m: mediaTable, usedBy: sql<number>`count(im.item_id)::int` })
    .from(mediaTable)
    .leftJoin(itemMedia, eq(itemMedia.mediaId, mediaTable.id))
    .where(and(...conds))
    .groupBy(mediaTable.id)
    .orderBy(desc(mediaTable.createdAt))
    .limit(60);

  const used = await measure(membership.businessId, "media_bytes");
  const cap = 500 * 1024 * 1024;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Photos</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Images are compressed and stored on our media host, then served straight to buyers and WhatsApp.</p>
        </div>
        <div className="ml-auto w-full max-w-[220px]">
          <Meter pct={Math.round((used / cap) * 100)} value={`${formatBytes(used)} of ${formatBytes(cap)}`} label="Storage used" />
        </div>
      </header>

      <Uploader businessId={membership.businessId} />

      <div className="flex gap-1.5">
        <a href="/dashboard/media" className={tab === "all" ? "chip font-semibold" : "chip"}>All</a>
        <a href="/dashboard/media?tab=unused" className={tab === "unused" ? "chip font-semibold" : "chip"}>Not attached to an item</a>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No photos yet" body="Upload from your phone - we resize them for you so they load fast on any network." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map(({ m, usedBy }: { m: typeof mediaTable.$inferSelect; usedBy: number }) => (
            <li key={m.id} className="card overflow-hidden">
              <div className="aspect-square bg-[var(--color-line)]">
                {m.publicUrl ? <img src={m.publicUrl} alt={m.altText ?? m.originalName} width={240} height={240} loading="lazy" className="size-full object-cover" /> : null}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium">{m.originalName}</p>
                <p className="text-[.6875rem] text-[var(--color-ink-faint)]">
                  {formatBytes(m.byteSize)}{m.width ? ` \u00b7 ${m.width}\u00d7${m.height}` : ""}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {Number(usedBy) > 0 ? <span className="text-[.6875rem] text-[var(--color-ok)]">on {usedBy} item{usedBy === 1 ? "" : "s"}</span> : <span className="text-[.6875rem] text-[var(--color-warn)]">unused</span>}
                  <form action={deleteMediaAction} className="ml-auto">
                    <input type="hidden" name="businessId" value={membership.businessId} />
                    <input type="hidden" name="id" value={m.id} />
                    <Button size="sm" variant="ghost" type="submit">Delete</Button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--color-ink-faint)]">Photos uploaded but never used are removed automatically after 7 days.</p>
    </div>
  );
}
