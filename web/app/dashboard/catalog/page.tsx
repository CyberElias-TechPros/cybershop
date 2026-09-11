import Link from 'next/link';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { requireVendor, sessionCookieHeader } from '@/lib/session';
import Pager from '@/components/Pager';

export const dynamic = 'force-dynamic';

interface SP {
  q?: string;
  status?: string;
  page?: string;
}

interface Item {
  id: number;
  name: string;
  slug: string;
  status: string;
  price: number | null;
  price_type: string;
  type_name: string;
  url_segment: string;
  category_name: string | null;
  image: string | null;
  published_at: string | null;
  updated_at: string;
}

function priceLabel(p: Item): string {
  if (p.price_type === 'negotiable') return 'On request';
  if (p.price_type === 'free') return 'Free';
  if (p.price === null) return '—';
  return `₦${(p.price / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}${p.price_type === 'from' ? '+' : ''}`;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireVendor();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const status = ['draft', 'published', 'archived'].includes(sp.status ?? '') ? (sp.status as string) : 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (status !== 'all') query.set('status', status);
  query.set('page', String(page));
  const data = await api<{ items: Item[]; total: number; page: number; pages: number }>(`/vendor/items?${query}`, {
    cookie: await sessionCookieHeader(),
    ip: await clientIp(),
  });

  const base = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (status !== 'all') u.set('status', status);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `/dashboard/catalog${s ? `?${s}` : ''}`;
  };

  return (
    <div>
      <div className="dash-head">
        <h1>Catalogue</h1>
        <Link className="btn btn-primary" href="/dashboard/catalog/new">
          + New listing
        </Link>
      </div>

      <form className="toolbar" method="GET" action="/dashboard/catalog">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <input className="input" style={{ maxWidth: 260 }} type="search" name="q" placeholder="Search listings…" defaultValue={q} />
        <select className="select" style={{ width: 'auto' }} name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
          <option value="archived">Archived</option>
        </select>
        <span className="spacer" />
        <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{data.total} listings</span>
      </form>

      {me.business && ['pending_payment', 'pending_approval'].includes(me.business.status) && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <div>
            <strong>Your store isn’t live yet</strong> — listings are saved but hidden from buyers until your plan is active.
          </div>
          <Link className="btn btn-primary" href="/onboarding">
            Finish setup
          </Link>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="empty">
          <h2>No listings yet</h2>
          <p>
            Create your first listing — it takes about two minutes.{' '}
            <Link href="/dashboard/catalog/new">Get started</Link>
          </p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>Listing</th>
                <th>Type</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="thumb" src={it.image} alt="" />
                    ) : (
                      <div className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        🏷️
                      </div>
                    )}
                  </td>
                  <td>
                    <Link href={`/dashboard/catalog/${it.id}`}>{it.name}</Link>
                    {it.category_name && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{it.category_name}</div>}
                  </td>
                  <td>{it.type_name}</td>
                  <td>{priceLabel(it)}</td>
                  <td>
                    <span className={`status-pill ${it.status}`}>{it.status}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="mini-btn" href={`/business/${me.business?.slug}/${it.url_segment}/${it.slug}`}>
                        View
                      </Link>
                      <Link className="mini-btn" href={`/dashboard/catalog/${it.id}`}>
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={data.page} pages={data.pages} makeUrl={base} />
    </div>
  );
}
