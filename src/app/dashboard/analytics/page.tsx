import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { analyticsEvents, catalogueItems } from "@/db/schema";
import { getDb } from "@/db/client";
import { getSessionUser, requireMembership } from "@/core/auth";
import { Badge, Card, EmptyState, Money, Stat } from "@/ui/kit";

export const dynamic = "force-dynamic";

const RANGES = { today: 0, "7": 7, "30": 30, "90": 90 } as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; business?: string }> }) {
  const { range = "7", business } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/analytics");
  const membership = business ? user.memberships.find((m) => m.businessId === business) ?? user.memberships[0]! : user.memberships[0]!;
  await requireMembership(membership.businessId, "analytics.view");
  const db = getDb();

  const days = RANGES[range as keyof typeof RANGES] ?? 7;
  const since = days === 0 ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date(Date.now() - days * 864e5);

  const [totals, perItem, byDay] = await Promise.all([
    db.select({
      views: sql<number>`count(*) filter (where kind = 'item_view')::int`,
      clicks: sql<number>`count(*) filter (where kind = 'cta_click')::int`,
      impressions: sql<number>`count(*) filter (where kind = 'item_impression')::int`,
    }).from(analyticsEvents).where(and(eq(analyticsEvents.businessId, membership.businessId), gte(analyticsEvents.createdAt, since))),
    db.select({ id: catalogueItems.id, name: catalogueItems.name, slug: catalogueItems.slug, price: catalogueItems.price, typeKey: sql<string>`ct.key` })
      .from(catalogueItems)
      .innerJoin(sql`catalogue_types ct`, sql`ct.id = ${catalogueItems.catalogueTypeId}`)
      .where(and(eq(catalogueItems.businessId, membership.businessId), isNull(catalogueItems.deletedAt)))
      .orderBy(desc(sql`${catalogueItems.clickCount}`)).limit(10),
    db.select({ day: sql<string>`to_char(ts, 'MM-DD')`, views: sql<number>`count(*) filter (where kind='item_view')::int`, clicks: sql<number>`count(*) filter (where kind='cta_click')::int` })
      .from(analyticsEvents).where(and(eq(analyticsEvents.businessId, membership.businessId), gte(analyticsEvents.createdAt, since)))
      .groupBy(sql`to_char(ts, 'MM-DD')`).orderBy(sql`to_char(ts, 'MM-DD')`),
  ]);

  const views = Number(totals[0]?.views ?? 0);
  const clicks = Number(totals[0]?.clicks ?? 0);
  const ctr = views ? Math.round((clicks / views) * 100) : 0;
  const max = Math.max(1, ...byDay.map((d: { views: number }) => Number(d.views)));

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Engagement on Cybershop - what people looked at and tapped. Sales happen in your chat, so we never claim a revenue number.</p>
        </div>
        <nav className="ml-auto flex gap-1.5" aria-label="Date range">
          {(["today", "7", "30", "90"] as const).map((r) => (
            <a key={r} href={`/dashboard/analytics?range=${r}`} className={r === range ? "chip font-semibold" : "chip"}>
              {r === "today" ? "Today" : `${r} days`}
            </a>
          ))}
        </nav>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Views" value={views} sub={days === 0 ? "today" : `last ${days} days`} />
        <Stat label="WhatsApp clicks" value={clicks} sub="taps on the green button" />
        <Stat label="View to chat rate" value={`${ctr}%`} sub="how many viewers contacted you" />
      </section>

      <Card className="card-pad">
        <p className="text-sm font-semibold">Daily</p>
        {byDay.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">No traffic in this window yet. Share your store link on your status, flyers or Instagram bio.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {byDay.map((d: { day: string; views: number; clicks: number }) => (
              <li key={d.day} className="grid grid-cols-[60px_minmax(0,1fr)_90px] items-center gap-2 text-xs">
                <span className="text-[var(--color-ink-faint)]">{d.day}</span>
                <span className="flex h-4 items-center gap-1">
                  <span className="h-2.5 rounded bg-[var(--color-brand)]" style={{ width: `${(Number(d.views) / max) * 100}%`, minWidth: Number(d.views) ? 3 : 0 }} />
                  <span className="h-2.5 rounded bg-[var(--color-wa)]" style={{ width: `${(Number(d.clicks) / max) * 100}%`, minWidth: Number(d.clicks) ? 3 : 0 }} />
                </span>
                <span className="text-right tabular-nums text-[var(--color-ink-soft)]">{d.views} views / {d.clicks} taps</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex gap-3 text-[.6875rem] text-[var(--color-ink-faint)]">
          <span className="flex items-center gap-1"><i className="inline-block size-2 rounded bg-[var(--color-brand)]" />views</span>
          <span className="flex items-center gap-1"><i className="inline-block size-2 rounded bg-[var(--color-wa)]" />WhatsApp clicks</span>
        </p>
      </Card>

      <Card className="card-pad">
        <p className="text-sm font-semibold">Your most viewed items</p>
        {perItem.length === 0 ? (
          <EmptyState title="Nothing published yet" body="Add an item and it starts collecting views immediately." />
        ) : (
          <ul className="mt-2 divide-y divide-[var(--color-line)]">
            {perItem.map((r: { id: string; name: string; slug: string; typeKey: string; price: string | null }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <Money value={r.price} />
                <Badge tone="mute">{r.typeKey}</Badge>
                <a className="link" href={`/business/${membership.slug}/${r.typeKey}/${r.slug}`}>view</a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
          Raw events are kept for 90 days; older history is summarised daily so this page stays fast.
        </p>
      </Card>
    </div>
  );
}
