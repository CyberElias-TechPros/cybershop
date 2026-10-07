import type { Env } from './../config';

/**
 * Vendor analytics.
 *
 * The events are already collected and rolled up daily by the cron; what was
 * missing was any way for a vendor to *look* at them. This is the read model
 * behind Dashboard → Analytics: totals, a daily trend, per-item performance and
 * the conversion that actually matters here — of the people who viewed, how many
 * opened WhatsApp.
 *
 * Reads `analytics_events` directly rather than `analytics_daily` so the numbers
 * are live (the rollup only runs hourly and only keeps today).
 */

export interface DayPoint {
  day: string;
  storefront_views: number;
  item_views: number;
  wa_clicks: number;
  visitors: number;
}

export interface ItemPoint {
  id: number;
  name: string;
  slug: string;
  url_segment: string;
  type_name: string | null;
  views: number;
  clicks: number;
  /** Clicks per 100 views. null when there are no views yet. */
  ctr: number | null;
}

export interface VendorAnalytics {
  days: number;
  from: string;
  totals: {
    storefront_views: number;
    item_views: number;
    wa_clicks: number;
    visitors: number;
    enquiries: number;
    /** Percentage, 1 decimal. 0 when nothing was viewed. */
    view_to_click: number;
  };
  /** Change vs the equally long window immediately before. Percent, may be negative. */
  deltas: { storefront_views: number; item_views: number; wa_clicks: number };
  trend: DayPoint[];
  items: ItemPoint[];
  /** Busiest day-of-week and hour, so a vendor knows when to be on WhatsApp. */
  best: { hour: number | null; weekday: number | null };
}

const num = (v: unknown): number => Number(v ?? 0);

export async function vendorAnalytics(env: Env, businessId: number, days: number): Promise<VendorAnalytics> {
  const span = Math.min(Math.max(days, 1), 365);
  const since = `-${span} days`;
  const prevSince = `-${span * 2} days`;

  const totalsRow = (await env.DB.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN event_type = 'storefront_view' THEN 1 ELSE 0 END), 0) AS storefront_views,
      COALESCE(SUM(CASE WHEN event_type = 'item_view' THEN 1 ELSE 0 END), 0) AS item_views,
      COALESCE(SUM(CASE WHEN event_type = 'wa_click' THEN 1 ELSE 0 END), 0) AS wa_clicks,
      COUNT(DISTINCT session_id) AS visitors
     FROM analytics_events WHERE business_id = ? AND created_at > datetime('now', ?)`
  ).bind(businessId, since).first()) as Record<string, unknown> | null;

  const prevRow = (await env.DB.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN event_type = 'storefront_view' THEN 1 ELSE 0 END), 0) AS storefront_views,
      COALESCE(SUM(CASE WHEN event_type = 'item_view' THEN 1 ELSE 0 END), 0) AS item_views,
      COALESCE(SUM(CASE WHEN event_type = 'wa_click' THEN 1 ELSE 0 END), 0) AS wa_clicks
     FROM analytics_events WHERE business_id = ? AND created_at > datetime('now', ?) AND created_at <= datetime('now', ?)`
  ).bind(businessId, prevSince, since).first()) as Record<string, unknown> | null;

  const enquiries = (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM inquiries WHERE business_id = ? AND created_at > datetime('now', ?)`
  ).bind(businessId, since).first()) as { n: number } | null;

  const trendRows = (await env.DB.prepare(
    `SELECT date(created_at) AS day,
            COALESCE(SUM(CASE WHEN event_type = 'storefront_view' THEN 1 ELSE 0 END), 0) AS storefront_views,
            COALESCE(SUM(CASE WHEN event_type = 'item_view' THEN 1 ELSE 0 END), 0) AS item_views,
            COALESCE(SUM(CASE WHEN event_type = 'wa_click' THEN 1 ELSE 0 END), 0) AS wa_clicks,
            COUNT(DISTINCT session_id) AS visitors
     FROM analytics_events WHERE business_id = ? AND created_at > datetime('now', ?)
     GROUP BY date(created_at) ORDER BY day`
  ).bind(businessId, since).all()).results as Record<string, unknown>[];

  const itemRows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, t.url_segment, t.name AS type_name,
            COUNT(e.id) AS views,
            (SELECT COUNT(*) FROM analytics_events e2
              WHERE e2.business_id = ? AND e2.listing_id = l.id AND e2.event_type = 'wa_click'
                AND e2.created_at > datetime('now', ?)) AS clicks
     FROM analytics_events e
       JOIN listings l ON l.id = e.listing_id
       JOIN item_types t ON t.id = l.item_type_id
     WHERE e.business_id = ? AND e.event_type = 'item_view' AND e.created_at > datetime('now', ?)
     GROUP BY l.id ORDER BY views DESC LIMIT 25`
  ).bind(businessId, since, businessId, since).all()).results as Record<string, unknown>[];

  const busiest = (await env.DB.prepare(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour,
            CAST(strftime('%w', created_at) AS INTEGER) AS weekday,
            COUNT(*) AS n
     FROM analytics_events
     WHERE business_id = ? AND event_type = 'wa_click' AND created_at > datetime('now', ?)
     GROUP BY hour, weekday ORDER BY n DESC LIMIT 1`
  ).bind(businessId, since).first()) as { hour: number; weekday: number } | null;

  const storefront = num(totalsRow?.storefront_views);
  const itemViews = num(totalsRow?.item_views);
  const clicks = num(totalsRow?.wa_clicks);

  const delta = (now: number, before: number): number => {
    if (before <= 0) return now > 0 ? 100 : 0;
    return Math.round(((now - before) / before) * 100);
  };

  // Fill the gaps: a day with no traffic is a real zero, not a missing row, or
  // the trend line lies by silently compressing time.
  const byDay = new Map<string, DayPoint>();
  for (const r of trendRows) {
    byDay.set(String(r.day), {
      day: String(r.day),
      storefront_views: num(r.storefront_views),
      item_views: num(r.item_views),
      wa_clicks: num(r.wa_clicks),
      visitors: num(r.visitors),
    });
  }
  const trend: DayPoint[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    trend.push(byDay.get(d) ?? { day: d, storefront_views: 0, item_views: 0, wa_clicks: 0, visitors: 0 });
  }

  return {
    days: span,
    from: trend[0]?.day ?? new Date().toISOString().slice(0, 10),
    totals: {
      storefront_views: storefront,
      item_views: itemViews,
      wa_clicks: clicks,
      visitors: num(totalsRow?.visitors),
      enquiries: num(enquiries?.n),
      view_to_click: itemViews > 0 ? Math.round((clicks / itemViews) * 1000) / 10 : 0,
    },
    deltas: {
      storefront_views: delta(storefront, num(prevRow?.storefront_views)),
      item_views: delta(itemViews, num(prevRow?.item_views)),
      wa_clicks: delta(clicks, num(prevRow?.wa_clicks)),
    },
    trend,
    items: itemRows.map((r) => {
      const views = num(r.views);
      const clicksN = num(r.clicks);
      return {
        id: num(r.id),
        name: String(r.name ?? ''),
        slug: String(r.slug ?? ''),
        url_segment: String(r.url_segment ?? ''),
        type_name: r.type_name ? String(r.type_name) : null,
        views,
        clicks: clicksN,
        ctr: views > 0 ? Math.round((clicksN / views) * 1000) / 10 : null,
      };
    }),
    best: { hour: busiest?.hour ?? null, weekday: busiest?.weekday ?? null },
  };
}
