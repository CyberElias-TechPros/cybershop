'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { capi, extractError, fmtNaira } from '@/lib/client-api';

interface Plan {
  id: number;
  name: string;
  slug: string;
  price: number;
  price_display: string;
  interval: string;
  description: string | null;
  features: { label: string }[] | string[] | null;
}

interface BankAccount {
  bank: string;
  account_name: string;
  account_number: string;
  reference?: string;
}

interface Me {
  user: { role: string; name: string };
  business: { id: number; name: string; slug: string; status: string } | null;
}

/**
 * Onboarding: choose a plan → pay (free activation / bank transfer with proof /
 * Paystack) → done. Re-runnable: if a payment is already pending it shows the
 * waiting state instead.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [pendingPayment, setPendingPayment] = useState<{ id: number; reference: string; amount: number; method: string; status: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState<string | null>(null);
  const [method, setMethod] = useState<'bank_transfer' | 'paystack'>('bank_transfer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'choose' | 'paying' | 'bank-proof' | 'done' | 'waiting'>('choose');

  const load = useCallback(async () => {
    try {
      const m = await capi<Me>('/auth/me');
      setMe(m);
      if (m.user.role !== 'vendor' || !m.business) {
        router.replace('/login');
        return;
      }
      if (m.business.status === 'active') {
        router.replace('/dashboard');
        return;
      }
      const p = await capi<{ plans: Plan[]; bank_accounts: BankAccount[]; payments: { id: number; reference: string; amount: number; method: string; status: string; kind: string }[] }>('/vendor/plans');
      setPlans(p.plans);
      setBankAccounts(p.bank_accounts ?? []);
      const pending = (p.payments ?? []).find((x) => (x.status === 'pending' || x.status === 'submitted') && x.kind !== 'addon');
      if (pending) {
        setPendingPayment({ id: pending.id, reference: pending.reference, amount: pending.amount, method: pending.method, status: pending.status });
        setStage('waiting');
      }
    } catch (e) {
      setLoadError(extractError(e));
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function choosePlan(slug: string) {
    const plan = plans.find((x) => x.slug === slug);
    if (!plan) return;
    if (plan.price === 0) {
      // free plan — activate immediately
      setBusy(true);
      setError('');
      try {
        await capi('/vendor/payment-intent', { method: 'POST', body: JSON.stringify({ plan_slug: slug, method: 'bank_transfer' }) });
        setStage('done');
      } catch (e) {
        setError(extractError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    setSelected(slug);
    setStage('paying');
  }

  async function startPayment() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const j = await capi<{ free?: boolean; payment?: { id: number; reference: string }; paystack?: { url?: string; mock?: boolean } }>(
        '/vendor/payment-intent',
        { method: 'POST', body: JSON.stringify({ plan_slug: selected, method }) }
      );
      if (j.free) {
        setStage('done');
        return;
      }
      if (method === 'paystack' && j.paystack?.url) {
        window.location.href = j.paystack.url;
        return;
      }
      // bank transfer: stay on page, vendor uploads proof next
      setStage('bank-proof');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof(file: File) {
    if (!pendingPayment) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('proof', file);
      await capi(`/vendor/payment-proof/${pendingPayment.id}`, { method: 'POST', body: form });
      setPendingPayment((p) => (p ? { ...p, status: 'submitted' } : p));
      setStage('waiting');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return loadError ? (
      <div className="auth-wrap">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div className="form-msg error">{loadError}</div>
          <Link className="btn btn-primary" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    ) : (
      <div className="auth-wrap">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  const plan = plans.find((p) => p.slug === selected);

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="card auth-card" style={{ maxWidth: 640 }}>
        <h1>
          {stage === 'done' ? '🎉 Your store is live!' : stage === 'waiting' ? 'We’re verifying your payment' : 'Choose your plan'}
        </h1>
        <p className="sub">
          {stage === 'done'
            ? `${me.business!.name} is now on CyberShop. Add your catalogue and start receiving WhatsApp enquiries.`
            : stage === 'waiting'
              ? pendingPayment?.status === 'submitted'
                ? 'Your bank transfer proof is in the review queue. An admin will verify it shortly — we’ll notify you here and on your dashboard.'
                : 'A payment is in progress. Continue below to finish it.'
              : `Monthly plans. Upgrade, downgrade or cancel any time from your dashboard.`}
        </p>

        {stage === 'done' && (
          <div className="form-actions">
            <Link className="btn btn-wa" href="/dashboard/catalog/new" style={{ width: '100%' }}>
              Add your first listing
            </Link>
            <Link className="btn btn-ghost" href="/dashboard" style={{ width: '100%' }}>
              Go to dashboard
            </Link>
          </div>
        )}

        {stage === 'choose' && (
          <>
            {error && <div className="form-msg error">{error}</div>}
            <div className="billing-plan">
              {plans.map((p) => (
                <div key={p.slug} className="card" style={{ cursor: 'pointer', border: selected === p.slug ? '2px solid var(--green)' : '1px solid var(--line)' }} onClick={() => setSelected(p.slug)}>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="price">
                    {p.price === 0 ? 'Free' : p.price_display}
                    {p.price > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>/month</span>}
                  </div>
                  {Array.isArray(p.features) &&
                    p.features.slice(0, 5).map((f, i) => (
                      <div key={i} className="feat">
                        ✓ {typeof f === 'string' ? f : f.label}
                      </div>
                    ))}
                  <div style={{ marginTop: 'auto' }}>
                    <button className="btn" style={{ width: '100%', background: p.price === 0 ? 'var(--green)' : 'var(--ink)', color: '#fff', padding: '9px' }} onClick={() => choosePlan(p.slug)} disabled={busy}>
                      {busy ? '…' : p.price === 0 ? 'Start free' : 'Choose'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {stage === 'paying' && plan && (
          <>
            {error && <div className="form-msg error">{error}</div>}
            <div className="proof-box" style={{ marginBottom: 14 }}>
              <div className="kv">
                <span className="k">Plan</span>
                <span className="v">
                  {plan.name} — {plan.price_display}/month
                </span>
              </div>
            </div>
            <div className="form-row">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.92rem', cursor: 'pointer' }}>
                <input type="radio" checked={method === 'bank_transfer'} onChange={() => setMethod('bank_transfer')} />
                Bank transfer (free)
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.92rem', cursor: 'pointer' }}>
                <input type="radio" checked={method === 'paystack'} onChange={() => setMethod('paystack')} />
                Paystack (card)
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setStage('choose')}>
                ← Back
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={startPayment} disabled={busy}>
                {busy ? 'Starting…' : method === 'paystack' ? `Pay ${plan.price_display} with Paystack` : 'Continue to bank transfer'}
              </button>
            </div>
          </>
        )}

        {stage === 'bank-proof' && (
          <>
            <div className="proof-box" style={{ marginBottom: 14 }}>
              <strong>Bank transfer instructions</strong>
              <ol>
                {bankAccounts.length === 0 && <li>Add your bank details from the admin panel, then come back.</li>}
                {bankAccounts.map((ba, i) => (
                  <li key={i}>
                    <strong>{ba.bank}</strong> · {ba.account_number} · {ba.account_name}
                    {ba.reference ? ` · Ref: ${ba.reference}` : ''}
                  </li>
                ))}
                <li>
                  Transfer <strong>{fmtNaira(plan?.price ?? 0)}</strong> and note the reference.
                </li>
                <li>Upload the transfer receipt/proof below.</li>
              </ol>
            </div>
            <label className="btn btn-primary" style={{ width: '100%' }}>
              {busy ? 'Uploading…' : 'Upload transfer proof (JPG, PNG, WEBP or PDF)'}
              <input
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadProof(f);
                }}
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setStage('paying')}>
                ← Back
              </button>
              <Link className="btn btn-ghost" href="/dashboard/billing">
                Upload later from billing
              </Link>
            </div>
          </>
        )}

        {stage === 'waiting' && pendingPayment && (
          <>
            <div className="proof-box">
              <div className="kv">
                <span className="k">Reference</span>
                <span className="v" style={{ fontFamily: 'monospace' }}>
                  {pendingPayment.reference}
                </span>
              </div>
              <div className="kv">
                <span className="k">Amount</span>
                <span className="v">{fmtNaira(pendingPayment.amount)}</span>
              </div>
              <div className="kv">
                <span className="k">Status</span>
                <span className="v">
                  <span className={`status-pill ${pendingPayment.status}`}>{pendingPayment.status.replace('_', ' ')}</span>
                </span>
              </div>
            </div>
            {pendingPayment.status === 'pending' && pendingPayment.method === 'bank_transfer' && (
              <label className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }}>
                {busy ? 'Uploading…' : 'Upload transfer proof'}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadProof(f);
                  }}
                />
              </label>
            )}
            <div className="form-actions">
              <Link className="btn btn-ghost" href="/dashboard/billing">
                View in billing
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
