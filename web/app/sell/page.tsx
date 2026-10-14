import type { Metadata } from 'next';
import { api, TAXONOMY_REVALIDATE } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import type { SellOut } from '@/lib/types';
import { Reveal } from '@/components/Motion';

/*
 * Sell on CyberShop — the vendor front door. Until now the only place a
 * prospective (paying) vendor could see plans was *after* registering.
 * This page is public on purpose: what you get, what it costs, how leads
 * arrive, and a link into a real storefront — before any form.
 */

export const metadata: Metadata = {
  title: 'Sell on CyberShop — plans, pricing & how it works',
  description:
    'Open a professional WhatsApp-first storefront: catalogue, leads inbox, reviews, analytics and share cards that sell in every WhatsApp group. Free to start; paid plans by bank transfer or Paystack.',
  alternates: { canonical: '/sell' },
  openGraph: { title: 'Sell on CyberShop', url: '/sell' },
};

const FALLBACK: SellOut = {
  plans: [
    { name: 'Free', slug: 'free', description: 'Start your storefront, no card needed.', price_kobo: 0, price_display: 'Free', interval: 'once', features: ['1 WhatsApp number', '500MB media', '10 catalogue items', 'Basic analytics'] },
    { name: 'Starter', slug: 'starter', description: 'For small businesses ready to grow.', price_kobo: 1500000, price_display: '₦15,000', interval: 'monthly', features: ['2 WhatsApp numbers', '5GB media', '100 catalogue items', '1 featured listing', 'Custom branding'] },
    { name: 'Business', slug: 'business', description: 'For established businesses with volume.', price_kobo: 3500000, price_display: '₦35,000', interval: 'monthly', features: ['5 WhatsApp numbers', '20GB media', 'Unlimited items', 'Up to 5 featured listings', '3 staff accounts', 'Advanced analytics'] },
    { name: 'Enterprise', slug: 'enterprise', description: 'Custom limits — talk to us.', price_kobo: 10000000, price_display: '₦100,000', interval: 'monthly', features: ['10 WhatsApp numbers', 'Custom storage', 'Unlimited everything', 'Priority support'] },
  ],
  addons: [],
};

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '🏪', title: 'A storefront that sells', body: 'Your own page with catalogue, photos, voice notes and offers — dressed in a theme named after your trade (Boutique, Kitchen, Academy…), and beautiful in every WhatsApp group chat thanks to composed share cards with your price and photo.' },
  { icon: '💬', title: 'Leads, not likes', body: 'Every “Enquire on WhatsApp” tap lands in your Leads inbox with the item, the buyer and the message — even if the chat never starts.' },
  { icon: '🎓', title: 'Any industry, no code', body: 'Fashion sizes, course durations, property bedrooms, menus — catalogue fields adapt to what you sell. New industry? It is a category, not a rebuild.' },
  { icon: '📈', title: 'Know what works', body: 'Views, WhatsApp clicks and conversion per listing, your best hour to post, CSV export — so you stock what people actually ask for.' },
  { icon: '⭐', title: 'Trust you can show', body: 'Reviews only from buyers who really enquired, an optional verified-ID badge, and a store-strength checklist that tells you exactly what to fix next.' },
  { icon: '👥', title: 'Room to grow', body: 'Multiple WhatsApp numbers routed per product, staff accounts, your own domain, QR codes for your physical shop, and referral credit when you bring other sellers.' },
];

const HOW: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Open your store', body: 'Register, pick a plan (Free activates instantly), add your WhatsApp number. Two minutes, no card for Free.' },
  { n: '2', title: 'Stock the shelves', body: 'Add items with photos and prices — one by one, or import a whole catalogue by CSV. Publish when ready.' },
  { n: '3', title: 'Share & get leads', body: 'Drop your link in WhatsApp groups and Status. Buyers tap through to a pre-written chat; you close the deal where you always have.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Do buyers pay through CyberShop?', a: 'No — and that is deliberate. Buyers pay you directly after inspecting, the way Nigerian commerce already works. CyberShop never takes buyer money, so there is no checkout fee skimming your sale. (An optional add-on lets you record a deposit on an ad; even then, we never hold cash like a bank.)' },
  { q: 'How do I pay for a paid plan?', a: 'By bank transfer (upload proof; an admin verifies it) or instantly by Paystack. The Free plan needs no payment at all and activates immediately.' },
  { q: 'What happens when my plan expires?', a: 'You get a grace period with warnings, not a sudden shutdown. Your storefront stays yours; renew any time to restore full reach.' },
  { q: 'Can I use my own domain?', a: 'Yes, on plans that include it — point your DNS at us, we verify it, and your storefront answers on your domain.' },
  { q: 'I already sell on WhatsApp. Why do I need this?', a: 'Because Status disappears in 24 hours and a chat thread is not a catalogue. CyberShop is the permanent, searchable, shareable version of what you already post — with leads tracked instead of lost.' },
];

export default async function SellPage() {
  let data: SellOut = FALLBACK;
  let live = true;
  try {
    data = await api<SellOut>('/public/plans', { ip: await clientIp(), revalidate: TAXONOMY_REVALIDATE });
    if (!data.plans?.length) data = FALLBACK;
  } catch {
    live = false;
    data = FALLBACK;
  }

  return (
    <>
      <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
        <div className="container">
          <Reveal>
            <span className="eyebrow">For businesses</span>
            <h1 style={{ maxWidth: '18ch' }}>
              Sell where your customers already are: <em>WhatsApp</em>
            </h1>
            <p style={{ color: 'var(--ink-dim)', maxWidth: '58ch' }}>
              CyberShop gives your business a professional storefront and catalogue that buyers can
              find on the web — and every enquiry arrives as a WhatsApp conversation, pre-written,
              with the item and price included. Free to start.
            </p>
            <div className="cta-actions" style={{ marginTop: 22 }}>
              <a className="btn btn-gold sheen big" href="/register">Open your store — free</a>
              <a className="btn btn-ghost big" href="/help#selling">Read the seller guides</a>
              <a className="btn btn-ghost big" href="/businesses">See live stores first</a>
            </div>
            {!live && (
              <p style={{ color: 'var(--ink-faint)', marginTop: 14 }} role="status">
                Showing standard plans while the live catalogue wakes up — final prices are confirmed at sign-up.
              </p>
            )}
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">How selling works</span>
                <h2>Three steps to your <em>first lead</em></h2>
              </div>
            </div>
          </Reveal>
          <div className="cine-acts">
            {HOW.map((s, i) => (
              <Reveal key={s.n} i={i}>
                <article className="cine-act">
                  <span className="cine-act-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">What you get</span>
                <h2>Built for the <em>whole sale</em></h2>
              </div>
            </div>
          </Reveal>
          <div className="sell-features">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} i={i % 3}>
                <article className="card sell-feature">
                  <span className="sell-feature-icon" aria-hidden>{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">Pricing</span>
                <h2>Start free. Pay for <em>reach</em></h2>
              </div>
            </div>
            <p style={{ color: 'var(--ink-dim)', maxWidth: '58ch' }}>
              Every plan includes the storefront, WhatsApp enquiries and the leads inbox.
              Pay by bank transfer or Paystack — no card required to start.
            </p>
          </Reveal>
          <div className="sell-plans">
            {data.plans.map((p, i) => (
              <Reveal key={p.slug} i={i % 4}>
                <article className={`card sell-plan${p.slug === 'free' ? ' is-free' : ''}`}>
                  <h3>{p.name}</h3>
                  <p className="sell-price">
                    {p.price_display}
                    {p.price_kobo > 0 && <span className="sell-per"> / {p.interval === 'once' ? 'one-off' : p.interval}</span>}
                  </p>
                  {p.description && <p className="sell-desc">{p.description}</p>}
                  <ul className="sell-list">
                    {p.features.map((f) => (
                      <li key={f}>✓ {f}</li>
                    ))}
                  </ul>
                  <a className={`btn ${p.slug === 'free' ? 'btn-gold sheen' : 'btn-ghost'}`} href="/register">
                    {p.slug === 'free' ? 'Start free' : `Choose ${p.name}`}
                  </a>
                </article>
              </Reveal>
            ))}
          </div>

          {data.addons.length > 0 && (
            <>
              <Reveal>
                <h3 style={{ marginTop: 36 }}>Add-ons, only when you need them</h3>
              </Reveal>
              <div className="sell-addons">
                {data.addons.map((a) => (
                  <div key={a.slug} className="sell-addon">
                    <strong>{a.name}</strong>
                    <span>{a.price_display}</span>
                    {a.description && <p>{a.description}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <Reveal>
            <div className="section-head">
              <div>
                <span className="eyebrow">Questions</span>
                <h2>Before you <em>ask on WhatsApp</em></h2>
              </div>
            </div>
          </Reveal>
          <div className="sell-faq">
            {FAQ.map((f) => (
              <details key={f.q} className="sell-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <Reveal>
            <div className="cine-manifesto" style={{ marginTop: 40 }}>
              <h2>Your first listing could be <em>live today</em></h2>
              <p>Free plan, two minutes, no card. Your customers are already on WhatsApp — meet them with a shop, not a Status post.</p>
              <div className="cta-actions">
                <a className="btn btn-gold sheen big" href="/register">Open your store — free</a>
                <a className="btn btn-ghost big" href="/">Walk the market first</a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
