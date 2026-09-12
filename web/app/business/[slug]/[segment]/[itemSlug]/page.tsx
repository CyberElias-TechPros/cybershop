import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { absUrl } from '@/lib/config';
import { clientIp } from '@/lib/ip';
import { formatField, humanize, location } from '@/lib/ui';
import type { ItemPageOut } from '@/lib/types';
import Gallery from '@/components/Gallery';
import WaCta from '@/components/WaCta';
import StickyWa from '@/components/StickyWa';
import WaveAudio from '@/components/WaveAudio';
import ItemCard from '@/components/ItemCard';
import { AddToCart } from '@/components/CartFx';
import { Reveal } from '@/components/Motion';
import { FlipBack } from '@/components/Fx';
import { categoryTheme } from '@/lib/theme';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

interface SP {
  slug: string;
  segment: string;
  itemSlug: string;
}

function itemPath(biz: string, segment: string, slug: string) {
  return `/business/${biz}/${segment}/${slug}`;
}

async function fetchItem(sp: SP, ip?: string) {
  return api<ItemPageOut>(
    `/public/item?biz=${encodeURIComponent(sp.slug)}&segment=${encodeURIComponent(sp.segment)}&slug=${encodeURIComponent(sp.itemSlug)}`,
    { ip }
  );
}

export async function generateMetadata({ params }: { params: Promise<SP> }): Promise<Metadata> {
  const sp = await params;
  try {
    const { item, business } = await fetchItem(sp);
    const img = item.images[0]?.url || business.cover?.url || business.logo?.url || null;
    const title = item.seo.title || item.name;
    const desc = item.seo.description || item.description?.slice(0, 200) || `${item.name} at ${business.name}`;
    return {
      title,
      description: desc,
      alternates: { canonical: itemPath(business.slug, sp.segment, item.slug) },
      openGraph: {
        title,
        description: desc,
        type: 'website',
        images: img ? [{ url: absUrl(img), width: 1200, height: 630 }] : undefined,
      },
      twitter: { card: 'summary_large_image', title, description: desc },
    };
  } catch {
    return { title: 'Listing not found' };
  }
}

export default async function ItemPage({ params }: { params: Promise<SP> }) {
  const sp = await params;
  const { item, business, wa, related } = await fetchItem(sp, await clientIp());
  const fields = Object.entries(item.custom_fields ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': item.schema_type || 'Product',
    name: item.name,
    description: item.description ?? undefined,
    ...(item.images[0]?.url ? { image: [item.images.map((i) => absUrl(i.url))] } : {}),
    url: absUrl(itemPath(business.slug, sp.segment, item.slug)),
    brand: { '@type': 'Brand', name: business.name },
  };
  const offerUrl = absUrl(itemPath(business.slug, sp.segment, item.slug));
  if (item.price_type === 'fixed' && item.price_kobo !== null) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: (item.price_kobo / 100).toFixed(2),
      priceCurrency: item.currency || 'NGN',
      availability: item.stock_status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      url: offerUrl,
    };
  } else if (item.price_type === 'from' && item.price_kobo !== null) {
    jsonLd.offers = {
      '@type': 'Offer',
      lowPrice: (item.price_kobo / 100).toFixed(2),
      priceCurrency: item.currency || 'NGN',
      url: offerUrl,
    };
  } else if (item.price_type === 'free') {
    jsonLd.offers = {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: item.currency || 'NGN',
      url: offerUrl,
    };
  }

  const flipId = `item:${item.id}`;
  const th = categoryTheme(business.categories);

  return (
    <div style={{ ['--acc' as string]: th.acc, ['--acc2' as string]: th.acc2 } as CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StickyWa name={business.name} waUrl={wa.url} ctaLabel={item.cta_label ?? 'Chat now'} after={280} />
      <FlipBack id={flipId} />
      <div className="container" style={{ padding: '24px 16px' }}>
        <Reveal className="cascade">
          <nav className="crumb" aria-label="Breadcrumb" style={{ margin: '0 0 20px' }}>
            <a href="/">Home</a>
            <span aria-hidden>/</span>
            <a href="/businesses">Businesses</a>
            <span aria-hidden>/</span>
            <a href={`/business/${business.slug}`}>{business.name}</a>
          </nav>
        </Reveal>

        <div className="item-layout">
          <div>
            <Reveal className="item-media">
              <Gallery images={item.images} name={item.name} flipId={flipId} />
            </Reveal>
            {fields.length > 0 && (
              <Reveal i={1} className="cascade">
                <dl className="field-table">
                  {fields.map(([k, v]) => (
                    <div className="field-row" key={k}>
                      <dt>{humanize(k)}</dt>
                      <dd>{formatField(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}
            {item.description && (
              <Reveal i={2} className="cascade">
                <p className="item-desc">{item.description}</p>
              </Reveal>
            )}
          </div>

          <div className="item-info">
            <Reveal className="cascade">
              <p className="crumb" style={{ margin: 0 }}>
                <a href={`/business/${business.slug}`}>{business.name}</a>
                {location(business) ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{location(business)}</span>
                  </>
                ) : null}
              </p>
              <h1>{item.name}</h1>
              <div className="price-big">{item.price_display}</div>
              {item.stock_status === 'in_stock' ? (
                <div className="stock-note">
                  <span className="pulse-dot" aria-hidden="true" style={{ marginRight: 7, verticalAlign: 1 }} />
                  In stock — ready to ship when you agree
                </div>
              ) : (
                item.stock_status && (
                  <div className="stock-note">
                    {item.stock_status === 'out_of_stock'
                      ? 'Currently out of stock — enquire to check availability.'
                      : 'Availability on request.'}
                  </div>
                )
              )}
            </Reveal>
            {item.audio && (
              <Reveal i={1} className="cascade">
                <WaveAudio src={item.audio.url} label={`Voice note from ${business.name}`} />
              </Reveal>
            )}
            <Reveal i={2} className="cascade">
              <WaCta
                businessId={business.id}
                listingId={item.id}
                waUrl={wa.url}
                ctaLabel={item.cta_label || `Enquire about ${item.name}`}
                priceDisplay={undefined}
                withDetails
                messagePreview={wa.message ? `\n${wa.message}` : undefined}
              />
            </Reveal>
            <Reveal i={3} className="cascade">
              <AddToCart
                bizId={business.id}
                bizName={business.name}
                listingId={item.id}
                name={item.name}
                priceKobo={item.price_type === 'fixed' || item.price_type === 'from' ? item.price_kobo : null}
                priceDisplay={item.price_display}
                image={item.images[0]?.url ?? null}
                label="Add to cart"
              />
              <p className="cart-hint">
                Picking up a few things? Add more and we’ll message the vendor one WhatsApp with the
                whole list.
              </p>
            </Reveal>
          </div>
        </div>

        {related && related.length > 0 && (
          <div className="type-group" style={{ marginTop: 56 }}>
            <Reveal>
              <div className="section-head">
                <div>
                  <span className="eyebrow">Also from {business.name}</span>
                  <h2>Keep looking</h2>
                </div>
              </div>
            </Reveal>
            <div className="grid grid-items">
              {related.slice(0, 8).map((it, i) => (
                <Reveal key={it.id} i={i % 4}>
                  <ItemCard item={it} biz={business} />
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
