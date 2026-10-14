'use client';

import { useEffect, useState } from 'react';
import { adHref, listRecent, type SavedAd } from '@/lib/saved';

/**
 * "Continue looking" — listings this browser recently opened (localStorage,
 * recorded by MarketActions on every item page). Renders nothing for a
 * first-time visitor, so the shop never shows an empty personalised rail.
 */
export default function RecentRail() {
  const [recent, setRecent] = useState<SavedAd[]>([]);

  useEffect(() => {
    const sync = () => setRecent(listRecent().slice(0, 8));
    sync();
    window.addEventListener('cs-saved', sync);
    return () => window.removeEventListener('cs-saved', sync);
  }, []);

  if (recent.length === 0) return null;

  return (
    <section className="section shop-rail" aria-label="Recently viewed">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Welcome back</span>
            <h2>Continue <em>looking</em></h2>
          </div>
          <a href="/saved">Saved &amp; recent →</a>
        </div>
        <div className="recent-row">
          {recent.map((ad) => (
            <a key={ad.listing_id} className="recent-card" href={adHref(ad)}>
              <span className="recent-img" aria-hidden="true">
                {ad.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ad.image} alt="" loading="lazy" decoding="async" />
                ) : '🏷️'}
              </span>
              <span className="recent-body">
                <span className="recent-price">{ad.price_display}</span>
                <span className="recent-name">{ad.name}</span>
                <span className="recent-meta">{ad.biz_name}{ad.city ? ` · ${ad.city}` : ''}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
