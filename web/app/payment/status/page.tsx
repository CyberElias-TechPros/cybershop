'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Production Paystack callback target (set as callback_url when initializing
 * checkout). Polls the vendor’s payments until this reference is approved,
 * then points the vendor at billing.
 */
function StatusInner() {
  const ref = useSearchParams().get('ref') ?? '';
  const [state, setState] = useState<'checking' | 'approved' | 'rejected' | 'unknown'>('checking');

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch('/api/vendor/plans', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const j = await res.json();
        const p = (j.payments as { reference: string; status: string }[])?.find((x) => x.reference === ref);
        if (p) {
          if (p.status === 'approved' || p.status === 'active') setState('approved');
          else if (p.status === 'rejected' || p.status === 'failed') setState('rejected');
          else if (++tries > 20) setState('unknown');
        } else if (++tries > 20) {
          setState('unknown');
          return;
        }
      } catch {
        if (++tries > 20) {
          setState('unknown');
          return;
        }
      }
      if (!stopped && tries <= 20) setTimeout(poll, 2000);
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [ref]);

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>💳</div>
        <h1>
          {state === 'approved' ? 'Payment approved!' : state === 'rejected' ? 'Payment not approved' : 'Checking your payment…'}
        </h1>
        {state === 'checking' && <p className="sub">This usually takes a few seconds. You can safely close this tab.</p>}
        {state === 'approved' && (
          <div className="form-msg success">
            Your payment has been verified and your plan is active.
            <div style={{ marginTop: 10 }}>
              <Link className="btn btn-primary" href="/dashboard">
                Go to your dashboard
              </Link>
            </div>
          </div>
        )}
        {state === 'rejected' && (
          <div className="form-msg error">
            The payment was not approved. Check <Link href="/dashboard/billing">billing</Link> for details.
          </div>
        )}
        {state === 'unknown' && (
          <p className="sub">
            We’re still confirming with Paystack. <Link href="/dashboard/billing">Check billing</Link> in a moment.
          </p>
        )}
      </div>
    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense>
      <StatusInner />
    </Suspense>
  );
}
