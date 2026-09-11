import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { absUrl } from '@/lib/config';
import { clientIp } from '@/lib/ip';
import { initials, location } from '@/lib/ui';
import type { BusinessPageOut, ItemOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import ItemCard from '@/components/ItemCard';
import WaCta from '@/components/WaCta';

export const dynamic = 'force-dynamic';

interface SP {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<SP> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { business } = await api<BusinessPageOut>(`/public/business/${slug}`);
    const img = business.cover?.url || business.logo?.url || null;
    return {
      title: business.name,
      description: business.about?.slice(0, 200) || `${business.name} on CyberShop`,
      openGraph: {
        title: business.name,
        description: business.about?.slice(0, 200) || `${business.name} on CyberShop`,
        images: img ? [{ url: absUrl(img) }] : undefined,
      },
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

export default async function BusinessPage({ params }: { params: Promise<SP> }) {
  const { slug } = await params;
  const data = await api<BusinessPageOut>(`/public/business/${slug}`, { ip: await clientIp() });
  const { business, items, offers } = data;
  const groups = groupItems(items);

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

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="store-hero">
        {business.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cover" src={business.cover.url} alt="" />
        )}
        <div className="inner">
          {business.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="store-logo" src={business.logo.url} alt={business.logo.alt} />
          ) : (
            <div className="store-logo initials" aria-hidden>
              {initials(business.name)}
            </div>
          )}
          <div className="store-title">
            <h1>{business.name}</h1>
            <p className="store-meta">
              {location(business) ?? 'Nigeria'}
              {business.categories.length > 0 && ` · ${business.categories.map((c) => c.name).join(', ')}`}
            </p>
          </div>
        </div>
      </div>

      <div className="container item-layout" style={{ padding: '28px 16px' }}>
        <div>
          {business.about && (
            <div className="card about-box" style={{ marginBottom: 24 }}>
              <p>{business.about}</p>
            </div>
          )}

          {offers.length > 0 && (
            <div className="section-head" style={{ marginBottom: 12 }}>
              <h2>Current offers</h2>
            </div>
          )}
          {offers.length > 0 && (
            <div className="offers" style={{ marginBottom: 8 }}>
              {offers.map((o) => (
                <div className="offer" key={o.id}>
                  <strong>🎁 {o.title}</strong>
                  {o.description && <span>{o.description}</span>}
                </div>
              ))}
            </div>
          )}

          {[...groups.entries()].map(([seg, groupItems_]) => (
            <div className="type-group" key={seg}>
              <h2>{segmentTitle(seg)}</h2>
              <div className="grid grid-items">
                {groupItems_.map((it) => (
                  <ItemCard key={it.id} item={it} biz={business} />
                ))}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="empty">
              <h2>No listings yet</h2>
              <p>This business hasn’t published any items — chat with them on WhatsApp to find out what they offer.</p>
            </div>
          )}
        </div>

        <aside>
          <WaCta businessId={business.id} ctaLabel={`Chat with ${business.name}`} />
        </aside>
      </div>
    </div>
  );
}
