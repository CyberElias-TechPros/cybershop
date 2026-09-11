import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { catalogueItems, inquiries } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { updateLeadStatusAction } from "../actions";
import { Badge, Button, Card, EmptyState, StatusPill } from "@/ui/kit";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "interested", "negotiating", "converted", "lost"] as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; business?: string }> }) {
  const { status = "all", business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/leads");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "leads.edit");
  const db = getDb();

  const conds = [eq(inquiries.businessId, membership.businessId)];
  if (status !== "all") conds.push(eq(inquiries.status, status as never));

  const [rows, counts] = await Promise.all([
    db.select({ inq: inquiries, item: catalogueItems.name, itemSlug: catalogueItems.slug, typeKey: sql<string | null>`ct.key` })
      .from(inquiries)
      .leftJoin(catalogueItems, eq(catalogueItems.id, inquiries.itemId))
      .leftJoin(sql`catalogue_types ct`, sql`ct.id = ${catalogueItems.catalogueTypeId}`)
      .where(and(...conds)).orderBy(desc(inquiries.createdAt)).limit(100),
    db.select({ status: inquiries.status, n: sql<number>`count(*)::int` }).from(inquiries)
      .where(eq(inquiries.businessId, membership.businessId)).groupBy(inquiries.status),
  ]);
  const by = Object.fromEntries(counts.map((c: { status: string; n: number }) => [c.status, Number(c.n)]));
  const total = Object.values(by).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Enquiries</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Everyone who tapped your WhatsApp button. Mark what happened so you can follow up.</p>
        </div>
        <span className="ml-auto text-sm text-[var(--color-ink-faint)]">{total} total</span>
      </header>

      <nav aria-label="Filter by status" className="no-scrollbar flex gap-1.5 overflow-x-auto">
        <Link href="/dashboard/leads" className={status === "all" ? "chip font-semibold" : "chip"}>All {total ? `(${total})` : ""}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/dashboard/leads?status=${s}`} className={status === s ? "chip font-semibold" : "chip"}>
            {s[0]!.toUpperCase() + s.slice(1)} {by[s] ? `(${by[s]})` : ""}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={status === "all" ? "No enquiries yet" : `Nothing marked "${status}"`}
          body={status === "all" ? "When a buyer taps your green button, their enquiry lands here - even if they never press send in WhatsApp." : "Move enquiries along using the status buttons on each one."}
          action={<Button variant="secondary" href="/dashboard/catalogue">Add more items to get more enquiries</Button>} />
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ inq, item, itemSlug, typeKey }: { inq: typeof inquiries.$inferSelect; item: string | null; itemSlug: string | null; typeKey: string | null }) => (
            <li key={inq.id}>
              <Card className="card-pad">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={inq.status} />
                  <span className="font-medium">{item ?? "General enquiry"}</span>
                  {inq.contactName ? <span className="text-sm text-[var(--color-ink-soft)]">- {inq.contactName}</span> : null}
                  <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
                    {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(inq.createdAt))}
                  </span>
                </div>
                <pre className="mt-2 max-w-prose whitespace-pre-wrap font-sans text-sm text-[var(--color-ink-soft)]">{inq.message}</pre>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {STATUSES.filter((s) => s !== inq.status).map((s) => (
                    <form key={s} action={updateLeadStatusAction}>
                      <input type="hidden" name="businessId" value={membership.businessId} />
                      <input type="hidden" name="id" value={inq.id} />
                      <input type="hidden" name="status" value={s} />
                      <Button size="sm" variant="ghost" type="submit">Mark {s}</Button>
                    </form>
                  ))}
                  {item && typeKey && itemSlug ? (
                    <Link className="chip ml-auto" href={`/business/${membership.slug}/${typeKey}/${itemSlug}`}>View listing</Link>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--color-ink-faint)]">
        We record interest, not sales. Whether a buyer pays you happens in your chat, so "converted" is your own judgement call.
      </p>
    </div>
  );
}
