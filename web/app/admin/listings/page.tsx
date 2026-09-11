'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Listing {
  id: number;
  name: string;
  slug: string;
  status: string;
  price: number | null;
  business_name: string;
  biz_slug: string;
  type_name: string;
  url_segment: string;
  published_at: string | null;
}

const naira = (kobo: number | null) => (kobo === null ? '—' : `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`);

export default function AdminListingsPage() {
  const [q, setQ] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ listings: Listing[] }>(`/admin/listings?status=published&q=${encodeURIComponent(q)}`);
      setListings(d.listings);
    } catch (e) {
      setError(extractError(e));
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function archive(id: number, name: string) {
    if (!confirm(`Archive "${name}"? It disappears from the public site immediately.`)) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/listings/${id}/archive`, { method: 'POST', body: JSON.stringify({}) });
      setNotice('Listing archived.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head">
        <h1>Listings oversight</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 300 }} type="search" placeholder="Search listings or businesses…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {listings.length === 0 ? (
        <div className="empty">
          <h2>No published listings found</h2>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Business</th>
                <th>Type</th>
                <th>Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/business/${l.biz_slug}/${l.url_segment}/${l.slug}`}>{l.name}</Link>
                  </td>
                  <td>{l.business_name}</td>
                  <td>{l.type_name}</td>
                  <td>{naira(l.price)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="mini-btn danger" disabled={busyId === l.id} onClick={() => archive(l.id, l.name)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
