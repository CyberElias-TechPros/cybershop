import type { MarketListing } from '@/lib/types';

export default function ListingCard({ it }: { it: MarketListing }) {
  const href = `/business/${it.biz_slug}/${it.url_segment}/${it.slug}`;
  return (
    <a className="card listing-card tilt" href={href} style={{ color: 'inherit' }} aria-label={`${it.name} — ${it.price_display}`}>
      <div className="item-img">
        <span className="skel" aria-hidden="true" />
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image} alt="" loading="lazy" />
        ) : (
          <div className="no-img" aria-hidden>
            🏷️
          </div>
        )}
        {it.verified && <span className="trust-chip">Verified</span>}
      </div>
      <div className="item-body">
        <div className="item-price">{it.price_display}</div>
        <p className="item-name">{it.name}</p>
        <p className="listing-meta">
          {it.biz_name}
          {it.city ? ` · ${it.city}` : ''}
        </p>
      </div>
    </a>
  );
}
