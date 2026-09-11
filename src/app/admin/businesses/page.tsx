import Link from "next/link";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { businesses, catalogueItems, users, whatsappNumbers } from "@/db/schema";
import { getDb } from "@/db/client";
import { reviewBusinessAction, verifyBusinessAction } from "../actions";
import { Badge, Button, Card, EmptyState, StatusPill } from "@/ui/kit";

export const dynamic = "force-dynamic";

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const db = getDb();
  const conds = [isNull(businesses.deletedAt)];
  if (q.trim()) conds.push(or(like(sql`lower(${businesses.name})`, `%${q.toLowerCase().trim()}%`), like(sql`lower(${businesses.slug})`, `%${q.toLowerCase().trim()}%`))!);
  if (status) conds.push(eq(businesses.status, status as never));

  const rows = await db.select({
    b: businesses,
    owner: users,
    items: sql<number>`(select count(*) from catalogue_items ci where ci.business_id = ${businesses.id} and ci.deleted_at is null)::int`,
    nums: sql<number>`(select count(*) from whatsapp_numbers wn where wn.business_id = ${businesses.id} and wn.is_active)::int`,
  }).from(businesses)
    .leftJoin(users, eq(users.id, businesses.ownerUserId))
    .where(and(...conds)).orderBy(desc(businesses.createdAt)).limit(80);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Businesses</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Approve, suspend and verify. Suspension always hides, never deletes.</p>
        </div>
        <form className="ml-auto flex gap-2" role="search">
          <input className="input h-9 min-h-0 py-1 text-sm" name="q" defaultValue={q} placeholder="Name or slug" aria-label="Search businesses" />
          <select className="select h-9 min-h-0 w-auto py-1 text-sm" name="status" defaultValue={status} aria-label="Filter by status">
            <option value="">Any status</option>
            {["active", "pending_payment", "under_review", "suspended", "expired", "rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button size="sm" type="submit">Search</Button>
        </form>
      </header>

      {rows.length === 0 ? <EmptyState title="No businesses match" body="Try clearing the search, or check the pending payments queue." /> : (
        <ul className="grid gap-3">
          {rows.map(({ b, owner, items, nums }) => (
            <li key={b.id}>
              <Card className="card-pad">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/business/${b.slug}`} className="font-semibold hover:underline">{b.name}</Link>
                  <code className="text-xs text-[var(--color-ink-faint)]">/{b.slug}</code>
                  <StatusPill status={b.status} />
                  {b.isVerified ? <Badge tone="ok">Verified</Badge> : null}
                  <span className="ml-auto text-xs text-[var(--color-ink-faint)]">{Number(items)} items · {Number(nums)} WhatsApp · {b.city ?? "no city"}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{b.tagline ?? b.description?.slice(0, 160) ?? "No description yet."}</p>
                <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                  Owner: {owner?.name ?? "?"} &lt;{owner?.email ?? "?"}&gt; · joined {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(b.createdAt))}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.status !== "active" ? (
                    <form action={reviewBusinessAction}>
                      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="active" />
                      <Button size="sm">Approve / reactivate</Button>
                    </form>
                  ) : null}
                  {b.status !== "suspended" ? (
                    <form action={reviewBusinessAction}>
                      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="suspended" />
                      <Button size="sm" variant="danger">Suspend</Button>
                    </form>
                  ) : null}
                  <form action={verifyBusinessAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button size="sm" variant="secondary">{b.isVerified ? "Remove verification" : "Mark verified"}</Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
