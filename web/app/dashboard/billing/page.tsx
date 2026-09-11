'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { capi, extractError, fmtNaira } from '@/lib/client-api';
import { haptic } from '@/lib/haptics';

interface Plan {
  id: number;
  name: string;
  slug: string;
  price: number;
  price_display: string;
  interval: string;
  features: { label: string }[] | string[] | null;
}
interface Addon {
  id: number;
  name: string;
  slug: string;
  type: string;
  price: number;
  price_display: string;
  duration_days: number;
}
interface Payment {
  id: number;
  reference: string;
  kind: string;
  amount: number;
  amount_display: string;
  method: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  created_at: string;
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [sub, setSub] = useState<{ plan_name: string | null; status: string | null; expires_at: string | null } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ bank: string; account_name: string; account_number: string }[]>([]);
  const [usage, setUsage] = useState<{
    storage_used_bytes: number;
    storage_limit_mb: number;
    listings_used: number;
    listings_limit: number;
    whatsapp_used: number;
    whatsapp_limit: number;
  } | null>(null);
  const [pending, setPending] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dzState, setDzState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [dzPct, setDzPct] = useState(0);
  const [dzDrag, setDzDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await capi<{
        plans: Plan[];
        addons: Addon[];
        subscription: { plan_name: string | null; status: string | null; expires_at: string | null } | null;
        payments: Payment[];
        bank_accounts: { bank: string; account_name: string; account_number: string }[];
        usage: {
          storage_used_bytes: number;
          storage_limit_mb: number;
          listings_used: number;
          listings_limit: number;
          whatsapp_used: number;
          whatsapp_limit: number;
        };
      }>('/vendor/plans');
      setPlans(d.plans);
      setAddons(d.addons);
      setSub(d.subscription);
      setPayments(d.payments);
      setBankAccounts(d.bank_accounts ?? []);
      setUsage(d.usage);
      setPending((d.payments ?? []).find((p) => p.status === 'pending' || p.status === 'submitted' || p.status === 'reviewing') ?? null);
    } catch (e) {
      setError(extractError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function startPayment(target: { plan_slug?: string; addon_slug?: string }, method: 'bank_transfer' | 'paystack') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const j = await capi<{ free?: boolean; message?: string; payment?: { id: number; reference: string }; paystack?: { url?: string } }>(
        '/vendor/payment-intent',
        { method: 'POST', body: JSON.stringify({ method, ...target }) }
      );
      if (j.free) {
        setNotice(j.message ?? 'Your free plan is active.');
        await load();
        return;
      }
      if (method === 'paystack' && j.paystack?.url) {
        window.location.href = j.paystack.url;
        return;
      }
      // bank transfer: the payment is now pending proof — refresh shows the upload banner
      await load();
      setNotice('Payment started — upload your bank transfer proof to continue.');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  /** XHR (not fetch) so the liquid fill can track real upload progress. */
  function uploadProof(file: File) {
    if (!pending || dzState === 'uploading') return;
    const ref = pending.id;
    setBusy(true);
    setError('');
    setNotice('');
    setDzState('uploading');
    setDzPct(4);

    const form = new FormData();
    form.append('proof', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/vendor/payment-proof/${ref}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setDzPct(Math.min(99, Math.max(4, Math.round((e.loaded / e.total) * 100))));
    };
    xhr.onload = async () => {
      setBusy(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setDzPct(100);
        setDzState('done');
        haptic('double');
        setNotice('Proof submitted — an admin will verify it shortly.');
        setTimeout(() => {
          load();
          setDzState('idle');
          setDzPct(0);
        }, 1600);
      } else {
        setDzState('idle');
        setDzPct(0);
        haptic('deep');
        let msg = 'Upload failed — check your connection and try again.';
        try {
          const j = JSON.parse(xhr.responseText);
          msg = j?.error?.message ?? j?.message ?? msg;
        } catch {
          /* keep default */
        }
        setError(msg);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setDzState('idle');
      setDzPct(0);
      haptic('deep');
      setError('Upload failed — check your connection and try again.');
    };
    xhr.send(form);
  }

  const usageRows = usage
    ? [
        { k: 'Listings', v: usage.listings_used, max: usage.listings_limit, suffix: usage.listings_limit === -1 ? 'unlimited' : '' },
        { k: 'Storage', v: Math.round((usage.storage_used_bytes / 1048576) * 10) / 10, max: usage.storage_limit_mb, suffix: 'MB' },
        { k: 'WhatsApp numbers', v: usage.whatsapp_used, max: usage.whatsapp_limit, suffix: '' },
      ]
    : [];

  return (
    <div>
      <div className="dash-head">
        <h1>Plan & billing</h1>
      </div>
      {error && <div className="form-msg error">{error}</div>}
      {notice && <div className="form-msg success">{notice}</div>}

      {pending && (
        <div className="banner warn">
          <div>
            <strong>
              {pending.status === 'submitted'
                ? 'Payment submitted — under review.'
                : pending.status === 'reviewing'
                  ? 'Payment under review.'
                  : `Upload your transfer proof for ${pending.amount_display} (${pending.reference}).`}
            </strong>
            {pending.rejection_reason && <div style={{ fontSize: '0.88rem', marginTop: 4 }}>Rejected: {pending.rejection_reason}</div>}
          </div>
          {pending.status === 'pending' && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload bank transfer proof — drop a file here or press Enter to browse"
              className={`dropzone${dzState === 'uploading' ? ' dz-up' : ''}${dzState === 'done' ? ' dz-done' : ''}${dzDrag ? ' dz-drag' : ''}`}
              onClick={() => {
                if (dzState !== 'uploading') fileRef.current?.click();
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && dzState !== 'uploading') {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDzDrag(true);
              }}
              onDragLeave={() => setDzDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDzDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) uploadProof(f);
              }}
            >
              <span className="dz-ring" aria-hidden="true" />
              {dzState === 'uploading' && (
                <span className="dz-fill" style={{ height: `${dzPct}%` }} aria-hidden="true" />
              )}
              <span className="dz-ic" aria-hidden="true">
                {dzState === 'done' ? (
                  <svg viewBox="0 0 52 52" width="44" height="44">
                    <circle className="dz-circle" cx="26" cy="26" r="23" fill="none" strokeWidth="2.5" />
                    <path className="dz-check" d="M15 27l8 8 14-16" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="dz-emoji">🧾</span>
                )}
              </span>
              <span className="dz-title">
                {dzState === 'done'
                  ? 'Proof submitted'
                  : dzState === 'uploading'
                    ? `Uploading… ${dzPct}%`
                    : 'Drop your transfer proof here'}
              </span>
              <span className="dz-sub">
                {dzState === 'done' ? 'An admin will verify it shortly.' : 'or tap to browse · JPG, PNG, WebP or PDF'}
              </span>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadProof(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>
          Current plan — {sub?.plan_name ?? 'Free'}
          {sub?.status ? (
            <span className={`status-pill ${sub.status}`} style={{ marginLeft: 10 }}>
              {sub.status}
            </span>
          ) : null}
          {sub?.expires_at ? (
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem', marginLeft: 10 }}>
              renews {new Date(sub.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : null}
        </h2>
        {usageRows.map((r) => (
          <div className="kv" key={r.k}>
            <span className="k">{r.k}</span>
            <span className="v">
              {r.v} / {r.max === -1 ? '∞' : r.max} {r.suffix}
            </span>
          </div>
        ))}
      </div>

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Plans</h2>
        <div className="billing-plan">
          {plans.map((p) => {
            const current = sub?.plan_name === p.name;
            return (
              <div key={p.slug} className={`card${current ? ' current' : ''}`} style={{ border: current ? '2px solid var(--green)' : '1px solid var(--line)' }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="price">
                  {p.price === 0 ? 'Free' : p.price_display}
                  {p.price > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>/mo</span>}
                </div>
                {Array.isArray(p.features) &&
                  p.features.slice(0, 6).map((f, i) => (
                    <div key={i} className="feat">
                      ✓ {typeof f === 'string' ? f : f.label}
                    </div>
                  ))}
                <div style={{ marginTop: 'auto' }}>
                  {current ? (
                    <span className="chip" style={{ background: 'var(--green)', color: '#fff' }}>
                      Current plan
                    </span>
                  ) : p.price === 0 ? (
                    <button className="btn btn-ghost" style={{ width: '100%', padding: '9px' }} onClick={() => startPayment({ plan_slug: p.slug }, 'bank_transfer')} disabled={busy}>
                      Switch to free
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-primary" style={{ width: '100%', padding: '9px', marginBottom: 6 }} onClick={() => startPayment({ plan_slug: p.slug }, 'bank_transfer')} disabled={busy}>
                        {busy ? '…' : 'Bank transfer'}
                      </button>
                      <button className="btn btn-ghost" style={{ width: '100%', padding: '9px' }} onClick={() => startPayment({ plan_slug: p.slug }, 'paystack')} disabled={busy}>
                        Pay with card
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {addons.length > 0 && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Add-ons</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -6 }}>
            Buy extras on top of your plan — they stack with any plan.
          </p>
          <div className="billing-plan">
            {addons.map((a) => (
              <div key={a.slug} className="card">
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div className="price">{a.price_display}</div>
                <div className="feat">{a.duration_days > 0 ? `Lasts ${a.duration_days} days` : 'Until removed'}</div>
                <div style={{ marginTop: 'auto' }}>
                  <button className="btn btn-ghost" style={{ width: '100%', padding: '9px' }} onClick={() => startPayment({ addon_slug: a.slug }, 'bank_transfer')} disabled={busy}>
                    {busy ? '…' : 'Buy — bank transfer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Payment history</h2>
        {payments.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', margin: 0 }}>No payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString('en-NG')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.reference}</td>
                    <td>{p.amount_display}</td>
                    <td>{p.method === 'paystack' ? 'Paystack' : p.method === 'bank_transfer' ? 'Bank transfer' : p.method}</td>
                    <td>
                      <span className={`status-pill ${p.status}`}>{p.status}</span>
                      {p.rejection_reason && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: 4 }}>{p.rejection_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bankAccounts.length > 0 && (
        <div className="card panel">
          <h2 style={{ fontSize: '1.05rem' }}>Bank transfer details</h2>
          {bankAccounts.map((ba, i) => (
            <div className="kv" key={i}>
              <span className="k">{ba.bank}</span>
              <span className="v">
                {ba.account_number} — {ba.account_name}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        Questions about billing? <Link href="mailto:support@cybershop.ng">Email support</Link> — we usually reply within a day.
      </p>
    </div>
  );
}
