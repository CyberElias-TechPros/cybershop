'use client';

import { useEffect, useState } from 'react';
import { capi } from '@/lib/client-api';

/** A vendor who pays for a plan gives the referrer credit on their next plan. Not cash. */
export default function ReferralCard() {
  const [data, setData] = useState<{ code: string; link: string; credit_kobo: number } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    capi<{ referral?: { code: string; link: string; credit_kobo: number } }>('/account/home')
      .then((d) => { if (d.referral) setData(d.referral); })
      .catch(() => undefined);
  }, []);
  if (!data) return null;
  const naira = `₦${(data.credit_kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  return (
    <section className="card panel" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Refer a store</h2>
      <p style={{ color: 'var(--muted)' }}>
        Share your link. When that store pays for a plan, you get 10% back as credit on your next plan, up to ₦5,000. It is not cash, and it does not apply to add-ons.
      </p>
      {data.credit_kobo > 0 && <p><strong>{naira}</strong> waiting on your next plan payment.</p>}
      <p style={{ wordBreak: 'break-all' }}>{data.link}</p>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(data.link);
            setCopied(true);
          } catch {
            window.prompt('Copy this link', data.link);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy invite link'}
      </button>
    </section>
  );
}
