import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { catalogueItems } from "@/db/schema";
import { getDb } from "@/db/client";
import { LIVE_ITEM, getBusinessBySlug, getItemBySlug, getWhatsappContext, isIndexable, trackView } from "@/db/read";
import { adapterFor, type FieldDef } from "@/core/fields";
import { listItems } from "@/db/read";
import { formatMoney, truncate } from "@/lib/util";
import { applyDiscount } from "@/lib/util";
import { Badge, Button, Card, Money } from "@/ui/kit";
import { EnquireForm } from "./enquire-form";

export const revalidate = 120;

function pathFor(slug: string, typeKey: string, itemSlug: string) {
  return `/business/${slug}/${typeKey}/${itemSlug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; typeKey: string; itemSlug: string }> }): Promise<Metadata> {
  const { slug, typeKey, itemSlug } = await params;
  const business = await getBusinessBySlug(slug);
  const found = business ? await getItemBySlug(slug, typeKey, itemSlug) : null;
  if (!business || !found) return { title: "Listing not found", robots: { index: false } };
  const { item, images } = found;

  const seo = (item.seo ?? {}) as { title?: string; description?: string };
  const title = seo.title || `${item.name} - ${business.name}`;
  const description = truncate(seo.description || item.summary || item.descriptionText || `${item.name} from ${business.name}. Ask about availability on WhatsApp.`, 155);
  const canonical = pathFor(business.slug, typeKey, item.slug);
  // og:image must be a direct, absolute, public HTTPS file URL for WhatsApp's crawler (BUILD_PLAN 15)
  const image = images.find((m: { url: string | null }) => m.url)?.url ?? null;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: "Cybershop",
      images: image ? [{ url: image, width: 1200, height: 900, alt: item.name }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
    robots: isIndexable(business) ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; typeKey: string; itemSlug: string }>;
}) {
  const { slug, typeKey, itemSlug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const found = await getItemBySlug(slug, typeKey, itemSlug);
  if (!found) notFound();

  const { item, type, images, values, defs, offer, variants } = found;
  if (item.status !== "published" && item.status !== "scheduled") notFound();

  const db = getDb();
  void trackView({ kind: "item_view", businessId: business.id, itemId: item.id });

  const wa = await getWhatsappContext(business.id);
  const bizNumber = wa.numbers.find((n) => n.isDefault && n.isActive) ?? wa.numbers.find((n) => n.isActive) ?? null;

  const publicDefs = defs.filter((d: FieldDef) => d.isPublic);
  const fieldLines = publicDefs
    .map((d: FieldDef) => adapterFor(d.type).toMessageLine((values as Map<string, unknown>).get(d.id) ?? null, d))
    .filter(Boolean) as string[];

  const effectivePrice = offer ? applyDiscount(item.price, offer.percentOff, offer.amountOff, offer.priceOverride) : null;
  const hero = images[0];
  const others = images.slice(1);
  const itemUrl = pathFor(business.slug, typeKey, item.slug);

  const jsonLd = buildJsonLd({ type: type.schemaKind, item, business, images, values, defs, offer, variants });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-ink-faint)]">
        <ol className="flex flex-wrap gap-1.5">
          <li><Link className="link" href="/">Cybershop</Link></li>
          <li aria-hidden>/</li>
          <li><Link className="link" href={`/business/${business.slug}`}>{business.name}</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page">{item.name}</li>
        </ol>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
        <div>
          <div className="card overflow-hidden">
            <div className="aspect-[4/3] w-full bg-[var(--color-line)]">
              {hero?.url ? <img src={hero.url} alt={hero.alt ?? item.name} width={1200} height={900} fetchPriority="high" className="size-full object-cover" /> : (
                <div className="grid size-full place-items-center text-sm text-[var(--color-ink-faint)]">No photo for this {type.itemNoun.toLowerCase()}</div>
              )}
            </div>
          </div>
          {others.length > 0 ? (
            <ul className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
              {others.map((m: { id: string; url: string | null; alt: string | null }) => (
                <li key={m.id} className="size-20 shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)]">
                  {m.url ? <img src={m.url} alt={m.alt ?? ""} width={80} height={80} loading="lazy" className="size-full object-cover" /> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {item.descriptionHtml ? (
            <section className="mt-8" aria-labelledby="desc">
              <h2 id="desc" className="text-lg font-semibold">Description</h2>
              <div className="prose-item mt-2 max-w-prose text-[var(--color-ink-soft)]" dangerouslySetInnerHTML={{ __html: item.descriptionHtml }} />
            </section>
          ) : null}

          {publicDefs.length > 0 ? (
            <section className="mt-8" aria-labelledby="details">
              <h2 id="details" className="text-lg font-semibold">Details</h2>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {publicDefs.map((d: FieldDef) => {
                  const v = (values as Map<string, unknown>).get(d.id);
                  const text = adapterFor(d.type).toText(v ?? null, d);
                  if (!text) return null;
                  return (
                    <div key={d.id} className="flex justify-between gap-4 border-b border-[var(--color-line)] py-1.5 text-sm">
                      <dt className="text-[var(--color-ink-faint)]">{d.label}</dt>
                      <dd className="text-right font-medium">{text}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ) : null}
        </div>

        <div>
          <div className="lg:sticky lg:top-20">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{type.itemNoun}</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">{item.name}</h1>
            <p className="mt-1.5 text-[var(--color-ink-soft)]">{item.summary}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              {item.priceType === "on_request" || !item.price ? (
                <span className="text-xl font-semibold">Price on request</span>
              ) : (
                <>
                  {item.priceType === "from" ? <span className="text-sm text-[var(--color-ink-faint)]">from</span> : null}
                  <span className="text-3xl font-semibold tabular-nums"><Money value={effectivePrice ?? item.price} currency={item.currency} /></span>
                  {effectivePrice ? <s className="text-base text-[var(--color-ink-faint)]"><Money value={item.price} currency={item.currency} /></s> : null}
                </>
              )}
            </div>

            {offer ? (
              <p className="mt-2 rounded-lg border border-[#f0d9ab] bg-[#fdf7ea] px-3 py-2 text-sm">
                <strong>{offer.title}</strong>
                {offer.endsAt ? <span className="block text-xs text-[var(--color-warn)]">Ends {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(offer.endsAt))}</span> : null}
              </p>
            ) : null}

            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {item.isOutOfStock
                ? <Badge tone="danger">Out of stock - ask us about the next batch</Badge>
                : <Badge tone="ok">{item.stockQty !== null ? `${item.stockQty} available` : "Available"}</Badge>}
              {item.isFeatured ? <Badge tone="info">Featured</Badge> : null}
            </p>

            <Card className="mt-5 card-pad">
              <EnquireForm
                business={{ id: business.id, name: business.name, hasNumber: Boolean(bizNumber) }}
                item={{
                  id: item.id, name: item.name, slug: item.slug, sku: item.sku,
                  price: effectivePrice ?? item.price, currency: item.currency,
                }}
                imageUrl={hero?.url ?? null}
                pageUrl={itemUrl}
                ctaVerb={type.ctaVerb}
                variants={variants}
                fieldLines={fieldLines}
                offerLine={offer ? `${offer.title}${offer.endsAt ? ` (until ${new Date(offer.endsAt).toISOString().slice(0, 10)})` : ""}` : null}
              />
            </Card>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Card className="card-pad">
                <p className="text-sm font-semibold">How this works</p>
                <ol className="mt-2 space-y-1 text-sm text-[var(--color-ink-soft)]">
                  <li>1. Tap the green button - WhatsApp opens with these details written out.</li>
                  <li>2. You review the message and press send.</li>
                  <li>3. {business.name} confirms price, availability and delivery with you on WhatsApp.</li>
                </ol>
                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">Cybershop never handles payment or delivery, and never messages anyone on your behalf.</p>
              </Card>
              <Card className="card-pad">
                <p className="text-sm font-semibold">{bizNumber?.label ?? "WhatsApp"}</p>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{bizNumber ? bizNumber.e164 : "No number listed."}</p>
                <p className="mt-2 text-sm font-semibold">Share</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  <a className="chip" href={`https://wa.me/?text=${encodeURIComponent(`${item.name} ${process.env.PUBLIC_APP_URL ?? ""}${itemUrl}`)}`} rel="noopener noreferrer" target="_blank">WhatsApp</a>
                  <a className="chip" href={`https://t.me/share/url?url=${encodeURIComponent(process.env.PUBLIC_APP_URL ?? "")}${encodeURIComponent(itemUrl)}`} rel="noopener noreferrer" target="_blank">Telegram</a>
                  <a className="chip" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(item.name)}&url=${encodeURIComponent(`${process.env.PUBLIC_APP_URL ?? ""}${itemUrl}`)}`} rel="noopener noreferrer" target="_blank">X</a>
                </div>
              </Card>
            </div>

            <p className="mt-4 text-sm">
              <Link className="link" href={`/business/${business.slug}`}>See everything from {business.name}</Link>
            </p>
          </div>
        </div>
      </div>

      <section className="mt-12" aria-labelledby="more">
        <h2 id="more" className="text-lg font-semibold">More from {business.name}</h2>
        <MoreItems businessId={business.id} typeKey={typeKey} excludeId={item.id} slug={business.slug} />
      </section>
    </div>
  );
}

async function MoreItems({ businessId, typeKey, excludeId, slug }: { businessId: string; typeKey: string; excludeId: string; slug: string }) {
  const db = getDb();
  const rows = await listItems({ businessId, limit: 4, sort: "recent" })
    .then((all) => all.filter((r) => r.id !== excludeId).slice(0, 4));
  if (!rows.length) return <p className="mt-2 text-sm text-[var(--color-ink-faint)]">Nothing else published yet.</p>;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
      {rows.map((r) => (
        <li key={r.id} className="card card-pad">
          <Link href={pathFor(slug, r.typeKey, r.slug)} className="block">
            <p className="line-clamp-2 text-sm font-medium">{r.name}</p>
            <p className="mt-1 text-sm"><Money value={r.price} currency={r.currency} /></p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** structured data by catalogue type (plan.md 45) - only fields we actually have */
function buildJsonLd(input: {
  type: string; item: Record<string, unknown>; business: Record<string, unknown>;
  images: Array<{ url: string | null }>; values: Map<string, unknown>; defs: FieldDef[]; offer: { percentOff?: string | null; amountOff?: string | null; priceOverride?: string | null; endsAt?: Date | null } | null;
  variants: Array<{ name: string; price: string | null }>;
}) {
  const { type, item, business, images, offer, variants } = input;
  const origin = process.env.PUBLIC_APP_URL ?? "";
  const url = `${origin}/business/${business.slug}/${String(item.slug)}`;
  const img = images.find((i) => i.url)?.url;
  const price = offer?.priceOverride ?? String(item.price ?? "");
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    name: item.name,
    description: item.summary ?? undefined,
    image: img ? [`${origin}${img}`] : undefined,
    url,
    ...(item.sku ? { sku: item.sku } : {}),
  };
  const org = { "@type": "Organization", name: business.name, url: `${origin}/business/${business.slug}` };

  switch (type) {
    case "Course":
      return { ...base, "@type": "Course", provider: org, hasCourseInstance: { "@type": "CourseInstance", courseMode: "blended" } };
    case "Event":
      return { ...base, "@type": "Event", organizer: org, ...(item.startsAt ? { startDate: item.startsAt } : {}) };
    case "RealEstateListing":
      return { ...base, "@type": "Offer", itemOffered: { ...base, "@type": "Product" }, availability: item.isOutOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", price, priceCurrency: item.currency, seller: org };
    case "Service":
      return { ...base, "@type": "Service", serviceType: String(item.name), provider: org, areaServed: business.city ?? undefined };
    default:
      return {
        ...base, "@type": "Product", brand: org,
        offers: {
          "@type": "Offer", price, priceCurrency: item.currency ?? "NGN",
          availability: item.isOutOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          url,
          ...(variants.length ? { variant: variants.map((v) => ({ "@type": "ProductVariant", name: v.name, ...(v.price ? { offers: { "@type": "Offer", price: v.price, priceCurrency: item.currency ?? "NGN" } } : {}) })) } : {}),
        },
      };
  }
}
