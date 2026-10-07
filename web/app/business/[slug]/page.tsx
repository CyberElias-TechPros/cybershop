import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { absUrl } from '@/lib/config';
import { clientIp } from '@/lib/ip';
import { sessionCookieHeader } from '@/lib/session';
import { initials, location, tenureLabel } from '@/lib/ui';
import type { BusinessPageOut, ItemOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import ItemCard from '@/components/ItemCard';
import WaCta from '@/components/WaCta';
import BlockSeller from '@/components/BlockSeller';
import SaveBusiness from '@/components/SaveBusiness';
import ShareBar from '@/components/ShareBar';
import StickyWa from '@/components/StickyWa';
import { Reveal } from '@/components/Motion';
import SafetyTips from '@/components/SafetyTips';
import { FlipBack } from '@/components/Fx';
import { categoryTheme } from '@/lib/theme';
import { siteInfo } from '@/lib/site';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

interface SP {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<SP> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api<BusinessPageOut>(`/public/business/${slug}`, { cookie: await sessionCookieHeader() });
    const { business } = data;
    const closed = Boolean(data.unavailable) && !data.preview;
    return {
      title: business.name,
      description: business.about?.slice(0, 200) || `${business.name} on CyberShop`,
      robots: closed ? { index: false, follow: false } : undefined,
      alternates: { canonical: `/business/${business.slug}` },
      openGraph: {
        title: business.name,
        description: business.about?.slice(0, 200) || `${business.name} on CyberShop`,
        url: `/business/${business.slug}`,
        // The route's opengraph-image.tsx composes the card (photo, city,
        // categories, verified badge) at the size scrapers expect.
      },
      twitter: { card: 'summary_large_image' },
    };
  } catch {
    return { title: 'Business not found' };
  }
}

/** Group items by their URL segment (item type) for the storefront. */
function groupItems(items: ItemOut[]): Map<string, ItemOut[]> {
  const m = new Map<string, ItemOut[]>();
  for (const it of items) {
    const arr = m.get(it.url_segment) ?? [];
    arr.push(it);
    m.set(it.url_segment, arr);
  }
  return m;
}

function segmentTitle(seg: string): string {
  return seg.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function waLink(raw: string | null | undefined, name: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(
    `Hello ${name}, I found you on CyberShop and I’d like to make an enquiry.`
  )}`;
}

export default async function BusinessPage({ params }: { params: Promise<SP> }) {
  const { slug } = await params;
  const data = await api<BusinessPageOut>(`/public/business/${slug}`, { ip: await clientIp(), cookie: await sessionCookieHeader() });
  const { business, items, offers } = data;
  const { safety } = await siteInfo();
  const closed = Boolean(data.unavailable) && !data.preview;
  const groups = groupItems(items);
  const stickyWa = closed ? null : waLink(business.whatsapp_number ?? business.phone, business.name);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: business.name,
    url: absUrl(`/business/${business.slug}`),
    ...(business.logo ? { logo: absUrl(business.logo.url) } : {}),
    ...(business.website ? { sameAs: business.website } : {}),
    ...(location(business)
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(business.city ? { addressLocality: business.city } : {}),
            ...(business.state_region ? { addressRegion: business.state_region } : {}),
          },
        }
      : {}),
  };

  const sf = business.storefront;
  const show = (key: string) => sf?.sections?.[key] !== false;
  const th = categoryTheme(business.categories);
  const flipId = `biz:${business.slug}`;

  return (
    <div data-store={sf?.style || 'classic'} style={{ ['--acc' as string]: sf?.accent || th.acc, ['--acc2' as string]: th.acc2 } as CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StickyWa name={business.name} waUrl={stickyWa} ctaLabel="Chat now" />
      <FlipBack id={flipId} />

      <div className="store-hero">
        {show('hero') && business.cover && (
          <div className="cover-wrap kb" aria-hidden="true" data-flip-target={flipId} data-flip-close={flipId}>
            <span className="skel" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cover" src={business.cover.url} alt="" />
          </div>
        )}
        {!business.cover && (
          <div className="aurora" aria-hidden="true" data-flip-target={flipId}>
            <span />
            <span />
            <span />
          </div>
        )}
        <div className="inner cascade">
          {business.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="store-logo" src={business.logo.url} alt={business.logo.alt} />
          ) : (
            <div className="store-logo initials" aria-hidden>
              {initials(business.name)}
            </div>
          )}
          <div className="store-title">
            <span className="store-live">
              <span className="pulse-dot" aria-hidden="true" />
              {closed ? 'Taking a break' : data.preview ? 'Hidden from buyers' : 'Open for chat'}
            </span>
            <h1>{business.name}</h1>
            <p className="store-meta">
              <span>{location(business) ?? 'Nigeria'}</span>
              {business.categories.length > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{business.categories.map((c) => c.name).join(', ')}</span>
                </>
              )}
            </p>
            <div className="trust-row" style={{ marginTop: 10 }}>
              {business.is_platform_owner && <span className="trust-chip official">Official CyberShop store</span>}
              {business.verification_status === 'verified' && <span className="trust-chip">Verified vendor</span>}
              {tenureLabel(business.created_at) && (
                <span className="trust-chip faint">{tenureLabel(business.created_at)}</span>
              )}
              {typeof business.listing_count === 'number' && (
                <span className="trust-chip faint">{business.listing_count} ads</span>
              )}
              {business.reviews && business.reviews.count > 0 && (
                <span className="trust-chip faint">{business.reviews.average}★ from {business.reviews.count} review{business.reviews.count === 1 ? '' : 's'}</span>
              )}
            </div>
            <BlockSeller businessId={business.id} />
            <SaveBusiness businessId={business.id} />
            <ShareBar url={`/business/${business.slug}`} title={business.name} />
          </div>
        </div>
      </div>

      <div className="container item-layout" style={{ padding: '28px 16px' }}>
        <div>
          {data.unavailable && (
            <div className="banner warn" style={{ marginBottom: 18 }}>
              {data.preview
                ? 'Buyers cannot see this catalogue or your WhatsApp button right now. You can, because you manage the store.'
                : data.unavailable_reason === 'paused'
                  ? 'This store is taking a break. The catalogue and WhatsApp button are hidden until the seller resumes.'
                  : 'This store is temporarily unavailable. Nothing here is for sale until it is live again.'}
            </div>
          )}
          {show('about') && business.about && (
            <Reveal className="cascade">
              <div className="card about-box" style={{ marginBottom: 24 }}>
                <p>{business.about}</p>
              </div>
            </Reveal>
          )}

          {show('offers') && offers.length > 0 && (
            <Reveal>
              <div className="section-head" style={{ marginBottom: 12 }}>
                <div>
                  <span className="eyebrow">Hot right now</span>
                  <h2>Current offers</h2>
                </div>
              </div>
            </Reveal>
          )}
          {show('offers') && offers.length > 0 && (
            <div className="offers" style={{ marginBottom: 8 }}>
              {offers.map((o, i) => (
                <Reveal key={o.id} i={i % 4}>
                  <div className="offer">
                    <strong>🎁 {o.title}</strong>
                    {o.description && <span>{o.description}</span>}
                  </div>
                </Reveal>
              ))}
            </div>
          )}

          {show('featured') && items.some((it) => it.featured) && (
            <div className="type-group">
              <h2>Featured</h2>
              <div className="grid grid-items">
                {items.filter((it) => it.featured).map((it) => (
                  <ItemCard key={it.id} item={it} biz={business} />
                ))}
              </div>
            </div>
          )}

          {show('faq') && sf?.faq?.length ? (
            <div className="card panel" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.05rem' }}>Questions</h2>
              {sf.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          ) : null}

          {show('location') && (business.address || business.city || sf?.hours) && (
            <div className="card panel" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.05rem' }}>Find us</h2>
              <p style={{ marginBottom: 0 }}>
                {[business.address, business.city, business.state_region].filter(Boolean).join(', ')}
                {sf?.hours ? ` · ${sf.hours}` : ''}
              </p>
            </div>
          )}

          {[...groups.entries()].map(([seg, groupItems_]) => (
            <div className="type-group" key={seg}>
              <Reveal>
                <h2>{segmentTitle(seg)}</h2>
              </Reveal>
              <div className="grid grid-items">
                {groupItems_.map((it, i) => (
                  <Reveal key={it.id} i={i % 4}>
                    <ItemCard item={it} biz={business} />
                  </Reveal>
                ))}
              </div>
            </div>
          ))}

          {items.length === 0 && !closed && (
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>
                🏷️
              </span>
              <h2>No listings yet</h2>
              <p>
                This business hasn’t published any items — chat with them on WhatsApp to find out
                what they offer.
              </p>
            </div>
          )}
        </div>

        <aside>
          <Reveal className="cascade">
            {!closed && (
              <WaCta
                businessId={business.id}
                ctaLabel={`Chat with ${business.name}`}
                safetyNote={safety.notice}
              />
            )}
          </Reveal>
          <Reveal i={1}>
            <SafetyTips compact />
          </Reveal>
        </aside>
      </div>
      {/* The mobile "Chat now" bar is fixed to the bottom of the viewport —
          without this the last listing sits underneath it. */}
      <div className="sticky-bar-space" aria-hidden="true" />
    </div>
  );
}
