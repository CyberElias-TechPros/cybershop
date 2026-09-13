'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  business_name: string;
  business_slug: string;
  note: string | null;
  status: string;
  created_at: string;
  image: { url: string } | null;
}

export default function AdminVerificationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ requests: Row[] }>('/admin/verifications?status=pending');
      setRows(d.requests);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: 'approve' | 'reject') {
    let body = '{}';
    if (action === 'reject') {
      const note = prompt('Reason shown to the vendor:', 'ID could not be verified.');
      if (note === null) return;
      body = JSON.stringify({ note });
    }
    setBusyId(id);
    try {
      await capi(`/admin/verifications/${id}/${action}`, { method: 'POST', body });
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
        <h1>Verified ID queue</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {rows.length === 0 ? (
        <div className="empty">
          <h2>Nothing pending</h2>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => (
            <div className="card panel" key={r.id}>
              <strong>{r.business_name}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>/{r.business_slug}</div>
              {r.note && <p>{r.note}</p>}
              {r.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image.url} alt="" style={{ maxWidth: 280, borderRadius: 8 }} />
              )}
              <div className="row-actions">
                <button className="mini-btn" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}>
                  Approve
                </button>
                <button className="mini-btn danger" disabled={busyId === r.id} onClick={() => act(r.id, 'reject')}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
