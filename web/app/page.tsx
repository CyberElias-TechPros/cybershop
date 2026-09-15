import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { HomeOut } from '@/lib/types';
import SearchForm from '@/components/SearchForm';
import { CountUp, HeroWords, Reveal } from '@/components/Motion';
import { Act, BusinessReel, CategoryBento, ChatStage } from '@/components/Cinema';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

const EMPTY: HomeOut = {
  platform: { name: 'CyberShop', tagline: 'Find a business. Talk to it on WhatsApp.', currency: 'NGN', support_email: 'support@cybershop.ng' },
  categories: [],
  businesses: [],
  business_count: 0,
};

export default async function HomePage() {
  let data: HomeOut = EMPTY;
  try {
    data = await api<HomeOut>('/public/home', { ip: await clientIp() });
  } catch {
    /* cinematic empty market — never crash the front door */
  }
  const platform = data.platform;
  const tagline = platform?.tagline ?? 'Find a business. Talk to it on WhatsApp.';
  const cats = data.categories;

  return (
    <>
      <section className="cine-hero">
        <div className="cine-hero-copy">
          <p className="cine-kicker">
            <span className="pulse-dot" aria-hidden />
            The WhatsApp-first night market · always open
          </p>
          <h1 className="hero-words" aria-label={tagline}>
            <span aria-hidden>
              <HeroWords text={tagline} />
            </span>
          </h1>
          <p className="hero-sub">
            Catalogues from real businesses — courses, couture, kitchens, homes —
            then a single tap into a conversation. No carts. No checkout. No
            middlemen. Just you, the owner, and WhatsApp.
          </p>
          <div className="hero-search">
            <SearchForm big />
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="n">
                <CountUp value={data.business_count} />
              </span>
              <span className="l">active business{data.business_count === 1 ? '' : 'es'}</span>
            </div>
            <div className="hero-stat">
              <span className="n">
                <CountUp value={data.categories.length} />
              </span>
              <span className="l">industries</span>
            </div>
            <div className="hero-stat">
              <span className="n">0</span>
              <span className="l">accounts needed to enquire</span>
            </div>
          </div>
        </div>
        <ChatStage categories={cats} />
        <a className="cine-scroll" href="#market">
          <span>Enter the market</span>
          <i aria-hidden>↓</i>
        </a>
      </section>

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

      <section className="section cine-section" id="market">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">The aisles</span>
                <h2>
                  Browse by <em>instinct</em>
                </h2>
              </div>
              <a href="/businesses">View all businesses →</a>
            </div>
          </Reveal>
          {cats.length === 0 ? (
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>
                🗂️
              </span>
              <h2>The stalls are being set</h2>
              <p>Categories arrive with the first vendors. Check back soon.</p>
            </div>
          ) : (
            <Reveal>
              <CategoryBento cats={cats} />
            </Reveal>
          )}
        </div>
      </section>

      <section className="cine-acts-wrap">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">The ritual</span>
                <h2>
                  Three beats to a <em>conversation</em>
                </h2>
              </div>
            </div>
          </Reveal>
          <div className="cine-acts">
            <Reveal i={0}>
              <Act
                n="01"
                i={0}
                title="Discover"
                body="Walk the catalogues — prices, photographs, voice notes from the owner. Everything is real, nothing is gated."
              />
            </Reveal>
            <Reveal i={1}>
              <Act
                n="02"
                i={1}
                title="Slide into chat"
                body="One gesture opens WhatsApp with your question already written — quantity, name, even the item link."
              />
            </Reveal>
            <Reveal i={2}>
              <Act
                n="03"
                i={2}
                title="Deal in the thread"
                body="You and the owner agree on price, delivery and payment the way this continent already does — on WhatsApp."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section cine-section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">On the floor</span>
                <h2>
                  Businesses worth a <em>hello</em>
                </h2>
              </div>
              <a href="/businesses">The full directory →</a>
            </div>
          </Reveal>
        </div>
        {data.businesses.length === 0 ? (
          <div className="container">
            <div className="empty">
              <span className="empty-icon floaty" aria-hidden>
                🏪
              </span>
              <h2>No stalls yet</h2>
              <p>
                Be the first lantern in the market — <a href="/register">open your storefront free</a>.
              </p>
            </div>
          </div>
        ) : (
          <BusinessReel businesses={data.businesses} />
        )}
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="cine-manifesto">
              <p className="cine-kicker">For vendors</p>
              <h2>
                Your business, <em>beautifully</em> found.
              </h2>
              <p>
                A storefront with a living catalogue, in minutes. Free to start.
                You pay only for the reach you need — bank transfer or Paystack.
              </p>
              <div className="cta-actions">
                <a className="btn btn-gold sheen big" href="/register">
                  Open your stall — it’s free
                </a>
                <a className="btn btn-ghost big" href="/businesses">
                  Walk the market
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
