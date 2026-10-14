import './help.css';
import type { Metadata } from 'next';
import HelpIndex from '@/components/HelpIndex';
import { GUIDE_GROUPS, GUIDES } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Help Centre — how to use CyberShop',
  description:
    'Step-by-step guides for everything on CyberShop: buying safely, opening a storefront, catalogues, leads, plans, verification, security and running the platform.',
};

export default function HelpPage() {
  const summaries = GUIDES.map(({ slug, title, icon, audience, summary, minutes, keywords }) => ({
    slug, title, icon, audience, summary, minutes, keywords,
  }));

  return (
    <main>
      <section className="section wrap help-hero">
        <div className="container">
          <p className="cine-kicker"><span className="pulse-dot" aria-hidden /> Help Centre</p>
          <h1 className="shop-title">How can we <em>help?</em></h1>
          <p className="shop-sub">
            Plain-language guides for every part of CyberShop — buying, selling, your account,
            and running the platform. New here? Start with{' '}
            <a href="/help/getting-started">how CyberShop works</a> or{' '}
            <a href="/help/open-storefront">open your storefront</a>.
          </p>
          <nav className="help-jumps" aria-label="Jump to a section">
            {GUIDE_GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`}>{g.title}</a>
            ))}
          </nav>
        </div>
      </section>

      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div className="container">
          <HelpIndex guides={summaries} />
          <div className="help-stuck card">
            <div>
              <h2>Still stuck?</h2>
              <p>Real humans, on the record. Support answers account, payment and safety questions — and reports go straight to moderation.</p>
            </div>
            <div className="help-stuck-actions">
              <a className="btn btn-gold sheen" href="/contact">Contact Support</a>
              <a className="btn btn-ghost" href="/safety">Safety guide</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
