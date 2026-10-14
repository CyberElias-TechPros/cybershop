import type { Metadata } from 'next';
import { api, PUBLIC_REVALIDATE } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { sessionCookieHeader } from '@/lib/session';
import type { CategoryPageOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import ListingCard from '@/components/ListingCard';
import { Reveal } from '@/components/Motion';

/* Not `force-dynamic` — see the note on the homepage. Anonymous taxonomy
   reads are cached; signed-in visitors always get their own (block-aware)
   view. */

interface SP {
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<SP> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await api<CategoryPageOut>(`/public/categories/${slug}`, {
      cookie: await sessionCookieHeader(),
      revalidate: PUBLIC_REVALIDATE,
    });
    return {
      title: `Shop ${data.category.name}`,
      description:
        data.category.description ||
        `Shop ${data.category.name} from real Nigerian businesses on CyberShop — see prices, then chat with the seller on WhatsApp.`,
      alternates: { canonical: `/categories/${slug}` },
      openGraph: { title: `Shop ${data.category.name}`, url: `/categories/${slug}` },
    };
  } catch {
    return { title: 'Category not found' };
  }
}

export default async function CategoryPage({ params }: { params: Promise<SP> }) {
  const { slug } = await params;
  const data = await api<CategoryPageOut>(`/public/categories/${slug}`, {
    ip: await clientIp(),
    cookie: await sessionCookieHeader(),
    revalidate: PUBLIC_REVALIDATE,
  });
  const listings = data.listings ?? [];
  const businesses = data.businesses ?? [];

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <Reveal>
          <nav className="crumb" aria-label="Breadcrumb">
            <a href="/">Shop</a>
            <span aria-hidden>/</span>
            <a href="/listings">All listings</a>
            <span aria-hidden>/</span>
            <span>{data.category.name}</span>
          </nav>
        </Reveal>
        <Reveal i={1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '22px 0 8px' }}>
            <span
              aria-hidden
              style={{
                fontSize: '2.6rem',
                width: 88,
                height: 88,
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 26,
                background: 'rgba(44,229,142,0.07)',
                border: '1px solid rgba(44,229,142,0.3)',
                boxShadow: '0 0 44px rgba(44,229,142,0.15)',
              }}
            >
              {data.category.icon || '📁'}
            </span>
            <div>
              <span className="eyebrow" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--em)', marginBottom: 6 }}>
                Category
              </span>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 560, fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)', letterSpacing: '-0.02em' }}>
                {data.category.name}
              </h1>
              <p className="section-count" role="status" style={{ marginTop: 6 }}>
                {data.listing_total ?? listings.length} listing{(data.listing_total ?? listings.length) === 1 ? '' : 's'}
                {businesses.length > 0 ? ` · ${businesses.length} store${businesses.length === 1 ? '' : 's'} on this page` : ''}
              </p>
            </div>
          </div>
        </Reveal>
        {data.category.description && (
          <Reveal i={2}>
            <p style={{ color: 'var(--ink-dim)', maxWidth: '60ch' }}>{data.category.description}</p>
          </Reveal>
        )}

        {/* Listings first: a category is an aisle you shop, not a directory. */}
        {listings.length > 0 ? (
          <>
            <div className="grid grid-items" style={{ marginTop: 22 }}>
              {listings.map((it, i) => (
                <Reveal key={it.id} i={i % 4}>
                  <ListingCard it={it} />
                </Reveal>
              ))}
            </div>
            <p style={{ marginTop: 26 }}>
              <a className="btn btn-ghost" href={`/listings?category=${encodeURIComponent(slug)}`}>
                Filter {data.category.name} by price, city &amp; more →
              </a>
            </p>
          </>
        ) : (
          <div className="empty" style={{ marginTop: 22 }}>
            <span className="empty-icon floaty" aria-hidden>🌱</span>
            <h2>No listings in {data.category.name} yet</h2>
            <p>
              The stores below sell in this category — or <a href="/listings">shop everything</a>.
            </p>
          </div>
        )}

        {businesses.length > 0 && (
          <>
            <Reveal>
              <div className="section-head" style={{ marginTop: 44 }}>
                <div>
                  <span className="eyebrow">Stores in this category</span>
                  <h2>Sellers of <em>{data.category.name}</em></h2>
                </div>
                <a href={`/businesses?category=${encodeURIComponent(slug)}`}>All stores →</a>
              </div>
            </Reveal>
            <div className="grid grid-biz" data-elastic="" style={{ marginTop: 22 }}>
              {businesses.map((b, i) => (
                <Reveal key={b.id} i={i % 4}>
                  <BusinessCard b={b} />
                </Reveal>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
