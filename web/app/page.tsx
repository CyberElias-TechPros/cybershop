import type { Metadata } from 'next';
import { api, PUBLIC_REVALIDATE } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { sessionCookieHeader } from '@/lib/session';
import type { HomeOut, MarketListing } from '@/lib/types';
import ListingCard from '@/components/ListingCard';
import BusinessCard from '@/components/BusinessCard';
import ShopSearch from '@/components/ShopSearch';
import RecentRail from '@/components/RecentRail';
import { Reveal } from '@/components/Motion';

/*
 * The homepage is the shop. Products first, stores second, the pitch last —
 * the full vendor story (features, pricing, how selling works) lives on
 * /sell, where a prospective vendor actually looks for it. Everything here
 * is server-rendered so crawlers and WhatsApp unfurlers see real listings,
 * prices and sellers — the market itself is the advertisement.
 */

export const metadata: Metadata = {
  title: 'CyberShop — Shop Nigerian businesses, chat on WhatsApp',
  description:
    'Shop products, courses and services from real Nigerian businesses. See the price, tap once, and talk to the seller on WhatsApp. No checkout — CyberShop never takes your money.',
  alternates: { canonical: '/' },
  openGraph: { url: '/', title: 'CyberShop — Shop, then chat on WhatsApp' },
};

const EMPTY: HomeOut = {
  platform: { name: 'CyberShop', tagline: 'Find a business. Talk to it on WhatsApp.', currency: 'NGN', support_email: 'support@cybershop.ng', announcement: '' },
  categories: [],
  businesses: [],
  business_count: 0,
  listings: [],
  featured_listings: [],
  listing_count: 0,
  cities: [],
};

function SectionHead({ eyebrow, title, href, link }: { eyebrow: string; title: React.ReactNode; href: string; link: string }) {
  return (
    <Reveal>
      <div className="section-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <a href={href}>{link}</a>
      </div>
    </Reveal>
  );
}

function ListingGrid({ items }: { items: MarketListing[] }) {
  return (
    <div className="grid grid-items">
      {items.map((it, i) => (
        <Reveal key={it.id} i={i % 4}>
          <ListingCard it={it} />
        </Reveal>
      ))}
    </div>
  );
}

export default async function HomePage() {
  let data: HomeOut = EMPTY;
  let live = true;
  try {
    data = await api<HomeOut>('/public/home', {
      ip: await clientIp(),
      cookie: await sessionCookieHeader(),
      revalidate: PUBLIC_REVALIDATE,
    });
  } catch {
    /* An outage must not be dressed up as an empty market. */
    live = false;
  }

  const cats = data.categories ?? [];
  const fresh = data.listings ?? [];
  const featured = (data.featured_listings ?? []).filter((f) => !fresh.slice(0, 4).some((x) => x.id === f.id));
  const announcement = (data.platform?.announcement || '').trim();

  // Category rows: group the fresh feed by category for aisle-style browsing.
  const byCategory = new Map<string, { name: string; slug: string; items: MarketListing[] }>();
  for (const it of fresh) {
    if (!it.category_slug || !it.category_name) continue;
    const row = byCategory.get(it.category_slug) ?? { name: it.category_name, slug: it.category_slug, items: [] };
    row.items.push(it);
    byCategory.set(it.category_slug, row);
  }
  const categoryRows = [...byCategory.values()].filter((r) => r.items.length >= 2).slice(0, 2);

  return (
    <>
      {announcement && (
        <div className="container" style={{ paddingTop: 16 }}>
          <div className="banner info" role="status">{announcement}</div>
        </div>
      )}

      {/* ——— Shop header: search + city, then straight into the market ——— */}
      <section className="shop-hero">
        <div className="container">
          <h1 className="shop-title">
            Shop real businesses. <em>Chat on WhatsApp.</em>
          </h1>
          <p className="shop-sub">
            Prices up front, sellers you can check — then one tap into a WhatsApp conversation.
            No checkout, and CyberShop never takes your money.
          </p>
          <ShopSearch cities={data.cities ?? []} />
          {live && (
            <p className="shop-counts" role="status">
              <a href="/listings">{data.listing_count} listing{data.listing_count === 1 ? '' : 's'}</a>
              {' · '}
              <a href="/businesses">{data.business_count} business{data.business_count === 1 ? '' : 'es'}</a>
              {' · '}
              <a href="/safety">How buying safely works</a>
            </p>
          )}
          {!live && (
            <p className="shop-counts" role="status">
              The catalogue is taking a moment to wake up. <a href="/">Reload</a> — or{' '}
              <a href="/businesses">browse businesses</a> directly.
            </p>
          )}
          {cats.length > 0 && (
            <nav className="shop-cats" aria-label="Shop by category">
              {cats.map((c) => (
                <a key={c.slug} className="chip shop-cat-chip" href={`/categories/${c.slug}`}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </a>
              ))}
            </nav>
          )}
          {(data.cities ?? []).length > 1 && (
            <nav className="shop-cats" aria-label="Shop by city">
              <span className="shop-cats-label">Cities:</span>
              {(data.cities ?? []).map((c) => (
                <a key={c.city} className="chip shop-cat-chip" href={`/listings?city=${encodeURIComponent(c.city)}`}>
                  {c.city}
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>

      {/* ——— Recently viewed (returning buyers only; renders nothing otherwise) ——— */}
      <RecentRail />

      {/* ——— The feed ——— */}
      <section className="section" style={{ paddingTop: 'clamp(28px, 5vw, 48px)' }}>
        <div className="container">
          <SectionHead eyebrow="Fresh in the market" title={<>Just <em>listed</em></>} href="/listings" link="Shop all listings →" />
          {fresh.length === 0 ? (
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>{live ? '🏪' : '🕯️'}</span>
              <h2>{live ? 'The first listings are on their way' : 'The shelves are dark right now'}</h2>
              {live ? (
                <p>
                  Sellers are stocking the market. <a href="/businesses">Meet the businesses</a> already here — or{' '}
                  <a href="/sell">open your own storefront, free</a>.
                </p>
              ) : (
                <p>We could not reach the catalogue service. <a href="/">Reload</a> to try again.</p>
              )}
            </div>
          ) : (
            <ListingGrid items={fresh} />
          )}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead eyebrow="Highlighted by sellers" title={<>Featured <em>listings</em></>} href="/listings?sort=newest" link="Browse everything →" />
            <ListingGrid items={featured.slice(0, 4)} />
          </div>
        </section>
      )}

      {categoryRows.map((row) => (
        <section className="section" style={{ paddingTop: 0 }} key={row.slug}>
          <div className="container">
            <SectionHead eyebrow="Aisle" title={row.name} href={`/categories/${row.slug}`} link={`Shop ${row.name} →`} />
            <ListingGrid items={row.items.slice(0, 4)} />
          </div>
        </section>
      ))}

      {/* ——— Stores, second ——— */}
      {data.businesses.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <SectionHead eyebrow="The sellers" title={<>Stores worth a <em>hello</em></>} href="/businesses" link="The full directory →" />
            <div className="grid grid-biz">
              {data.businesses.map((b, i) => (
                <Reveal key={b.id} i={i % 4}>
                  <BusinessCard b={b} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ——— How it works, in three lines (the long version lives on /sell) ——— */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="how-strip">
              <p><strong>1. Find it</strong> — real listings, real prices, sellers with reviews.</p>
              <p><strong>2. Chat</strong> — one tap opens WhatsApp with your question already written.</p>
              <p><strong>3. Deal safely</strong> — agree in the chat, inspect, then pay the seller directly. <a href="/safety">Safety guide</a></p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ——— The vendor door (the full pitch is on /sell) ——— */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="cine-manifesto">
              <p className="cine-kicker">Sell on CyberShop</p>
              <h2>Your business, <em>beautifully</em> found.</h2>
              <p>
                A professional storefront with a living catalogue, on the market above in minutes.
                Free to start — see every plan and what you get before you sign up.
              </p>
              <div className="cta-actions">
                <a className="btn btn-gold sheen big" href="/sell">
                  See plans &amp; how selling works
                </a>
                <a className="btn btn-ghost big" href="/register">
                  Open your store — free
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
