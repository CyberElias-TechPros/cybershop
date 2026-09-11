import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { businesses, businessTypes, catalogueItems, catalogueTypes, itemMedia, media } from "@/db/schema";
import { getDb } from "@/db/client";
import { PUBLIC_BIZ, LIVE_ITEM } from "@/db/read";
import { Badge, Button, Money } from "@/ui/kit";
import { env } from "@/lib/env";

export const revalidate = 300;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const db = getDb();

  const [types, featured, businesses_, latest] = await Promise.all([
    db.select({ id: businessTypes.id, key: businessTypes.key, name: businessTypes.name, icon: businessTypes.icon, count: sql<number>`0` })
      .from(businessTypes).where(eq(businessTypes.isActive, true)).orderBy(sql`sort_order`),
    db.select({ item: catalogueItems, biz: businesses, type: catalogueTypes })
      .from(catalogueItems)
      .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
      .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
      .where(and(LIVE_ITEM, PUBLIC_BIZ, eq(catalogueItems.isFeatured, true)))
      .orderBy(desc(catalogueItems.publishedAt)).limit(6),
    q
      ? db.select().from(businesses).where(and(PUBLIC_BIZ, sql`lower(${businesses.name}) like ${`%${q.toLowerCase()}%`}`)).orderBy(desc(businesses.updatedAt)).limit(12)
      : db.select().from(businesses).where(PUBLIC_BIZ).orderBy(desc(businesses.updatedAt)).limit(6),
    db.select({ item: catalogueItems, biz: businesses, type: catalogueTypes })
      .from(catalogueItems)
      .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
      .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
      .where(and(LIVE_ITEM, PUBLIC_BIZ))
      .orderBy(desc(catalogueItems.publishedAt)).limit(q ? 18 : 8),
  ]);

  const ids = latest.map((r) => r.item.id);
  const heroRows = ids.length
    ? await db.select({ itemId: itemMedia.itemId, url: media.publicUrl, alt: media.altText })
        .from(itemMedia)
        .innerJoin(media, eq(media.id, itemMedia.mediaId))
        .where(and(inArray(itemMedia.itemId, ids), eq(itemMedia.role, "hero")))
    : [];
  const heroByItem = new Map(heroRows.map((h) => [h.itemId, h]));

  return (
    <div>
      <section className="hero-grad border-b border-[var(--color-line)]">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <p className="text-sm font-semibold text-[var(--color-brand)]">No checkout. No monthly app. Just WhatsApp.</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Find a business. Talk to them directly.
          </h1>
          <p className="mt-3 max-w-xl text-[var(--color-ink-soft)] md:text-lg">
            Shops, academies, salons and services publish their catalogue here. When you like something, one tap opens WhatsApp with the details already written out.
          </p>
          <form className="mt-6 flex max-w-xl gap-2" role="search" action="/">
            <input className="input" name="q" defaultValue={q ?? ""} placeholder="Search products, courses, services, businesses..." aria-label="Search Cybershop" />
            <Button type="submit">Search</Button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            {types.map((t: { key: string; name: string }) => (
              <Link key={t.key} href={`/discover?type=${t.key}`} className="rounded-full border border-[var(--color-line-strong)] bg-white px-3 py-1.5 text-sm hover:border-[var(--color-ink)]">
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">{q ? `Matching "${q}"` : "Fresh from the catalogue"}</h2>
        {latest.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--color-line-strong)] bg-white p-6 text-sm text-[var(--color-ink-soft)]">
            Nothing published yet. <Link className="link" href="/signup">Open the first store</Link>.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {latest.map(({ item, biz, type }) => {
              const img = heroByItem.get(item.id) as { url: string } | undefined;
              return (
                <li key={item.id} className="card overflow-hidden transition hover:shadow-[var(--shadow-pop)]">
                  <Link href={`/business/${biz.slug}/${type.key}/${item.slug}`} className="block">
                    <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--color-line)]">
                      {img?.url ? <img src={img.url} alt={item.name} width={400} height={300} className="size-full object-cover" /> : null}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
                      <p className="mt-1 text-sm"><Money value={item.priceType === "on_request" ? null : item.price} currency={item.currency} /></p>
                      <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{biz.name}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {featured.length > 0 && !q ? (
        <section className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Featured this week</h2>
            <Badge tone="info">paid placement</Badge>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {featured.map(({ item, biz, type }) => (
              <li key={item.id} className="card card-pad">
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-faint)]">{type.itemNoun} · {biz.name}</p>
                <p className="mt-1 font-semibold">{item.name}</p>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)] line-clamp-2">{item.summary}</p>
                <div className="mt-3"><Button size="sm" variant="secondary" href={`/business/${biz.slug}/${type.key}/${item.slug}`}>View</Button></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">Businesses on Cybershop</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {businesses_.map((b: typeof businesses.$inferSelect) => (
            <li key={b.id} className="card card-pad flex items-start gap-3">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--color-ink)] font-semibold text-white">{b.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {b.name} {b.isVerified ? <Badge tone="ok">Verified</Badge> : null}
                </p>
                <p className="truncate text-sm text-[var(--color-ink-soft)]">{b.tagline}</p>
                <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{b.city}, {b.country}</p>
              </div>
              <Button className="ml-auto" size="sm" variant="secondary" href={`/business/${b.slug}`}>Visit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="card card-pad flex flex-col items-start gap-4 bg-[var(--color-ink)] text-white md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-semibold">Do you sell anything on WhatsApp already?</h2>
            <p className="mt-1 max-w-prose text-sm text-white/75">
              Put your catalogue in one link. Keep closing sales the way you do now - we just write the message for you. Free plan: 10 items, 1 number.
            </p>
          </div>
          <div className="flex gap-2 md:ml-auto">
            <Button variant="wa" size="lg" href={`${env.PUBLIC_APP_URL}/signup`}>Open your store</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
