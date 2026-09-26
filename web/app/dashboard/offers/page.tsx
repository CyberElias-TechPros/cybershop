'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Offer {
  id: number;
  title: string;
  description: string | null;
  kind: string;
  value: number | null;
  is_active: number;
  ends_at: string | null;
  item_name: string | null;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('percent_off');
  const [value, setValue] = useState('10');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const d = await capi<{ offers: Offer[] }>('/vendor/offers');
    setOffers(d.offers);
  }
  useEffect(() => { load().catch((e) => setError(extractError(e))); }, []);

  return (
    <div>
      <div className="dash-head"><h1>Offers</h1></div>
      <p style={{ color: 'var(--muted)' }}>Shown on your storefront. This is a promotion, not a checkout discount — the buyer still agrees the price on WhatsApp.</p>
      {error && <div className="form-msg error">{error}</div>}
      <form
        className="card panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            await capi('/vendor/offers', { method: 'POST', body: JSON.stringify({ title, kind, value: kind === 'amount_off' ? Math.round(Number(value) * 100) : Number(value), description: description || null }) });
            setTitle('');
            setDescription('');
            await load();
          } catch (err) { setError(extractError(err)); }
        }}
      >
        <div className="form-row">
          <label className="field">Title<input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field">Kind
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="percent_off">Percent off</option>
              <option value="amount_off">Amount off (₦)</option>
              <option value="bundle">Bundle</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="field">Value<input className="input" value={value} onChange={(e) => setValue(e.target.value)} /></label>
        </div>
        <label className="field">Details<textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit">Publish offer</button>
      </form>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {offers.map((o) => (
          <article key={o.id} className="card panel" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>{o.title}</strong>
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{o.kind}{o.item_name ? ` · ${o.item_name}` : ''} · {o.is_active ? 'live' : 'paused'}</div>
            </div>
            <button className="mini-btn danger" type="button" onClick={async () => { await capi(`/vendor/offers/${o.id}`, { method: 'DELETE' }); setOffers((xs) => xs.filter((x) => x.id !== o.id)); }}>Remove</button>
          </article>
        ))}
      </div>
    </div>
  );
}
