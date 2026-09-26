'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Row {
  id: number;
  status: string;
  expires_at: string | null;
  business_name: string;
  business_status: string;
  plan_name: string;
  owner_email: string;
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ subscriptions: Row[] }>('/admin/subscriptions');
      setRows(d.subscriptions);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function extend(r: Row) {
    const raw = prompt(`Extend ${r.business_name} by how many days? (1–365)`, '30');
    if (raw === null || !/^\d+$/.test(raw)) return;
    setBusyId(r.id);
    setError('');
    setNotice('');
    try {
      const d = await capi<{ expires_at: string }>(`/admin/subscriptions/${r.id}/extend`, { method: 'POST', body: JSON.stringify({ days: Number(raw) }) });
      setNotice(`${r.business_name} now runs until ${d.expires_at.slice(0, 10)}. A suspended store stays hidden.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(r: Row) {
    const note = prompt('Why is this plan being revoked? The catalogue stays; the storefront goes dark.', 'Plan revoked by admin.');
    if (note === null) return;
    if (note.trim().length < 5) {
      setError('The note must be at least 5 characters.');
      return;
    }
    setBusyId(r.id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/subscriptions/${r.id}/revoke`, { method: 'POST', body: JSON.stringify({ note }) });
      setNotice(`${r.business_name} is hidden from buyers.`);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-head"><h1>Subscriptions</h1><span className="dash-sub">Extend a term, or revoke it. Revoke hides the store. It does not delete the catalogue.</span></div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Store</th><th>Plan</th><th>Sub</th><th>Store status</th><th>Expires</th><th>Owner</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.business_name}</td>
                <td>{r.plan_name}</td>
                <td>{r.status}</td>
                <td>{r.business_status}</td>
                <td>{r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-NG') : '—'}</td>
                <td>{r.owner_email}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="mini-btn" disabled={busyId === r.id} onClick={() => extend(r)}>Extend</button>
                    {r.status !== 'cancelled' && (
                      <button type="button" className="mini-btn danger" disabled={busyId === r.id} onClick={() => revoke(r)}>Revoke</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
