'use client';

import { useCallback, useEffect, useState } from 'react';
import { capi, extractError } from '@/lib/client-api';

interface Discrepancy {
  kind: 'missing_on_paystack' | 'amount_mismatch' | 'missing_locally' | 'status_mismatch';
  reference: string;
  local_amount_kobo: number | null;
  paystack_amount_kobo: number | null;
  local_status: string | null;
  paystack_status: string | null;
  payment_id: number | null;
  created_at: string | null;
  note: string;
}
interface Reconciliation {
  ok: boolean;
  available: boolean;
  reason?: string;
  from: string;
  to: string;
  checked: number;
  matched: number;
  paystack_count: number;
  discrepancies: Discrepancy[];
  totals: { local_approved_kobo: number; paystack_success_kobo: number };
}

const KIND_LABEL: Record<string, string> = {
  missing_on_paystack: 'No Paystack transaction',
  amount_mismatch: 'Amount differs',
  missing_locally: 'Money with no payment row',
  status_mismatch: 'Status differs',
};

const ngn = (kobo: number | null) => (kobo === null ? '—' : `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`);

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 86400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Admin → Reconciliation.
 *
 * Paystack is the source of truth for money and this database is the source of
 * truth for subscriptions. They are two ledgers kept by two systems, and the
 * whole point of this screen is the days they disagree.
 */
export default function ReconciliationPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<Reconciliation | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await capi<{ reconciliation: Reconciliation }>(`/admin/reconciliation?from=${from}&to=${to}`);
      setData(d.reconciliation);
      setError('');
    } catch (e) {
      setError(extractError(e));
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const difference =
    (data?.totals.local_approved_kobo ?? 0) - (data?.totals.paystack_success_kobo ?? 0);

  return (
    <div>
      <div className="dash-head">
        <h1>Reconciliation</h1>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Paystack vs. this database</span>
      </div>
      {error && <div className="form-msg error">{error}</div>}

      <div className="card panel">
        <div className="filter-row">
          <label className="field" style={{ margin: 0 }}>
            <span className="label">From</span>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="label">To</span>
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <a
            className="btn btn-ghost"
            // Same-origin: the Next.js proxy attaches the Worker's internal
            // secret, so the CSV rides the admin's own session cookie.
            href={`/api/admin/reconciliation?from=${from}&to=${to}&format=csv`}
            download={`cybershop-reconciliation-${from}_${to}.csv`}
          >
            Export CSV
          </a>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 10 }}>
          Paystack settles in kobo; this table shows naira. Daily at 03:00 the platform reconciles yesterday and
          notifies every admin if anything is off.
        </p>
      </div>

      {!data ? (
        <div className="empty">
          <h2>Checking…</h2>
        </div>
      ) : !data.available ? (
        <div className="empty">
          <h2>Nothing to reconcile against</h2>
          <p>{data.reason}</p>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="card panel stat">
              <span className="stat-label">Checked</span>
              <strong>{data.checked}</strong>
              <span className="stat-sub">Paystack payments in range</span>
            </div>
            <div className="card panel stat">
              <span className="stat-label">Matched</span>
              <strong style={{ color: 'var(--em)' }}>{data.matched}</strong>
              <span className="stat-sub">agreed on amount and status</span>
            </div>
            <div className="card panel stat">
              <span className="stat-label">Discrepancies</span>
              <strong style={{ color: data.discrepancies.length ? 'var(--gold)' : 'var(--em)' }}>
                {data.discrepancies.length}
              </strong>
              <span className="stat-sub">{data.paystack_count} Paystack transactions</span>
            </div>
            <div className="card panel stat">
              <span className="stat-label">Difference</span>
              <strong style={{ color: difference === 0 ? 'var(--em)' : '#ff8a80' }}>
                {difference === 0 ? '₦0.00' : ngn(Math.abs(difference))}
              </strong>
              <span className="stat-sub">
                {difference === 0 ? 'books agree' : difference > 0 ? 'we recorded more than settled' : 'settled more than recorded'}
              </span>
            </div>
          </div>

          {data.discrepancies.length === 0 ? (
            <div className="empty">
              <h2>All clear ✅</h2>
              <p>
                Every Paystack payment recorded between {from} and {to} agrees with what Paystack settled:{' '}
                {ngn(data.totals.paystack_success_kobo)}.
              </p>
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>What</th>
                    <th>Recorded</th>
                    <th>Settled</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.discrepancies.map((d) => (
                    <tr key={`${d.kind}-${d.reference}`}>
                      <td>
                        <code>{d.reference}</code>
                        {d.payment_id ? <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>payment #{d.payment_id}</div> : null}
                      </td>
                      <td>
                        <span className={`sla-pill ${d.kind === 'missing_on_paystack' ? 'ok' : 'danger'}`}>
                          {KIND_LABEL[d.kind] ?? d.kind}
                        </span>
                      </td>
                      <td>{ngn(d.local_amount_kobo)}</td>
                      <td>{ngn(d.paystack_amount_kobo)}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {d.local_status ?? '—'} / {d.paystack_status ?? '—'}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
