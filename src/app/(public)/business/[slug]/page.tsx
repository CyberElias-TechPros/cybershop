import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { catalogueItems } from "@/db/schema";
import { getDb } from "@/db/client";
import {
  LIVE_ITEM, countItems, getBusinessBySlug, getCategoriesForBusiness, isIndexable, listItems,
} from "@/db/read";
import { Badge, Button, Card, EmptyState, Money } from "@/ui/kit";
import { truncate } from "@/lib/util";

export const revalidate = 120;

function itemPath(bizSlug: string, typeKey: string, itemSlug: string) {
  return `/business/${bizSlug}/${typeKey}/${itemSlug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) return {};
  const title = `${b.name}${b.tagline ? ` - ${b.tagline}` : ""}`;
  return {
    title,
    description: truncate(b.description ?? b.tagline ?? `${b.name} on Cybershop`, 155),
    alternates: { canonical: `/business/${b.slug}` },
    openGraph: {
      type: "website",
      title,
      description: truncate(b.description ?? "", 190),
      url: `/business/${b.slug}`,
      siteName: "Cybershop",
      images: b.logoMediaId ? [{ url: `/api/og/business/${b.slug}` }] : undefined,
    },
    robots: isIndexable(b) ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function StorefrontPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; type?: string }> }) {
  const { slug } = await params;
  const { q, type } = await searchParams;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const unavailable = business.status !== "active" || business.visibility === "private";
  const [{ total, published }, items, cats] = await Promise.all([
    countItems(business.id),
    listItems({ businessId: business.id, typeKey: type, limit: 48, search: q, sort: "recent" }),
    getCategoriesForBusiness(business.id),
  ]);
  const sections: string[] = Array.isArray((business.storefront as { sections?: string[] })?.sections)
    ? ((business.storefront as { sections: string[] }).sections) : ["hero", "catalogue", "about", "contact"];
  const accent = (business.storefront as { accent?: string })?.accent;
  const style = (business.storefront as { style?: string })?.style ?? "classic";

  return (
    <div>
      {unavailable ? (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card className="card-pad border-[#f0d9ab] bg-[#fdf7ea]">
            <h1 className="text-lg font-semibold">This store is temporarily unavailable</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {business.name} has paused their storefront or their plan lapsed. Nothing was deleted - the owner can reopen it any time from the dashboard.
            </p>
          </Card>
        </div>
      ) : null}

      <section className={style === "editorial" ? "border-b border-[var(--color-line)]" : "hero-grad border-b border-[var(--color-line)]"} style={accent ? { boxShadow: `inset 0 -3px 0 ${accent}` } : undefined}>
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="flex flex-wrap items-start gap-4">
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--color-ink)] text-lg font-bold text-white">
              {business.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">{business.name}</h1>
              <p className="mt-1 text-[var(--color-ink-soft)]">{business.tagline}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-faint)]">
                {business.city ? <span>{business.city}, {business.country}</span> : null}
                <span aria-hidden>·</span>
                <span>{published} {published === 1 ? "listing" : "listings"}</span>
                {business.isVerified ? <Badge tone="ok">Verified business</Badge> : null}
              </p>
            </div>
            <div className="ml-auto flex flex-col items-stretch gap-2">
              <ContactButton businessId={business.id} name={business.name} slug={business.slug} />
              {business.phone ? <a className="link text-center text-sm" href={`tel:${business.phone}`}>Call {business.phone}</a> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          {sections.includes("about") && business.description ? (
            <section aria-labelledby="about">
              <h2 id="about" className="text-lg font-semibold">About</h2>
              <p className="mt-2 max-w-prose text-[var(--color-ink-soft)]">{business.description}</p>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="catalogue">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="catalogue" className="text-lg font-semibold">Catalogue</h2>
              {type ? <Badge tone="info">filter: {type}</Badge> : null}
              <form className="ml-auto flex gap-2" role="search">
                <input className="input h-9 min-h-0 py-1 text-sm" name="q" defaultValue={q ?? ""} placeholder={`Search ${business.name}`} aria-label={`Search ${business.name}`} />
                <Button size="sm" type="submit">Search</Button>
              </form>
            </div>

            {cats.length > 1 ? (
              <nav aria-label="Store categories" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                <Link href={`/business/${business.slug}`} className="chip">All</Link>
                {cats.map((c) => (
                  <Link key={c.id} href={`/business/${business.slug}?q=${encodeURIComponent(c.name)}`} className="chip">{c.name} <span className="text-[var(--color-ink-faint)]">({c.count})</span></Link>
                ))}
              </nav>
            ) : null}

            {items.length === 0 ? (
              <div className="mt-4">
                <EmptyState title={total === 0 ? "No listings yet" : "Nothing matches that search"}
                  body={total === 0 ? "This business has not published anything. Message them directly to ask." : "Try a shorter word, or clear the filter."}
                  action={total === 0 ? <ContactButton businessId={business.id} name={business.name} slug={business.slug} label="Ask about availability" /> : <Button variant="secondary" href={`/business/${business.slug}`}>Clear</Button>} />
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {items.map((item) => (
                  <li key={item.id} className="card overflow-hidden transition hover:shadow-[var(--shadow-pop)]">
                    <Link href={itemPath(business.slug, item.typeKey, item.slug)} className="block">
                      <div className="relative aspect-[4/3] bg-[var(--color-line)]">
                        {item.heroUrl ? (
                          <img src={item.heroUrl} alt={item.name} width={400} height={300} loading="lazy" className="size-full object-cover" />
                        ) : null}
                        {item.isOutOfStock ? <span className="absolute left-2 top-2"><Badge tone="danger">Out of stock</Badge></span> : null}
                        {item.isFeatured ? <span className="absolute right-2 top-2"><Badge tone="info">Featured</Badge></span> : null}
                      </div>
                      <div className="p-3">
                        <p className="text-[.6875rem] uppercase tracking-wide text-[var(--color-ink-faint)]">{item.itemNoun}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
                        <p className="mt-1 text-sm"><Money value={item.priceType === "on_request" ? null : item.price} currency={item.currency} /></p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card className="card-pad">
            <p className="text-sm font-semibold">Contact</p>
            <dl className="mt-2 space-y-2 text-sm">
              <ContactRow label="WhatsApp" value={<ContactButton businessId={business.id} name={business.name} slug={business.slug} label="Message store" small />} />
              {business.phone ? <ContactRow label="Phone" value={business.phone} /> : null}
              {business.email ? <ContactRow label="Email" value={business.email} /> : null}
              {business.address ? <ContactRow label="Address" value={business.address} /> : null}
              {business.serviceArea ? <ContactRow label="Service area" value={business.serviceArea} /> : null}
            </dl>
          </Card>
          {business.openingHours ? (
            <Card className="card-pad">
              <p className="text-sm font-semibold">Opening hours</p>
              <dl className="mt-2 space-y-1 text-sm">
                {Object.entries(business.openingHours as Record<string, string>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="capitalize text-[var(--color-ink-faint)]">{k.replaceAll("_", " to ")}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </Card>
          ) : null}
          {business.faqs ? (
            <Card className="card-pad">
              <p className="text-sm font-semibold">Questions buyers ask</p>
              <ul className="mt-2 space-y-3 text-sm">
                {(business.faqs as Array<{ q: string; a: string }>).map((f) => (
                  <li key={f.q}><p className="font-medium">{f.q}</p><p className="mt-0.5 text-[var(--color-ink-soft)]">{f.a}</p></li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="card-pad">
            <p className="text-sm font-semibold">Share this store</p>
            <ShareRow url={`/business/${business.slug}`} title={business.name} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ContactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-[var(--color-ink-faint)]">{label}</dt><dd className="text-right">{value}</dd></div>;
}

/** server component: builds the deep link so a store-level enquiry is also tracked as a lead */
async function ContactButton({ businessId, slug, name, label = "Message on WhatsApp", small }: { businessId: string; slug: string; name: string; label?: string; small?: boolean }) {
  const { generalEnquiryLink } = await import("@/core/wa-actions");
  const href = await generalEnquiryLink(businessId, { slug, name });
  if (!href) return <span className="text-xs text-[var(--color-ink-faint)]">No WhatsApp number listed</span>;
  return <Button variant="wa" size={small ? "sm" : "md"} href={href} className={small ? "" : "min-w-[190px]"}>{label}</Button>;
}

function ShareRow({ url, title }: { url: string; title: string }) {
  const full = `${process.env.PUBLIC_APP_URL ?? ""}${url}`;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      <a className="chip" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${full}`)}`} rel="noopener noreferrer" target="_blank">WhatsApp</a>
      <a className="chip" href={`https://t.me/share/url?url=${encodeURIComponent(full)}`} rel="noopener noreferrer" target="_blank">Telegram</a>
      <a className="chip" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(full)}`} rel="noopener noreferrer" target="_blank">X</a>
      <a className="chip" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(full)}`}>Email</a>
    </div>
  );
}
