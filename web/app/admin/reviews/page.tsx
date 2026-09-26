'use client';

import { useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  rating: number;
  body: string | null;
  status: string;
  business_name: string;
  buyer_email: string;
  item_name: string | null;
}

export default function AdminReviews() {
  const [status, setStatus] = useState('published');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  async function load(next = status) {
    const d = await capi<{ reviews: Row[] }>(`/admin/reviews?status=${next}`);
    setRows(d.reviews);
  }
  useEffect(() => { load().catch((e) => setError(extractError(e))); }, []);

  return (
    <div>
      <div className="dash-head">
        <h1>Reviews</h1>
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); load(e.target.value).catch((err) => setError(extractError(err))); }}>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>
      <p style={{ color: 'var(--muted)' }}>Only enquiry-backed reviews can be published. Hide anything abusive — never edit the rating.</p>
      {error && <div className="form-msg error">{error}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => (
          <article key={r.id} className="card panel">
            <strong>{r.rating}★ · {r.business_name}</strong>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{r.buyer_email}{r.item_name ? ` · ${r.item_name}` : ''}</div>
            <p>{r.body}</p>
            {r.status === 'published' ? (
              <button className="mini-btn danger" type="button" onClick={async () => { await capi(`/admin/reviews/${r.id}/hide`, { method: 'POST', body: '{}' }); setRows((xs) => xs.filter((x) => x.id !== r.id)); }}>Hide</button>
            ) : (
              <button className="mini-btn" type="button" onClick={async () => { await capi(`/admin/reviews/${r.id}/restore`, { method: 'POST', body: '{}' }); setRows((xs) => xs.filter((x) => x.id !== r.id)); }}>Restore</button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
