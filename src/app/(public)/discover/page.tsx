import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { businesses, catalogueItems, catalogueTypes, fieldDefinitions } from "@/db/schema";
import { getDb } from "@/db/client";
import { LIVE_ITEM, PUBLIC_BIZ } from "@/db/read";
import { Badge, Button, Card, EmptyState, Money } from "@/ui/kit";

export const metadata: Metadata = {
  title: "Discover",
  description: "Search catalogues from shops, academies, salons and services across Nigeria.",
  alternates: { canonical: "/discover" },
};
export const revalidate = 60;

/**
 * Discovery with filters that cross into the EAV store (BUILD_PLAN 5.2 / 6.2).
 * A filter is a join on one known field_definition_id hitting a typed projection,
 * never a scan of every item's JSON blob.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const city = typeof sp.city === "string" ? sp.city : "";
  const priceMax = typeof sp.price_max === "string" ? sp.price_max : "";
  const filterKey = typeof sp.filter === "string" ? sp.filter : "";
  const filterVal = typeof sp.fval === "string" ? sp.fval : "";

  const db = getDb();
  const conds: SQL[] = [LIVE_ITEM, PUBLIC_BIZ];
  if (q) {
    const p = `%${q.toLowerCase()}%`;
    conds.push(or(
      like(sql`lower(${catalogueItems.name})`, p),
      like(sql`lower(${catalogueItems.summary})`, p),
      like(sql`lower(${catalogueItems.search})`, p),
    )!);
  }
  if (type) conds.push(eq(catalogueTypes.key, type));
  if (city) conds.push(sql`lower(${businesses.city}) = lower(${city})`);
  if (priceMax && Number.isFinite(Number(priceMax))) conds.push(sql`${catalogueItems.price} <= ${Number(priceMax)}`);

  const defs: Array<{ id: string; key: string; label: string }> = filterKey && type
    ? await db.select({ id: fieldDefinitions.id, key: fieldDefinitions.key, label: fieldDefinitions.label })
        .from(fieldDefinitions)
        .innerJoin(catalogueTypes, eq(catalogueTypes.id, fieldDefinitions.catalogueTypeId))
        .where(and(eq(catalogueTypes.key, type), eq(fieldDefinitions.key, filterKey), eq(fieldDefinitions.isFilterable, true)))
        .limit(1)
    : [];
  if (defs[0] && filterVal) {
    conds.push(sql`exists (select 1 from item_field_values ifv where ifv.item_id = ${catalogueItems.id} and ifv.field_definition_id = ${defs[0].id} and (ifv.value_json = ${JSON.stringify(filterVal)}::jsonb or ifv.value_text = ${filterVal}))`);
  }

  const [rows, types, cities, activeTypeDefs] = await Promise.all([
    db.select({
      item: catalogueItems, type: catalogueTypes,
      biz: { id: businesses.id, slug: businesses.slug, name: businesses.name, city: businesses.city },
      heroUrl: sql<string | null>`(select m.public_url from item_media im join media m on m.id = im.media_id where im.item_id = ${catalogueItems.id} order by im.sort_order limit 1)`,
    }).from(catalogueItems)
      .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
      .innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
      .where(and(...conds))
      .orderBy(desc(catalogueItems.publishedAt))
      .limit(48),
    db.select({ id: catalogueTypes.id, key: catalogueTypes.key, name: catalogueTypes.name, itemNounPlural: catalogueTypes.itemNounPlural, count: sql<number>`count(*)::int` })
      .from(catalogueItems).innerJoin(catalogueTypes, eq(catalogueTypes.id, catalogueItems.catalogueTypeId))
      .where(LIVE_ITEM).groupBy(catalogueTypes.id).orderBy(desc(sql`count(*)`)),
    db.select({ city: businesses.city, n: sql<number>`count(*)::int` })
      .from(catalogueItems)
      .innerJoin(businesses, eq(businesses.id, catalogueItems.businessId))
      .where(and(LIVE_ITEM, PUBLIC_BIZ)).groupBy(businesses.city).orderBy(desc(sql`count(*)`)).limit(8),
    type
      ? db.select({ id: fieldDefinitions.id, key: fieldDefinitions.key, label: fieldDefinitions.label, type: fieldDefinitions.type })
          .from(fieldDefinitions)
          .innerJoin(catalogueTypes, eq(catalogueTypes.id, fieldDefinitions.catalogueTypeId))
          .where(and(eq(catalogueTypes.key, type), eq(fieldDefinitions.isFilterable, true), isNull(fieldDefinitions.deprecatedAt)))
          .orderBy(fieldDefinitions.sortOrder)
      : Promise.resolve([] as Array<{ id: string; key: string; label: string; type: string }>),
  ]);

  const optionsFor = async (defId: string) => {
    const { fieldOptions } = await import("@/db/schema");
    return db.select().from(fieldOptions).where(eq(fieldOptions.fieldDefinitionId, defId)).orderBy(fieldOptions.sortOrder);
  };
  const selectedDef = defs[0] ?? null;
  const selectedOptions = selectedDef ? await optionsFor(selectedDef.id) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Discover</h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">
          Everything below is published by the business itself. Tap an item to see it, then message them on WhatsApp to agree price and delivery.
        </p>
      </header>

      <form className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_140px_140px_auto]" role="search">
        <input className="input" name="q" defaultValue={q} placeholder="Search products, courses, services..." aria-label="Search all catalogues" />
        <select className="select" name="type" defaultValue={type} aria-label="Catalogue type">
          <option value="">Any type</option>
          {types.map((t: { key: string; name: string }) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <select className="select" name="city" defaultValue={city} aria-label="City">
          <option value="">Any city</option>
          {cities.flatMap((c: { city: string | null; n: number }) => c.city ? [<option key={c.city} value={c.city}>{c.city} ({c.n})</option>] : [])}
        </select>
        <input className="input" name="price_max" defaultValue={priceMax} inputMode="numeric" placeholder="Max price" aria-label="Maximum price" />
        <Button type="submit">Search</Button>
      </form>

      <nav aria-label="Categories" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        <Link href="/discover" className={!type ? "chip font-semibold" : "chip"}>Everything</Link>
        {types.map((t: { key: string; itemNounPlural: string; count: number }) => (
          <Link key={t.key} href={`/discover?type=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={t.key === type ? "chip font-semibold" : "chip"}>
            {t.itemNounPlural} ({t.count})
          </Link>
        ))}
      </nav>

      {activeTypeDefs.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-ink-faint)]">Filter by {type} detail:</span>
          {activeTypeDefs.map((d) => (
            <span key={d.id} className="chip">
              {d.label}
              {filterKey === d.key ? <Badge tone="info">{filterVal || "on"}</Badge> : null}
              <Link href={`/discover?type=${type}&filter=${d.key}`} className="link text-xs">
                {filterKey === d.key ? "change" : "choose"}
              </Link>
            </span>
          ))}
          {filterKey ? <Link className="link text-xs" href={`/discover?type=${type}`}>clear</Link> : null}
        </div>
      ) : null}

      {selectedDef && !filterVal ? (
        <Card className="card-pad mt-3">
          <p className="text-sm font-semibold">Choose {selectedDef.label}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {selectedOptions.map((o: { value: string; label: string }) => (
              <li key={o.value}>
                <Link className="chip" href={`/discover?type=${type}&filter=${selectedDef.key}&fval=${encodeURIComponent(o.value)}`}>{o.label}</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="mt-4 text-sm text-[var(--color-ink-faint)]">{rows.length} result{rows.length === 1 ? "" : "s"}{q ? ` for “${q}”` : ""}</p>

      {rows.length === 0 ? (
        <EmptyState title="Nothing matches yet"
          body="Try removing a filter, or search something broader. Businesses add new items daily."
          action={<Button variant="secondary" href="/signup">Open a store instead</Button>} />
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {rows.map(({ item, type: t, biz, heroUrl }: { item: typeof catalogueItems.$inferSelect; type: typeof catalogueTypes.$inferSelect; biz: { slug: string; name: string; city: string | null }; heroUrl: string | null }) => (
            <li key={item.id} className="card overflow-hidden transition hover:shadow-[var(--shadow-pop)]">
              <Link href={`/business/${biz.slug}/${t.key}/${item.slug}`} className="block">
                <div className="aspect-[4/3] bg-[var(--color-line)]">
                  {heroUrl ? <img src={heroUrl} alt={item.name} width={400} height={300} loading="lazy" className="size-full object-cover" /> : null}
                </div>
                <div className="p-3">
                  <p className="text-[.6875rem] uppercase tracking-wide text-[var(--color-ink-faint)]">{t.itemNoun}</p>
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
                  <p className="mt-1 text-sm"><Money value={item.priceType === "on_request" ? null : item.price} currency={item.currency} /></p>
                  <p className="mt-1 truncate text-xs text-[var(--color-ink-faint)]">{biz.name}{biz.city ? ` · ${biz.city}` : ""}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
