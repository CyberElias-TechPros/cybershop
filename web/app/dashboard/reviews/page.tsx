'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  rating: number;
  body: string | null;
  vendor_reply: string | null;
  status: string;
  buyer_name: string;
  item_name: string | null;
}

export default function VendorReviews() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    capi<{ reviews: Row[] }>('/vendor/reviews').then((d) => setRows(d.reviews)).catch((e) => setError(extractError(e)));
  }, []);
  return (
    <div>
      <div className="dash-head"><h1>Reviews</h1></div>
      <p style={{ color: 'var(--muted)' }}>Only buyers who enquired can review you. Reply in public — you cannot edit their rating.</p>
      {error && <div className="form-msg error">{error}</div>}
      {rows.length === 0 ? <p>No reviews yet.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => (
            <article key={r.id} className="card panel">
              <strong>{r.rating}★ · {r.buyer_name}</strong>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{r.item_name || 'Store'} · {r.status}</div>
              <p>{r.body}</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const reply = new FormData(e.currentTarget).get('reply');
                  try {
                    await capi(`/vendor/reviews/${r.id}`, { method: 'PUT', body: JSON.stringify({ vendor_reply: reply }) });
                    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, vendor_reply: String(reply) } : x)));
                  } catch (err) { setError(extractError(err)); }
                }}
              >
                <label className="field">Your reply
                  <textarea className="textarea" name="reply" required minLength={2} defaultValue={r.vendor_reply || ''} />
                </label>
                <button className="btn btn-ghost" type="submit">Publish reply</button>
              </form>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
