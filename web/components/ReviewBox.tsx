'use client';

import { useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

export default function ReviewBox({
  businessId,
  listingId,
  reviews,
}: {
  businessId: number;
  listingId: number;
  reviews?: {
    count: number;
    average: number | null;
    items?: { id: number; rating: number; title: string | null; body: string | null; vendor_reply: string | null; created_at: string; buyer_name: string }[];
  };
}) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const items = reviews?.items ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await capi<{ message: string }>('/account/reviews', {
        method: 'POST',
        body: JSON.stringify({ business_id: businessId, listing_id: listingId, rating, body }),
      });
      setMsg(r.message);
      setBody('');
    } catch (err) {
      setMsg(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card panel" style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>
        Reviews {reviews?.count ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {reviews.average} from {reviews.count}</span> : null}
      </h2>
      {items.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No reviews yet. Only people who actually enquired can leave one — we do not invent ratings.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 12 }}>
          {items.map((r) => (
            <li key={r.id}>
              <strong>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</strong> <span style={{ color: 'var(--muted)' }}>{r.buyer_name}</span>
              {r.body && <p style={{ margin: '4px 0' }}>{r.body}</p>}
              {r.vendor_reply && <p style={{ margin: 0, color: 'var(--muted)' }}>Seller: {r.vendor_reply}</p>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit}>
        <label className="field">
          Your rating
          <select className="select" value={rating} onChange={(e) => setRating(Number(e.target.value))} aria-label="Rating">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
            ))}
          </select>
        </label>
        <label className="field">
          What happened
          <textarea className="textarea" required minLength={8} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Only if you actually enquired with this seller." />
        </label>
        {msg && <p role="status">{msg}</p>}
        <button className="btn btn-ghost" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Publish review'}</button>
      </form>
    </div>
  );
}
