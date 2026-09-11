'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Local mock of Paystack's hosted checkout (PAYSTACK_MOCK=1).
 * "Paying" triggers the exact same webhook the real Paystack would fire:
 * POST /api/webhooks/paystack/mock with the reference — the Worker verifies
 * and activates the plan, exactly as production does.
 */
function MockInner() {
  const ref = useSearchParams().get('ref') ?? '';
  const [state, setState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  async function pay() {
    setState('processing');
    try {
      const res = await fetch('/api/webhooks/paystack/mock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: ref }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) setState('done');
      else setState('error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
        <h1>Paystack Checkout</h1>
        <p className="sub">
          <strong>DEMO MODE</strong> — this simulates Paystack’s hosted page so you can test the full
          payment flow without live keys.
        </p>
        <div className="proof-box" style={{ textAlign: 'left', marginBottom: 16 }}>
          <div className="kv">
            <span className="k">Reference</span>
            <span className="v" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {ref || '(missing)'}
            </span>
          </div>
          <div className="kv">
            <span className="k">Gateway</span>
            <span className="v">Paystack (sandbox simulation)</span>
          </div>
        </div>
        {state === 'done' ? (
          <div className="form-msg success">
            Payment received and verified — your plan is being activated.
            <div style={{ marginTop: 10 }}>
              <Link className="btn btn-primary" href="/dashboard/billing">
                Go to billing
              </Link>
            </div>
          </div>
        ) : state === 'error' ? (
          <div className="form-msg error">The payment could not be processed. Try again or use bank transfer.</div>
        ) : (
          <>
            <button className="btn btn-primary" onClick={pay} disabled={state === 'processing' || !ref} style={{ width: '100%' }}>
              {state === 'processing' ? 'Processing…' : 'Pay now (simulate)'}
            </button>
            <p className="auth-alt">
              <Link href="/dashboard/billing">Cancel and go back</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaystackMockPage() {
  return (
    <Suspense>
      <MockInner />
    </Suspense>
  );
}
