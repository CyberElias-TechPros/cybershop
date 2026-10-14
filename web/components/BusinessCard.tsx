import type { BusinessOut } from '@/lib/types';
import { initials, location } from '@/lib/ui';

export default function BusinessCard({ b, featured = false }: { b: BusinessOut; featured?: boolean }) {
  const rating = b.reviews && b.reviews.count > 0 && b.reviews.average != null ? b.reviews : null;
  return (
    <a
      className={`card tilt${featured ? ' biz-featured' : ''}`}
      href={`/business/${b.slug}`}
      style={{ color: 'inherit' }}
      data-flip={`biz:${b.slug}`}
      data-flip-src=""
      aria-label={`${b.name}${location(b) ? ' — ' + location(b) : ''}`}
    >
      <div className="biz-thumb">
        <span className="skel" aria-hidden="true" />
        {b.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.cover.url} alt="" loading="lazy" decoding="async" />
        ) : b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logo.url} alt={b.logo.alt} loading="lazy" decoding="async" style={{ objectFit: 'contain', padding: 18 }} />
        ) : (
          <div className="biz-initials" aria-hidden>
            {initials(b.name)}
          </div>
        )}
      </div>
      <div className="biz-body">
        <p className="biz-name">
          {b.name}
          {b.verification_status === 'verified' && (
            <span className="trust-chip trust-verified" style={{ marginLeft: 8 }} title="Verified ID — CyberShop has checked this seller's identity">
              ✓ Verified ID
            </span>
          )}
          {b.is_platform_owner && (
            <span className="trust-chip" style={{ marginLeft: 8 }} title="Run by the CyberShop team">
              Official store
            </span>
          )}
        </p>
        {location(b) && <p className="biz-loc">{location(b)}</p>}
        <p className="biz-stats">
          {typeof b.listing_count === 'number' && (
            <span>{b.listing_count} listing{b.listing_count === 1 ? '' : 's'}</span>
          )}
          {rating && (
            <span aria-label={`Rated ${rating.average} out of 5 from ${rating.count} reviews`}>
              {' · '}★ {rating.average} ({rating.count})
            </span>
          )}
        </p>
        <div className="biz-cats" aria-hidden="true">
          {b.categories.slice(0, 3).map((c) => (
            <span className="chip" key={c.slug}>
              {c.name}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}
