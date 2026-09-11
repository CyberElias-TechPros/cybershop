import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auditLogs, businesses, catalogueItems, payments, users } from "@/db/schema";
import { getDb } from "@/db/client";
import { Badge, Card, Stat, StatusPill } from "@/ui/kit";
import { formatMoney } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const db = getDb();
  const [biz, items, pending, verified, recent, activity] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      pending: sql<number>`count(*) filter (where status in ('pending_payment','payment_submitted','under_review'))::int`,
      suspended: sql<number>`count(*) filter (where status = 'suspended')::int`,
      verified: sql<number>`count(*) filter (where is_verified)::int`,
    }).from(businesses).where(isNull(businesses.deletedAt)),
    db.select({
      n: sql<number>`count(*)::int`,
      live: sql<number>`count(*) filter (where status = 'published')::int`,
    }).from(catalogueItems).where(isNull(catalogueItems.deletedAt)),
    db.select({ id: payments.id, amount: payments.amountMinor, biz: businesses.name, method: payments.method, at: payments.submittedAt })
      .from(payments).innerJoin(businesses, eq(businesses.id, payments.businessId))
      .where(eq(payments.status, "pending")).orderBy(desc(payments.submittedAt)).limit(8),
    db.select({ n: sql<number>`coalesce(sum(amount_minor),0)::bigint` }).from(payments).where(eq(payments.status, "verified")),
    db.select({ id: businesses.id, name: businesses.name, status: businesses.status, city: businesses.city, createdAt: businesses.createdAt })
      .from(businesses).where(isNull(businesses.deletedAt)).orderBy(desc(businesses.createdAt)).limit(8),
    db.select({ action: auditLogs.action, actor: users.name, at: auditLogs.createdAt })
      .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.id)).limit(10),
  ]);

  const b = biz[0] ?? { total: 0, active: 0, pending: 0, suspended: 0, verified: 0 };

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Platform overview</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Everything below is real data from this install. Nothing here is a sales number - we never see the money between a vendor and their buyer.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Businesses" value={Number(b.total)} sub={`${Number(b.active)} active · ${Number(b.suspended)} suspended`} />
        <Stat label="Verified" value={Number(b.verified)} sub="admin-granted badge" />
        <Stat label="Catalogue items" value={Number(items[0]?.n ?? 0)} sub={`${Number(items[0]?.live ?? 0)} published`} />
        <Stat label="Platform revenue" value={formatMoney(String(Number(verified[0]?.n ?? 0) / 100), "NGN")} sub="verified payments only" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Payment review queue</h2>
            {Number(b.pending) > 0 ? <Badge tone="warn">{pending.length} pending</Badge> : <Badge tone="ok">clear</Badge>}
            <Link className="link ml-auto text-sm" href="/admin/payments">Open queue</Link>
          </div>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Nothing waiting. Manual transfer proofs appear here for approve/reject; card payments auto-verify via webhook (Phase 2).</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
              {pending.map((p: { id: string; amount: number; biz: string; method: string; at: Date }) => (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{p.biz}</span>
                  <span className="tabular-nums">{formatMoney(String(p.amount / 100), "NGN")}</span>
                  <Badge tone="mute">{p.method.replaceAll("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Newest businesses</h2>
            <Link className="link ml-auto text-sm" href="/admin/businesses">All businesses</Link>
          </div>
          <ul className="mt-2 divide-y divide-[var(--color-line)] text-sm">
            {recent.map((r: { id: string; name: string; status: string; city: string | null; createdAt: Date }) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-xs text-[var(--color-ink-faint)]">{r.city ?? "-"}</span>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="card-pad">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Recent admin activity</h2>
          <Link className="link ml-auto text-sm" href="/admin/audit">Full audit log</Link>
        </div>
        <ul className="mt-2 grid gap-1 text-sm">
          {activity.map((a: { action: string; actor: string | null; at: Date }, i: number) => (
            <li key={i} className="flex items-center gap-2">
              <code className="rounded bg-[var(--color-paper)] px-1.5 py-0.5 text-[.75rem]">{a.action}</code>
              <span className="text-[var(--color-ink-soft)]">{a.actor ?? "system"}</span>
              <span className="ml-auto text-xs text-[var(--color-ink-faint)]">{new Intl.DateTimeFormat("en-NG", { dateStyle: "short", timeStyle: "short" }).format(new Date(a.at))}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
