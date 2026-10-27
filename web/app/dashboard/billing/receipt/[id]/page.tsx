import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { requireVendor, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Payment receipt', robots: { index: false, follow: false } };

interface Payment {
  id: number;
  reference: string;
  kind: string;
  amount: number;
  amount_display: string;
  gross_display: string;
  cash_display: string;
  credit_display: string;
  credit_kobo: number;
  credit_returned_at: string | null;
  method: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  plan_name: string | null;
  addon_name: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  manual: 'Platform referral credit / manual record',
  bank_transfer: 'Bank transfer',
  paystack: 'Paystack (card)',
};

/** Printable vendor receipt — one payment, ownership-checked server-side. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await requireVendor();
  const data = await api<{ payment: Payment }>(`/vendor/payments/${id}`, {
    cookie: await sessionCookieHeader(),
    ip: await clientIp(),
  });
  const p = data.payment;

  return (
    <div className="receipt-wrap">
      <div className="card panel receipt-card">
        <div className="receipt-head">
          <span className="wordmark">
            Cyber<span>Shop</span>
          </span>
          <span className={`status-pill ${p.status}`}>{p.status}</span>
        </div>
        <h1>Payment receipt</h1>
        <p className="receipt-sub">
          {me.business?.name ?? 'Your store'} · {new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <dl className="receipt-rows">
          <div>
            <dt>Reference</dt>
            <dd className="mono">{p.reference}</dd>
          </div>
          <div>
            <dt>For</dt>
            <dd>{p.addon_name || p.plan_name || (p.kind === 'activation' ? 'Store activation' : p.kind.replace('_', ' '))}</dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{METHOD_LABEL[p.method] || p.method}</dd>
          </div>
          <div>
            <dt>Confirmed</dt>
            <dd>{p.verified_at ? new Date(p.verified_at).toLocaleString('en-NG') : '— pending verification'}</dd>
          </div>
          <div><dt>Plan / add-on price</dt><dd>{p.gross_display}</dd></div>
          {p.credit_kobo > 0 && <div><dt>Referral credit applied{p.credit_returned_at ? ' (returned)' : ''}</dt><dd>{p.credit_display}</dd></div>}
          <div className="receipt-total">
            <dt>Cash amount{p.status === 'approved' ? ' confirmed' : p.status === 'refunded' ? ' marked refunded' : ' due'}</dt>
            <dd>{p.cash_display}</dd>
          </div>
        </dl>
        <p className="receipt-note">
          This is a platform subscription receipt — CyberShop never takes payment on behalf of buyers or sellers.
        </p>
      </div>
      <div className="form-actions receipt-actions">
        <Link className="btn btn-ghost" href="/dashboard/billing">
          ← Back to billing
        </Link>
      </div>
    </div>
  );
}
