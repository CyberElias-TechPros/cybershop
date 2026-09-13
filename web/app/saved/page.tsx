'use client';

import { useEffect, useState } from 'react';
import { adHref, listRecent, listSaved, removeSaved, type SavedAd } from '@/lib/saved';

function Grid({ ads, onRemove }: { ads: SavedAd[]; onRemove?: (id: number) => void }) {
  if (ads.length === 0) return null;
  return (
    <div className="grid grid-items">
      {ads.map((ad) => (
        <div className="card listing-card" key={ad.listing_id}>
          <a href={adHref(ad)} className="item-img" style={{ color: 'inherit' }}>
            {ad.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.image} alt="" />
            ) : (
              <div className="no-img" aria-hidden>
                🏷️
              </div>
            )}
          </a>
          <div className="item-body">
            <div className="item-price">{ad.price_display}</div>
            <a className="item-name" href={adHref(ad)}>
              {ad.name}
            </a>
            <p className="listing-meta">
              {ad.biz_name}
              {ad.city ? ` · ${ad.city}` : ''}
            </p>
            {onRemove && (
              <button type="button" className="mact" onClick={() => onRemove(ad.listing_id)}>
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedAd[]>([]);
  const [recent, setRecent] = useState<SavedAd[]>([]);

  useEffect(() => {
    const sync = () => {
      setSaved(listSaved());
      setRecent(listRecent());
    };
    sync();
    window.addEventListener('cs-saved', sync);
    return () => window.removeEventListener('cs-saved', sync);
  }, []);

  return (
    <section className="section" style={{ paddingTop: 'clamp(36px, 6vw, 64px)' }}>
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Your shortlist</span>
            <h1>
              Saved ads &amp; <em>recently viewed</em>
            </h1>
          </div>
        </div>
        <p style={{ color: 'var(--ink-dim)', maxWidth: '52ch' }}>
          Stays on this device — no account required. When you’re ready, open WhatsApp from the
          listing. CyberShop never checks you out.
        </p>

        <h2 className="saved-h">Saved ({saved.length})</h2>
        {saved.length === 0 ? (
          <p style={{ color: 'var(--ink-faint)' }}>
            Tap ♡ Save on any ad. Or <a href="/listings">browse listings</a>.
          </p>
        ) : (
          <Grid ads={saved} onRemove={(id) => removeSaved(id)} />
        )}

        <h2 className="saved-h" style={{ marginTop: 40 }}>
          Recently viewed
        </h2>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--ink-faint)' }}>Listings you open will show up here.</p>
        ) : (
          <Grid ads={recent} />
        )}
      </div>
    </section>
  );
}
