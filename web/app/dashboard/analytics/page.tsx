import Link from 'next/link';
import { api } from '@/lib/api';
import { clientIp } from '@/lib/ip';
import { requireVendor, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface DayPoint {
  day: string;
  storefront_views: number;
  item_views: number;
  wa_clicks: number;
  visitors: number;
}
interface ItemPoint {
  id: number;
  name: string;
  slug: string;
  url_segment: string;
  type_name: string | null;
  views: number;
  clicks: number;
  ctr: number | null;
}
interface Analytics {
  days: number;
  from: string;
  totals: { storefront_views: number; item_views: number; wa_clicks: number; visitors: number; enquiries: number; view_to_click: number };
  deltas: { storefront_views: number; item_views: number; wa_clicks: number };
  trend: DayPoint[];
  items: ItemPoint[];
  best: { hour: number | null; weekday: number | null };
}

const RANGES = [7, 30, 90];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function n(v: number): string {
  return v.toLocaleString('en-NG');
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="delta flat">no change</span>;
  return (
    <span className={`delta ${value > 0 ? 'up' : 'down'}`}>
      {value > 0 ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  );
}

function hourLabel(h: number): string {
  const next = (h + 1) % 24;
  const fmt = (x: number) => `${String(x).padStart(2, '0')}:00`;
  return `${fmt(h)}–${fmt(next)}`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await requireVendor();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;

  let data: Analytics | null = null;
  let error = '';
  try {
    const r = await api<{ analytics: Analytics }>(`/vendor/analytics?days=${days}`, {
      cookie: await sessionCookieHeader(),
      ip: await clientIp(),
    });
    data = r.analytics;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load analytics.';
  }

  const slug = me.business?.slug ?? '';

  return (
    <div>
      <div className="dash-head">
        <h1>Analytics</h1>
        <div className="chip-row" role="group" aria-label="Date range">
          {RANGES.map((d) => (
            <Link key={d} className={`chip${d === days ? ' on' : ''}`} href={`/dashboard/analytics?days=${d}`}>
              {d} days
            </Link>
          ))}
        </div>
      </div>

      {error && <div className="form-msg error">{error}</div>}

      {data && (
        <>
          <div className="stat-grid">
            <div className="card stat">
              <div className="num">{n(data.totals.storefront_views)}</div>
              <div className="lbl">Store views</div>
              <div className="sub">
                <Delta value={data.deltas.storefront_views} /> vs previous {data.days} days
              </div>
            </div>
            <div className="card stat">
              <div className="num">{n(data.totals.item_views)}</div>
              <div className="lbl">Listing views</div>
              <div className="sub">
                <Delta value={data.deltas.item_views} /> vs previous {data.days} days
              </div>
            </div>
            <div className="card stat">
              <div className="num">{n(data.totals.wa_clicks)}</div>
              <div className="lbl">WhatsApp clicks</div>
              <div className="sub">
                <Delta value={data.deltas.wa_clicks} /> vs previous {data.days} days
              </div>
            </div>
            <div className="card stat">
              <div className="num">{data.totals.view_to_click}%</div>
              <div className="lbl">Viewed → WhatsApp</div>
              <div className="sub">{n(data.totals.enquiries)} enquiries logged</div>
            </div>
          </div>

          <div className="card panel">
            <h2 style={{ fontSize: '1.05rem' }}>Daily traffic</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -4 }}>
              Days with no visitors are shown as empty, not skipped — otherwise the line would quietly
              compress time.
            </p>
            <div className="spark" role="img" aria-label={`Daily listing views and WhatsApp clicks over ${data.days} days`}>
              {data.trend.map((d) => {
                const peak = Math.max(1, ...data.trend.map((x) => Math.max(x.item_views, x.wa_clicks)));
                return (
                  <div className="spark-col" key={d.day} title={`${d.day}: ${d.item_views} views · ${d.wa_clicks} clicks`}>
                    <div className="spark-bar">
                      <span className="views" style={{ height: `${(d.item_views / peak) * 100}%` }} />
                      <span className="clicks" style={{ height: `${(d.wa_clicks / peak) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="spark-key">
              <span>
                <i className="views" aria-hidden /> listing views
              </span>
              <span>
                <i className="clicks" aria-hidden /> WhatsApp clicks
              </span>
              <span className="faint">{n(data.totals.visitors)} unique visitors</span>
            </div>
          </div>

          <div className="card panel">
            <h2 style={{ fontSize: '1.05rem' }}>What performs</h2>
            {data.items.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
                No listing views in this window yet. Share a listing link in your WhatsApp groups — that is
                where this traffic comes from.{' '}
                <Link href="/dashboard/catalog/new">Add a listing</Link>
              </p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Listing</th>
                      <th>Views</th>
                      <th>Clicks</th>
                      <th>View → WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link href={`/business/${slug}/${i.url_segment}/${i.slug}`}>{i.name}</Link>
                          {i.type_name && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{i.type_name}</div>
                          )}
                        </td>
                        <td>{n(i.views)}</td>
                        <td>{n(i.clicks)}</td>
                        <td>{i.ctr === null ? '—' : `${i.ctr}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ color: 'var(--muted)', fontSize: '0.86rem', marginTop: 12, marginBottom: 0 }}>
              A listing with plenty of views and few clicks usually means the price or the photos are not
              answering the buyer&rsquo;s question. Start there before you add more items.
            </p>
          </div>

          {data.best.hour !== null && (
            <div className="card panel">
              <h2 style={{ fontSize: '1.05rem' }}>When buyers reach for WhatsApp</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginTop: -4 }}>
                Most of your clicks land on{' '}
                <strong>
                  {data.best.weekday !== null ? WEEKDAYS[data.best.weekday] : 'your busiest day'} between{' '}
                  {hourLabel(data.best.hour)}
                </strong>
                . Being awake to answer there is worth more than another listing.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
