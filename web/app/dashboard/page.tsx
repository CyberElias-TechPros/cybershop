import Link from 'next/link';
import { api } from '@/lib/api';
import StorefrontTools from '@/components/StorefrontTools';
import { clientIp } from '@/lib/ip';
import { requireVendor, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Overview {
  business: { id: number; name: string; slug: string; status: string };
  stats: Record<string, number>;
  counts: { items: number; published: number; inquiries: number; new_leads: number; unread_notifications: number };
  subscription: { status: string; expires_at: string | null; plan_name: string | null } | null;
  pending_payment: { id: number; reference: string; amount: number; amount_display: string; status: string } | null;
  usage: { storage_used_bytes: number; storage_limit_mb: number; items: number; items_limit: number; plan: string };
  top_items: { name: string; slug: string; url_segment: string; views: number; clicks: number }[];
}

function fmtBytes(b: number) {
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default async function DashboardOverviewPage() {
  const me = await requireVendor();
  const data = await api<Overview>('/vendor/overview', {
    cookie: await sessionCookieHeader(),
    ip: await clientIp(),
  });

  const { business, stats, counts, subscription, pending_payment, usage, top_items } = data;
  const status = business.status;

  return (
    <div>
      <div className="dash-head">
        <h1>
          Overview{' '}
          <span className={`status-pill ${status}`} style={{ verticalAlign: 'middle', marginLeft: 8 }}>
            {status.replace('_', ' ')}
          </span>
        </h1>
        <Link className="btn btn-ghost" href={`/business/${business.slug}`}>
          View store ↗
        </Link>
      </div>

      {status === 'pending_payment' && (
        <div className="banner warn">
          <div>
            <strong>Your store isn’t live yet.</strong> Choose a plan and pay to go live — the free plan takes under a minute.
          </div>
          <Link className="btn btn-primary" href="/onboarding">
            Finish setup
          </Link>
        </div>
      )}
      {status === 'pending_approval' && (
        <div className="banner info">
          <div>
            <strong>Payment under review.</strong> We’re verifying your bank transfer — you’ll be notified here as soon as it’s approved.
          </div>
          <Link className="btn btn-ghost" href="/dashboard/billing">
            View payment
          </Link>
        </div>
      )}
      {status === 'suspended' && (
        <div className="banner warn">
          <div>
            <strong>Your store is suspended.</strong> Contact support to resolve this — your listings are hidden from buyers until then.
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card stat">
          <div className="num">{stats.stores_7d ?? 0}</div>
          <div className="lbl">Store views (7 days)</div>
          <div className="sub">{stats.stores_all ?? 0} total</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.items_7d ?? 0}</div>
          <div className="lbl">Listing views (7 days)</div>
          <div className="sub">{stats.items_all ?? 0} total</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.clicks_7d ?? 0}</div>
          <div className="lbl">WhatsApp clicks (7 days)</div>
          <div className="sub">{stats.clicks_all ?? 0} total</div>
        </div>
        <div className="card stat">
          <div className="num">{counts.new_leads}</div>
          <div className="lbl">New leads</div>
          <div className="sub">{counts.inquiries} total enquiries</div>
        </div>
      </div>

      {pending_payment && (
        <div className="banner warn">
          <div>
            <strong>Payment {pending_payment.status === 'submitted' ? 'submitted' : 'awaiting proof'}:</strong> {pending_payment.amount_display} — ref {pending_payment.reference}
          </div>
          <Link className="btn btn-primary" href="/dashboard/billing">
            {pending_payment.status === 'pending' ? 'Upload proof' : 'Track status'}
          </Link>
        </div>
      )}

      <div className="card panel">
        <h2>
          Plan — {subscription?.plan_name ?? usage.plan ?? 'Free'}
          {subscription?.status && <span className={`status-pill ${subscription.status}`} style={{ marginLeft: 10 }}>{subscription.status}</span>}
        </h2>
        <div className="kv">
          <span className="k">Listings</span>
          <span className="v">
            {usage.items} / {usage.items_limit === -1 ? 'unlimited' : usage.items_limit}
          </span>
        </div>
        <div className="kv">
          <span className="k">Storage</span>
          <span className="v">
            {fmtBytes(usage.storage_used_bytes)} / {usage.storage_limit_mb} MB
          </span>
        </div>
        {subscription?.expires_at && (
          <div className="kv">
            <span className="k">Renews / expires</span>
            <span className="v">{new Date(subscription.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Link className="btn btn-ghost" href="/dashboard/billing">
            Manage plan & billing
          </Link>
        </div>
      </div>

      <div className="card panel">
        <h2>Top listings (30 days)</h2>
        {top_items.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
            No views yet — publish a few listings and they’ll show up here.{' '}
            <Link href="/dashboard/catalog/new">Add a listing</Link>
          </p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Views</th>
                  <th>WhatsApp clicks</th>
                </tr>
              </thead>
              <tbody>
                {top_items.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <Link href={`/business/${business.slug}/${t.url_segment}/${t.slug}`}>{t.name}</Link>
                    </td>
                    <td>{t.views}</td>
                    <td>{t.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        Signed in as {me.user.name} · {me.user.email}
      </p>

      <StorefrontTools storeUrl={`/business/${business.slug}`} storeName={business.name} />
    </div>
  );
}
