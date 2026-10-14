import type { MarketListing } from '@/lib/types';
import { initials, timeAgo } from '@/lib/ui';
import SaveListingButton from './SaveListingButton';

/**
 * A shop card: photo, price, name, then the trust line a buyer actually
 * decides on — seller, city, rating (only when reviews exist), freshness,
 * availability. Badge hierarchy is deliberate and explained in /safety:
 * “Verified ID” (we checked who they are) outranks “Featured” (they paid
 * to be seen). The card is an <article> with a stretched link; Save is a
 * sibling button, never nested inside the anchor.
 */
export default function ListingCard({ it }: { it: MarketListing }) {
  const href = `/business/${it.biz_slug}/${it.url_segment}/${it.slug}`;
  const posted = timeAgo(it.published_at);
  const out = it.stock_status === 'out_of_stock';
  const rating = it.rating && it.rating.count > 0 && it.rating.average != null ? it.rating : null;

  return (
    <article className="card listing-card tilt">
      <a className="card-stretch" href={href} style={{ color: 'inherit' }} aria-label={`${it.name} — ${it.price_display} at ${it.biz_name}`}>
        <div className="item-img">
          <span className="skel" aria-hidden="true" />
          {it.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image} alt={it.name} width={640} height={480} loading="lazy" decoding="async" />
          ) : (
            <div className="no-img" aria-hidden>🏷️</div>
          )}
          <span className="card-badges">
            {it.verified && (
              <span className="trust-chip trust-verified" title="Verified ID — CyberShop has checked this seller's identity">
                ✓ Verified ID
              </span>
            )}
            {it.boosted && (
              <span className="trust-chip trust-featured" title="Featured — the seller paid to highlight this listing">
                Featured
              </span>
            )}
            {out && <span className="trust-chip trust-out">Out of stock</span>}
          </span>
        </div>
        <div className="item-body">
          <div className="item-price">
            {it.price_display}
            {it.price_type === 'negotiable' && <span className="price-note"> · negotiable</span>}
            {it.price_type === 'from' && <span className="price-note"> · from</span>}
          </div>
          <p className="item-name">{it.name}</p>
          {rating && (
            <p className="card-rating" aria-label={`Rated ${rating.average} out of 5 from ${rating.count} reviews`}>
              <span aria-hidden="true">★ {rating.average}</span>
              <span className="rating-count">({rating.count})</span>
            </p>
          )}
          <p className="listing-meta">
            <span className="listing-avatar" aria-hidden="true">
              {it.biz_logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.biz_logo} alt="" width={32} height={32} loading="lazy" decoding="async" />
              ) : (
                <span className="listing-avatar-fallback">{initials(it.biz_name)}</span>
              )}
            </span>
            <span className="listing-seller">
              {it.biz_name}
              {it.city ? ` · ${it.city}` : ''}
              {posted ? ` · ${posted}` : ''}
            </span>
          </p>
        </div>
      </a>
      <SaveListingButton
        ad={{
          listing_id: it.id, name: it.name, price_display: it.price_display, image: it.image,
          biz_name: it.biz_name, biz_slug: it.biz_slug, url_segment: it.url_segment, slug: it.slug, city: it.city,
        }}
      />
    </article>
  );
}
