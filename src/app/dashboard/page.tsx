import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { analyticsEvents, businesses, catalogueItems, inquiries, subscriptions, plans, planQuotas } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/core/auth";
import { countItems } from "@/db/read";
import { formatBytes, measure } from "@/core/quotas";
import { Badge, Button, Card, EmptyState, Meter, Stat, StatusPill } from "@/ui/kit";

export const dynamic = "force-dynamic";

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  if (!membership) redirect("/signup");
  const id = membership.businessId;
  const db = getDb();

  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [{ total, published }, counts, leads, recent, biz, sub, mediaBytes] = await Promise.all([
    countItems(id),
    db.select({
      views: sql<number>`count(*) filter (where kind = 'item_view')::int`,
      clicks: sql<number>`count(*) filter (where kind = 'cta_click')::int`,
    }).from(analyticsEvents).where(and(eq(analyticsEvents.businessId, id), gte(analyticsEvents.createdAt, weekAgo))),
    db.select({ status: inquiries.status, n: sql<number>`count(*)::int` }).from(inquiries)
      .where(and(eq(inquiries.businessId, id), gte(inquiries.createdAt, weekAgo)))
      .groupBy(inquiries.status),
    db.select({ id: inquiries.id, item: catalogueItems.name, createdAt: inquiries.createdAt, status: inquiries.status })
      .from(inquiries)
      .leftJoin(catalogueItems, eq(catalogueItems.id, inquiries.itemId))
      .where(eq(inquiries.businessId, id)).orderBy(desc(inquiries.createdAt)).limit(5),
    db.select().from(businesses).where(eq(businesses.id, id)).limit(1),
    db.select({ status: subscriptions.status, end: subscriptions.currentPeriodEnd, plan: plans.name, quota: planQuotas.quotaLimit })
      .from(subscriptions).leftJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(planQuotas, and(eq(planQuotas.planId, plans.id), eq(planQuotas.resource, "catalogue_items")))
      .where(eq(subscriptions.businessId, id)).orderBy(desc(subscriptions.startedAt)).limit(1),
    measure(id, "media_bytes"),
  ]);

  const b = biz[0]!;
  const leadBy = Object.fromEntries(leads.map((l: { status: string; n: number }) => [l.status, Number(l.n)]));
  const newLeads = Number(leadBy.new ?? 0);
  const itemLimit = sub[0]?.quota ?? null;
  const itemPct = itemLimit ? Math.round((published / Number(itemLimit)) * 100) : null;
  const planBytes = 500 * 1024 * 1024;
  const setup = [
    { done: Boolean(b.logoMediaId) || b.name.length > 0, label: "Business profile", href: "/dashboard/settings" },
    { done: published > 0, label: `Add your first ${published ? "items" : "item"}`, href: "/dashboard/catalogue/new" },
    { done: true, label: "Confirm your WhatsApp number", href: "/dashboard/whatsapp" },
  ];
  const remaining = setup.filter((s) => !s.done).length;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good afternoon {"👋"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-soft)]">
            <span className="font-medium text-[var(--color-ink)]">{b.name}</span>
            <StatusPill status={b.status} />
            {b.isVerified ? <Badge tone="ok">Verified</Badge> : null}
            {b.visibilityPausedByVendor ? <Badge tone="warn">Paused by you</Badge> : null}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" href={`/business/${b.slug}`}>View my store</Button>
          <Button variant="wa" href="/dashboard/catalogue/new">+ Add item</Button>
        </div>
      </header>

      {remaining > 0 ? (
        <Card className="card-pad">
          <p className="text-sm font-semibold">Finish setting up ({setup.length - remaining}/{setup.length})</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
            {setup.map((s) => (
              <li key={s.label}>
                {s.done ? (
                  <span className="flex items-center gap-2 text-sm text-[var(--color-ink-faint)]"><span aria-hidden>{"✓"}</span>{s.label}</span>
                ) : (
                  <Link className="link flex items-center gap-2 text-sm" href={s.href}><span aria-hidden>{"○"}</span>{s.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section aria-label="This week" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Catalogue views" value={Number(counts[0]?.views ?? 0)} sub="last 7 days" />
        <Stat label="WhatsApp clicks" value={Number(counts[0]?.clicks ?? 0)} sub="last 7 days" />
        <Stat label="New enquiries" value={newLeads} sub={`${Object.values(leadBy).reduce((a: number, c: number) => a + Number(c), 0)} total this week`} />
        <Stat label="Live items" value={published} sub={`${total} in total`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Latest enquiries</h2>
            <Link className="link ml-auto text-sm" href="/dashboard/leads">See all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              No enquiries yet. Every time a buyer taps your green button it shows up here - even if they do not press send.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--color-line)]">
              {recent.map((l: { id: string; item: string | null; createdAt: Date; status: string }) => (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <StatusPill status={l.status} />
                  <span className="min-w-0 flex-1 truncate text-sm">{l.item ?? "General enquiry"}</span>
                  <span className="text-xs text-[var(--color-ink-faint)]">{new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(l.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-3">
          <Card className="card-pad">
            <p className="text-sm font-semibold">{sub[0]?.plan ?? "Free storefront"}</p>
            <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">
              {sub[0]?.status === "active" ? `Renews ${sub[0].end ? new Date(sub[0].end).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "-"}` : `Plan ${sub[0]?.status ?? "active"}`}
            </p>
            <div className="mt-3 grid gap-2.5">
              <Meter pct={itemPct} label="Items" value={itemLimit === null ? `${published} / unlimited` : `${published} / ${itemLimit}`} />
              <Meter pct={Math.round((mediaBytes / planBytes) * 100)} label="Media storage" value={`${formatBytes(mediaBytes)} / ${formatBytes(planBytes)}`} />
            </div>
            <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Extra numbers, storage and featured slots are paid add-ons.</p>
          </Card>
          <Card className="card-pad">
            <p className="text-sm font-semibold">Quick actions</p>
            <ul className="mt-2 grid gap-1.5 text-sm">
              <li><Link className="link" href="/dashboard/catalogue/new">{"＋"} Add item</Link></li>
              <li><Link className="link" href="/dashboard/media">{"\uD83D\uDCF8"} Manage photos</Link></li>
              <li><Link className="link" href="/dashboard/whatsapp">{"\uD83D\uDCAC"} WhatsApp numbers</Link></li>
              <li><Link className="link" href="/dashboard/storefront">{"\u2728"} Storefront style</Link></li>
              <li><Link className="link" href="/dashboard/analytics">{"\uD83D\uDCCA"} Analytics</Link></li>
            </ul>
          </Card>
        </div>
      </div>

      {published === 0 ? (
        <EmptyState title="Nothing is live yet"
          body="Add one item with a photo and a price. That is enough to start receiving WhatsApp enquiries - you can keep adding after."
          action={<Button variant="wa" href="/dashboard/catalogue/new">Add your first item</Button>} />
      ) : null}
    </div>
  );
}
