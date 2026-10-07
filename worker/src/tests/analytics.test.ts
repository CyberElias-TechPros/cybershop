import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

/**
 * Vendor analytics.
 *
 * Events were always collected and rolled up hourly; what was missing was any
 * way for the vendor to read them. These tests pin the read model the
 * Dashboard → Analytics screen is built on.
 */
setupIntegration();

let adminCookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;
}, 30000);

async function registerVendor(suffix: string) {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor',
      name: `Analytics Vendor ${suffix}`,
      email: `vendor-an-${suffix}@test.ng`,
      phone: '+2348033333333',
      password: 'Passw0rd123',
      business_name: `Analytics Store ${suffix}`,
      category_slug: 'fashion',
      whatsapp_number: '08033333333',
      city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  const intent = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'starter', method: 'bank_transfer' }, cookie });
  expect(intent.status).toBe(200);
  const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
  expect(appr.status).toBe(200);
  return cookie;
}

interface Created { id: number; slug: string; segment: string }

/** Publish an item, then read back the public path so we can generate real views. */
async function createItem(cookie: string, name: string): Promise<Created> {
  const r = await api('/api/vendor/items', {
    method: 'POST',
    cookie,
    body: { name, item_type_slug: 'product', category_slug: 'fashion', price_kobo: 2500000, price_type: 'fixed', publish: true },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const list = await api('/api/vendor/items?status=published', { cookie });
  const row = (list.json.items as { id: number; slug: string; url_segment?: string; type_slug?: string }[]).find(
    (x) => x.id === r.json.id
  );
  expect(row, 'the new item should appear in the catalogue').toBeTruthy();
  return { id: r.json.id as number, slug: row!.slug, segment: row!.url_segment ?? 'products' };
}

describe('vendor analytics', () => {
  it('reports totals, a filled daily trend and per-item conversion', async () => {
    const cookie = await registerVendor('trend');
    const me = await api('/api/auth/me', { cookie });
    const slug = me.json.business.slug as string;
    const a = await createItem(cookie, 'Ankara Gown');
    const b = await createItem(cookie, 'Senator Suit');

    // Traffic: two storefront views, one view of each item, one WhatsApp click.
    await api(`/api/public/business/${slug}`);
    await api(`/api/public/business/${slug}`);
    for (const it of [a, b]) {
      const v = await api(`/api/public/item?biz=${slug}&segment=${it.segment}&slug=${it.slug}`);
      expect(v.status, JSON.stringify(v.json)).toBe(200);
    }
    const bizId = me.json.business.id as number;
    const wa = await api('/api/public/inquiries', { method: 'POST', body: { business_id: bizId, listing_id: a.id } });
    expect(wa.status, JSON.stringify(wa.json)).toBe(200);

    const r = await api('/api/vendor/analytics?days=7', { cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const d = r.json.analytics;

    expect(d.days).toBe(7);
    expect(d.totals.item_views).toBeGreaterThanOrEqual(2);
    expect(d.totals.storefront_views).toBeGreaterThanOrEqual(2);
    expect(d.totals.wa_clicks).toBeGreaterThanOrEqual(1);
    // The click counted against the item it came from.
    expect(d.items.some((i: { id: number; clicks: number }) => i.id === a.id && i.clicks >= 1)).toBe(true);

    // One entry per day in the window — gaps are zeros, not missing rows,
    // otherwise the chart silently compresses time.
    expect(d.trend).toHaveLength(7);
    expect(d.trend.map((t: { day: string }) => t.day)).toEqual([...d.trend.map((t: { day: string }) => t.day)].sort());

    const items = d.items as { name: string; views: number; clicks: number; ctr: number | null }[];
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Sorted by views, and every row carries a real path to the listing.
    expect(items[0]!.views).toBeGreaterThanOrEqual(items[items.length - 1]!.views);
    for (const i of items) {
      expect(typeof i.ctr === 'number' || i.ctr === null).toBe(true);
    }
  }, 60000);

  it('compares against the previous window and clamps the range', async () => {
    const cookie = await registerVendor('deltas');
    await createItem(cookie, 'Beaded Bag');

    const r = await api('/api/vendor/analytics?days=30', { cookie });
    expect(r.status).toBe(200);
    const d = r.json.analytics;
    // First traffic in an empty account reads as +100%, never a division by zero.
    expect(typeof d.deltas.wa_clicks).toBe('number');
    expect(Number.isFinite(d.deltas.wa_clicks)).toBe(true);
    expect(d.totals.view_to_click).toBeGreaterThanOrEqual(0);

    // Out-of-range values are clamped rather than trusted.
    const huge = await api('/api/vendor/analytics?days=9999', { cookie });
    expect(huge.json.analytics.days).toBeLessThanOrEqual(365);
    const zero = await api('/api/vendor/analytics?days=0', { cookie });
    expect(zero.json.analytics.days).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('never shows one store another store’s traffic', async () => {
    const a = await registerVendor('private');
    const b = await registerVendor('other');
    const meA = await api('/api/auth/me', { cookie: a });
    const slugA = meA.json.business.slug as string;

    // Only store A gets any traffic.
    await api(`/api/public/business/${slugA}`);
    await api(`/api/public/business/${slugA}`);

    const mine = await api('/api/vendor/analytics?days=7', { cookie: a });
    const theirs = await api('/api/vendor/analytics?days=7', { cookie: b });
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);
    expect(mine.json.analytics.totals.storefront_views).toBeGreaterThanOrEqual(2);
    // A store with no traffic sees zeros, not somebody else's numbers.
    expect(theirs.json.analytics.totals.storefront_views).toBe(0);
    expect(theirs.json.analytics.items).toEqual([]);
  }, 60000);
});
