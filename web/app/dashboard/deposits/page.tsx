'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Dep {
  id: number;
  reference: string;
  amount_display: string;
  status: string;
  buyer_name: string | null;
  item_name: string | null;
  created_at: string;
}

export default function DepositsPage() {
  const [rows, setRows] = useState<Dep[]>([]);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{ deposits: Dep[]; locked?: boolean; message?: string; disclaimer?: string }>('/vendor/deposits');
      setRows(d.deposits);
      setLocked(!!d.locked);
      setMessage(d.message ?? '');
      setDisclaimer(d.disclaimer ?? '');
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function release(id: number) {
    if (!confirm('Confirm you met the buyer and handed over the item? This only updates our record — CyberShop does not move bank funds.')) return;
    setBusyId(id);
    try {
      await capi(`/vendor/deposits/${id}/release`, { method: 'POST', body: JSON.stringify({}) });
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
        <h1>Deposits</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {disclaimer && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{disclaimer}</p>}
      {locked ? (
        <div className="empty">
          <h2>Deposits are a paid add-on</h2>
          <p>{message || 'Buy Deposits via Paystack. Buyers still pay you in person after WhatsApp — never through CyberShop unless you buy this.'}</p>
          <Link className="btn btn-primary" href="/dashboard/billing">
            Plan & billing
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <h2>No deposits yet</h2>
          <p>When a buyer pays a recorded deposit on one of your ads, it appears here.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Item</th>
                <th>Buyer</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.reference}</td>
                  <td>{d.item_name ?? '—'}</td>
                  <td>{d.buyer_name ?? '—'}</td>
                  <td>{d.amount_display}</td>
                  <td>
                    <span className={`status-pill ${d.status}`}>{d.status}</span>
                  </td>
                  <td>
                    {d.status === 'paid' && (
                      <button className="mini-btn" disabled={busyId === d.id} onClick={() => release(d.id)}>
                        Release
                      </button>
                    )}
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
