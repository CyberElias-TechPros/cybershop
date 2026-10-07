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
      <div className="onb-shell">
        <div className="card auth-card" style={{ textAlign: 'center', margin: '0 auto' }}>
          <div className="form-msg error">{loadError}</div>
          <Link className="btn btn-primary" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    ) : (
      <div className="onb-shell" aria-busy="true" aria-label="Loading plans">
        <p className="cine-kicker onb-kicker">
          <span className="pulse-dot" aria-hidden /> Almost there
        </p>
        <h1 className="onb-title">Setting out your plans…</h1>
        <div className="onb-skels">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 240, borderRadius: 22 }} />
          ))}
        </div>
      </div>
    );
  }

  const plan = plans.find((p) => p.slug === selected);

  return (
    <div className="onb-shell">
      <div>
        <p className="cine-kicker onb-kicker">
          <span className="pulse-dot" aria-hidden /> Step 2 · {me.business!.name}
        </p>
        <h1 className="onb-title">
          {stage === 'done' ? (
            <>
              Your store is <em>live.</em> 🎉
            </>
          ) : stage === 'waiting' ? (
            'We’re verifying your payment'
          ) : (
            <>
              Choose how your <em>stall</em> is tended
            </>
          )}
        </h1>
        <p className="onb-sub">
          {stage === 'done'
            ? `${me.business!.name} is now on CyberShop. Add your catalogue and start receiving WhatsApp enquiries.`
            : stage === 'waiting'
              ? pendingPayment?.status === 'submitted'
                ? 'Your bank transfer proof is in the review queue. An admin will verify it shortly — we’ll notify you here and on your dashboard.'
                : 'A payment is in progress. Continue below to finish it.'
              : 'Monthly plans — upgrade, downgrade or cancel any time from your dashboard.'}
        </p>

        {stage === 'done' && (
          <div className="form-actions">
            <Link className="btn btn-wa" href="/dashboard/catalog/new" style={{ width: '100%' }}>
              Add your first listing
            </Link>
            {/* A storefront with no photo reads as a stall with no sign — ask
                for it while the vendor is still setting up. */}
            <Link className="btn btn-ghost" href="/dashboard/settings" style={{ width: '100%' }}>
              Add your store photo
            </Link>
            <Link className="btn btn-ghost" href="/dashboard" style={{ width: '100%' }}>
              Go to dashboard
            </Link>
          </div>
        )}

        {stage === 'choose' && (
          <>
            {error && <div className="form-msg error">{error}</div>}
            <div className="onb-plans" role="group" aria-label="Plans">
              {plans.map((p, i) => (
                <div
                  key={p.slug}
                  className="onb-plan"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === p.slug}
                  onClick={() => setSelected(p.slug)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(p.slug);
                    }
                  }}
                  style={{ ['--i' as string]: i }}
                >
                  <span className="onb-check" aria-hidden>
                    ✓
                  </span>
                  <span className="onb-plan-name">{p.name}</span>
                  <span className="onb-plan-price">
                    {p.price === 0 ? 'Free' : p.price_display}
                    {p.price > 0 && <small> /month</small>}
                  </span>
                  {p.description && <span className="onb-plan-desc">{p.description}</span>}
                  {Array.isArray(p.features) && p.features.length > 0 && (
                    <ul className="onb-feats">
                      {p.features.slice(0, 5).map((f, j) => (
                        <li key={j}>{typeof f === 'string' ? f : f.label}</li>
                      ))}
                    </ul>
                  )}
                  <span className="onb-plan-cta" aria-hidden>
                    {p.price === 0 ? 'Start free' : 'Select'}
                  </span>
                </div>
              ))}
            </div>
            <div className="form-actions" style={{ marginTop: 22 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={!selected || busy} onClick={() => selected && choosePlan(selected)}>
                {busy ? 'Setting things up…' : !selected ? 'Select a plan to continue' : plans.find((p) => p.slug === selected)?.price === 0 ? 'Start on the free plan' : `Continue with ${plans.find((p) => p.slug === selected)?.name}`}
              </button>
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
            <div className="onb-methods" role="radiogroup" aria-label="Payment method">
              <label className={`onb-method${method === 'bank_transfer' ? ' on' : ''}`}>
                <input type="radio" name="pay-method" checked={method === 'bank_transfer'} onChange={() => setMethod('bank_transfer')} />
                <span>
                  <strong>Bank transfer</strong>
                  <span>Pay by transfer, upload the receipt — an admin verifies it, usually within hours.</span>
                </span>
              </label>
              <label className={`onb-method${method === 'paystack' ? ' on' : ''}`}>
                <input type="radio" name="pay-method" checked={method === 'paystack'} onChange={() => setMethod('paystack')} />
                <span>
                  <strong>Paystack — card</strong>
                  <span>Card, USSD or bank. Verified automatically — your plan activates instantly.</span>
                </span>
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
