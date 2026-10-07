import type { MarketListing } from '@/lib/types';
import { initials } from '@/lib/ui';

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
        {it.boosted && <span className="trust-chip">Boosted</span>}
        {it.verified && <span className="trust-chip">Verified</span>}
      </div>
      <div className="item-body">
        <div className="item-price">{it.price_display}</div>
        <p className="item-name">{it.name}</p>
        <p className="listing-meta">
          <span className="listing-avatar" aria-hidden="true">
            {it.biz_logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.biz_logo} alt="" loading="lazy" />
            ) : (
              <span className="listing-avatar-fallback">{initials(it.biz_name)}</span>
            )}
          </span>
          <span className="listing-seller">
            {it.biz_name}
            {it.city ? ` · ${it.city}` : ''}
          </span>
        </p>
      </div>
    </a>
  );
}
