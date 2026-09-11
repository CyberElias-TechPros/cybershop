import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { HomeOut } from '@/lib/types';
import BusinessCard from '@/components/BusinessCard';
import SearchForm from '@/components/SearchForm';
import { AuroraParallax, CountUp, HeroWords, Reveal } from '@/components/Motion';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let data: HomeOut;
  try {
    data = await api<HomeOut>('/public/home', { ip: await clientIp() });
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) notFound();
    throw e;
  }
  const platform = data.platform;
  const tagline = platform?.tagline ?? 'Find a business. Talk to it on WhatsApp.';
  const cats = data.categories;

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="hero">
        <AuroraParallax />
        <div className="inner">
          <span className="hero-eyebrow">
            <span className="spark" aria-hidden>
              ✦
            </span>
            The WhatsApp-first marketplace
          </span>
          <h1 className="hero-words" aria-label={tagline}>
            <span aria-hidden>
              <HeroWords text={tagline} />
            </span>
          </h1>
          <p className="hero-sub">
            Browse catalogues from real businesses — courses, products, services, homes — and
            message the owner directly on WhatsApp. No carts, no checkout, no middlemen.
          </p>
          <div className="hero-search">
            <SearchForm big />
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="n">
                <CountUp value={data.business_count} />
              </span>
              <span className="l">
                active business{data.business_count === 1 ? '' : 'es'}
              </span>
            </div>
            <div className="hero-stat">
              <span className="n">
                <CountUp value={data.categories.length} />
              </span>
              <span className="l">categories</span>
            </div>
            <div className="hero-stat">
              <span className="n">100%</span>
              <span className="l">on WhatsApp — no accounts needed</span>
            </div>
          </div>
          <span className="hero-cue scroll-cue" aria-hidden>
            ↓
          </span>
        </div>
      </section>

      {/* ---------- category marquee ---------- */}
      {cats.length > 0 && (
        <div className="strip" aria-hidden="true">
          <div className="marquee">
            <div className="marquee-track">
              {[...cats, ...cats].map((c, i) => (
                <span className="chip" key={`${c.slug}-${i}`}>
                  {c.icon ? `${c.icon} ` : ''}
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- categories ---------- */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">Explore</span>
                <h2>Browse by category</h2>
              </div>
              <a href="/businesses">View all businesses →</a>
            </div>
          </Reveal>
          {cats.length === 0 ? (
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>
                🗂️
              </span>
              <h2>No categories yet</h2>
              <p>Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cats">
              {cats.map((c, i) => (
                <Reveal key={c.slug} i={i % 6} as="div" style={{ margin: 0 }}>
                  <a className="card cat-card" href={`/categories/${c.slug}`}>
                    <span className="cat-icon" aria-hidden>
                      {c.icon || '📁'}
                    </span>
                    <span className="cat-name">{c.name}</span>
                    {c.description && <span className="cat-desc">{c.description}</span>}
                  </a>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">How it works</span>
                <h2>Three taps to a conversation</h2>
              </div>
            </div>
          </Reveal>
          <div className="steps">
            <Reveal i={0}>
              <div className="step">
                <span className="num" aria-hidden>
                  01
                </span>
                <h3>Discover</h3>
                <p>
                  Browse verified businesses and their real catalogues — prices, specs and photos,
                  right here.
                </p>
              </div>
            </Reveal>
            <Reveal i={1}>
              <div className="step">
                <span className="num" aria-hidden>
                  02
                </span>
                <h3>Tap the chat</h3>
                <p>
                  One button opens WhatsApp with your message already written — your question,
                  quantity, even the item link.
                </p>
              </div>
            </Reveal>
            <Reveal i={2}>
              <div className="step">
                <span className="num" aria-hidden>
                  03
                </span>
                <h3>Deal in chat</h3>
                <p>
                  You and the owner agree on price, delivery and payment the way Nigerians already
                  do — on WhatsApp.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- featured businesses ---------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">Featured</span>
                <h2>Businesses worth a hello</h2>
              </div>
              <a href="/businesses">View all →</a>
            </div>
          </Reveal>
          {data.businesses.length === 0 ? (
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>
                🏪
              </span>
              <h2>No businesses yet</h2>
              <p>
                Be the first to list your business on CyberShop —{' '}
                <a href="/register">join free</a>.
              </p>
            </div>
          ) : (
            <div className="grid grid-biz">
              {data.businesses.map((b, i) => (
                <Reveal key={b.id} i={i % 4}>
                  <BusinessCard b={b} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------- CTA band ---------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <div className="aurora" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>
                Your business, <span className="grad-text grad-italic">beautifully</span> found.
              </h2>
              <p>
                Set up your storefront and catalogue in minutes. Free to start — you pay only for
                the reach you need.
              </p>
              <div className="cta-actions">
                <a className="btn btn-gold sheen big" href="/register">
                  Start selling — it’s free
                </a>
                <a className="btn btn-ghost big" href="/businesses">
                  Browse businesses
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
