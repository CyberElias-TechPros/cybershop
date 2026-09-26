import { AuroraParallax } from '@/components/Motion';
import SearchForm from '@/components/SearchForm';

export default function NotFound() {
  return (
    <div className="notfound" style={{ position: 'relative', overflow: 'hidden' }}>
      <AuroraParallax />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <span className="face floaty" aria-hidden>
          🧭
        </span>
        <div className="code" aria-hidden>
          404
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 540, marginBottom: 8 }}>
          This page took a walk on WhatsApp
        </h1>
        <p style={{ color: 'var(--ink-faint)', maxWidth: '44ch', margin: '0 auto 26px' }}>
          The page you’re looking for doesn’t exist — or the business is no longer listed.
        </p>
        <div style={{ maxWidth: 480, margin: '0 auto 22px' }}>
          <SearchForm big initial="" />
        </div>
        <div className="cta-actions">
          <a className="btn btn-primary sheen" href="/">
            Back home
          </a>
          <a className="btn btn-ghost" href="/businesses">
            Browse businesses
          </a>
        </div>
      </div>
    </div>
  );
}
