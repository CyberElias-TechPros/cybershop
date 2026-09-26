'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';
import { listSaved } from '@/lib/saved';

interface Card {
  listing_id: number;
  name: string;
  price_display: string;
  image: string | null;
  biz_name: string;
  biz_slug: string;
  url_segment: string;
  slug: string;
  city: string | null;
  unavailable?: boolean;
}

function Grid({ ads, onRemove }: { ads: Card[]; onRemove?: (id: number) => void }) {
  if (!ads.length) return <p style={{ color: 'var(--muted)' }}>Nothing here yet.</p>;
  return (
    <div className="grid grid-items">
      {ads.map((ad) => (
        <div className="card listing-card" key={ad.listing_id}>
          <a className="item-name" href={`/business/${ad.biz_slug}/${ad.url_segment}/${ad.slug}`}>{ad.name}</a>
          <p className="listing-meta">{ad.price_display} · {ad.biz_name}{ad.unavailable ? ' · unavailable' : ''}</p>
          {onRemove && (
            <button type="button" className="mact" onClick={() => onRemove(ad.listing_id)}>Remove</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SavedAccount() {
  const [saved, setSaved] = useState<Card[]>([]);
  const [recent, setRecent] = useState<Card[]>([]);
  const [stores, setStores] = useState<{ id: number; name: string; slug: string; city: string | null }[]>([]);
  const [error, setError] = useState('');

  async function load() {
    const localIds = listSaved().map((s) => s.listing_id);
    if (localIds.length) {
      await capi('/account/favorites/sync', { method: 'POST', body: JSON.stringify({ listing_ids: localIds }) }).catch(() => undefined);
    }
    const [f, r, b] = await Promise.all([
      capi<{ favorites: Card[] }>('/account/favorites'),
      capi<{ recent: Card[] }>('/account/recent'),
      capi<{ businesses: { id: number; name: string; slug: string; city: string | null }[] }>('/account/businesses'),
    ]);
    setSaved(f.favorites);
    setRecent(r.recent);
    setStores(b.businesses);
  }

  useEffect(() => {
    load().catch((e) => setError(extractError(e)));
  }, []);

  return (
    <div>
      <div className="dash-head"><h1>Saved & recently viewed</h1></div>
      {error && <div className="form-msg error">{error}</div>}
      <p style={{ color: 'var(--muted)' }}>Saved on this device is copied into your account so it follows you.</p>
      <h2>Saved stores</h2>
      {stores.length === 0 ? <p style={{ color: 'var(--muted)' }}>No stores saved yet.</p> : (
        <ul>
          {stores.map((s) => (
            <li key={s.id}>
              <a href={`/business/${s.slug}`}>{s.name}</a>{s.city ? ` · ${s.city}` : ''}{' '}
              <button type="button" className="mini-btn" onClick={async () => { await capi(`/account/businesses/${s.id}`, { method: 'DELETE' }); setStores((xs) => xs.filter((x) => x.id !== s.id)); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <h2>Saved</h2>
      <Grid ads={saved} onRemove={async (id) => { await capi(`/account/favorites/${id}`, { method: 'DELETE' }); setSaved((s) => s.filter((x) => x.listing_id !== id)); }} />
      <h2 style={{ marginTop: 28 }}>Recently viewed</h2>
      <Grid ads={recent} />
    </div>
  );
}
