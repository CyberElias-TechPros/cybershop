'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { capi, extractError } from '@/lib/client-api';

interface Payment {
  id: number;
  reference: string;
  kind: string;
  amount: number;
  amount_display: string;
  method: string;
  status: string;
  rejection_reason: string | null;
  business_name: string;
  business_slug: string;
  vendor_email: string;
  has_proof: boolean;
  plan_name: string | null;
  addon_name: string | null;
  submitted_at: string | null;
  created_at: string;
}

const FILTERS = ['all', 'submitted', 'reviewing', 'pending', 'approved', 'rejected', 'refunded', 'failed'];

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState('submitted');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ payments: Payment[]; total: number }>(`/admin/payments?status=${status}`);
      setPayments(d.payments);
      setTotal(d.total);
    } catch (e) {
      setError(extractError(e));
    }
  }, [status]);
  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: number) {
    if (!confirm('Approve this payment? The vendor’s plan activates immediately.')) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/payments/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setNotice('Payment approved — vendor activated.');
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function refund(id: number) {
    const reason = prompt('Refund note (min 5 chars). CyberShop does not move the money — confirm you already returned it.', 'Returned to the vendor.');
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError('Refund note must be at least 5 characters.');
      return;
    }
    if (!confirm('Mark this payment refunded? The store stays live unless you also revoke the subscription.')) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const d = await capi<{ message: string }>(`/admin/payments/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
      setNotice(d.message);
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    const reason = prompt('Rejection reason (min 5 chars, sent to the vendor):', 'Amount received does not match.');
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError('Rejection reason must be at least 5 characters.');
      return;
    }
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await capi(`/admin/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      setNotice('Payment rejected — vendor notified with the reason.');
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
        <h1>Payments queue</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }} role="status" aria-live="polite">{total} in view</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      <div className="biz-cats" style={{ marginBottom: 16 }}>
        {FILTERS.map((s) => (
          <span key={s} className="chip">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setStatus(s);
              }}
              style={{ color: status === s ? '#fff' : undefined, background: status === s ? 'var(--green)' : undefined, display: 'inline-block', borderRadius: 999 }}
            >
              {s}
            </a>
          </span>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className="empty">
          <h2>Nothing here</h2>
          <p>No {status !== 'all' ? status : ''} payments. {status !== 'submitted' ? 'Check the "submitted" tab for the review queue.' : 'New bank-transfer proofs will appear here.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {payments.map((p) => (
            <div className="card panel" key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div>
                  <Link href={`/business/${p.business_slug}`}>{p.business_name}</Link>
                  <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}> · {p.vendor_email}</span>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {p.kind === 'activation' ? 'Plan activation' : p.kind === 'subscription_renewal' ? 'Subscription renewal' : 'Add-on'} · {p.plan_name || p.addon_name || ''} ·{' '}
                    {p.method === 'paystack' ? 'Paystack' : 'Bank transfer'} · ref <span style={{ fontFamily: 'monospace' }}>{p.reference}</span> · {new Date(p.created_at).toLocaleString('en-NG')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{p.amount_display}</div>
                  <span className={`status-pill ${p.status}`}>{p.status}</span>
                </div>
              </div>
              {p.rejection_reason && (
                <div style={{ fontSize: '0.85rem', color: 'var(--danger)', marginTop: 6 }}>Rejected: {p.rejection_reason}</div>
              )}
              {p.has_proof && (
                <div style={{ margin: '10px 0 0' }}>
                  <a className="mini-btn" href={`/api/admin/payments/${p.id}/proof`} target="_blank" rel="noopener">
                    📄 View transfer proof
                  </a>
                </div>
              )}
              {p.status === 'approved' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost" style={{ padding: '9px 18px' }} disabled={busyId === p.id} onClick={() => refund(p.id)}>
                    Mark refunded
                  </button>
                </div>
              )}
              {['submitted', 'reviewing', 'pending'].includes(p.status) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" style={{ padding: '9px 18px' }} disabled={busyId === p.id} onClick={() => approve(p.id)}>
                    {busyId === p.id ? 'Working…' : '✓ Approve & activate'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '9px 18px', color: 'var(--danger)' }} disabled={busyId === p.id} onClick={() => reject(p.id)}>
                    ✕ Reject with reason
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
