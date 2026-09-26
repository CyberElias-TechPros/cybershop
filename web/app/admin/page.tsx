import Link from 'next/link';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { requireAdmin, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Overview {
  stats: {
    total: number;
    active: number;
    pending_approval: number;
    pending_payment: number;
    suspended: number;
    buyers: number;
    items: number;
    wa_clicks: number;
    revenue_kobo: number;
    revenue_display: string;
  };
  queues: { payments: number; vendors: number; reports: number; listings: number };
  recent_payments: {
    id: number;
    reference: string;
    amount_display: string;
    method: string;
    status: string;
    created_at: string;
    business_name: string;
  }[];
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const data = await api<Overview>('/admin/overview', { cookie: await sessionCookieHeader(), ip: await clientIp() });
  const { stats, queues } = data;

  return (
    <div>
      <div className="dash-head">
        <h1>Overview</h1>
      </div>

      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="/api/admin/export?kind=businesses">Export stores</a>
        <a href="/api/admin/export?kind=listings">Export listings</a>
        <a href="/api/admin/export?kind=payments">Export payments</a>
      </p>
      <div className="stat-grid">
        <div className="card stat">
          <div className="num">{stats.active}</div>
          <div className="lbl">Active businesses</div>
          <div className="sub">{stats.total} total · {stats.suspended} suspended</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.items}</div>
          <div className="lbl">Published listings</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.wa_clicks}</div>
          <div className="lbl">WhatsApp clicks (all time)</div>
        </div>
        <div className="card stat">
          <div className="num" style={{ fontSize: '1.25rem' }}>{stats.revenue_display}</div>
          <div className="lbl">Revenue (approved payments)</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.buyers}</div>
          <div className="lbl">Buyer accounts</div>
        </div>
      </div>

      <div className="banner info">
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <span>
            <strong>{queues.payments}</strong> payment(s) to review → <Link href="/admin/payments">queue</Link>
          </span>
          <span>
            <strong>{queues.vendors}</strong> vendor(s) awaiting activation → <Link href="/admin/vendors?status=pending_payment">vendors</Link>
          </span>
          <span>
            <strong>{queues.reports}</strong> open report(s) → <Link href="/admin/reports">reports</Link>
          </span>
        </div>
      </div>

      <div className="card panel">
        <h2 style={{ fontSize: '1.05rem' }}>Recent payments</h2>
        {data.recent_payments.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', margin: 0 }}>No payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Business</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString('en-NG')}</td>
                    <td>{p.business_name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.reference}</td>
                    <td>{p.amount_display}</td>
                    <td>{p.method === 'paystack' ? 'Paystack' : 'Bank'}</td>
                    <td>
                      <span className={`status-pill ${p.status}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
