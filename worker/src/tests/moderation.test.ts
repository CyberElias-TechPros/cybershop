import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';
import { slaFor } from '../lib/moderation';

/**
 * The report queue.
 *
 * A report that nobody owns and nobody answers is worse than no report button
 * at all, because it teaches the reporter that reporting is theatre. These
 * tests pin the three things that were missing: every report has a clock, an
 * owner, and a recorded outcome that actually happens to the thing reported.
 */
setupIntegration();

let adminCookie = '';
let vendorCookie = '';
let businessId = 0;
let listingId = 0;

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;

  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor',
      name: 'Reports Vendor',
      email: 'vendor-reports@test.ng',
      phone: '+2348033334444',
      password: 'Passw0rd123',
      business_name: 'Reports Store',
      category_slug: 'fashion',
      whatsapp_number: '08033334444',
      city: 'Lagos',
    },
  });
  expect(reg.status, JSON.stringify(reg.json)).toBe(200);
  vendorCookie = reg.cookie!;

  const intent = await api('/api/vendor/payment-intent', {
    method: 'POST',
    body: { plan_slug: 'starter', method: 'bank_transfer' },
    cookie: vendorCookie,
  });
  expect(intent.status).toBe(200);
  const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
  expect(appr.status).toBe(200);

  const me = await api('/api/auth/me', { cookie: vendorCookie });
  businessId = me.json.business.id;

  const types = await api('/api/vendor/item-types', { cookie: vendorCookie });
  expect(types.status).toBe(200);
  const typeSlug = types.json.types?.[0]?.slug ?? 'product';
  const categorySlug = types.json.categories?.[0]?.slug ?? 'fashion';
  const created = await api('/api/vendor/items', {
    method: 'POST',
    cookie: vendorCookie,
    body: {
      name: 'A Reported Item',
      item_type_slug: typeSlug,
      category_slug: categorySlug,
      price_kobo: 500000,
      price_type: 'fixed',
      description: 'Reported to test the moderation queue.',
      publish: true,
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(200);
  listingId = created.json.id;
  expect(created.json.status).toBe('published');
}, 60000);

/** File a report as a member of the public. `tag` keeps each one findable. */
async function newReport(tag: string, reason = 'other'): Promise<number> {
  const r = await api('/api/public/reports', {
    method: 'POST',
    body: { entity_type: 'listing', entity_id: listingId, reason, details: `TAG:${tag}` },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  expect(r.json.message).toMatch(/48 hours/);
  const list = await api('/api/admin/reports?status=open', { cookie: adminCookie });
  const row = list.json.reports.find((x: { details: string }) => String(x.details || '').includes(`TAG:${tag}`));
  expect(row, 'report should appear in the open queue').toBeTruthy();
  return row.id;
}

describe('report queue', () => {
  it('stamps an SLA on a report the moment it is filed', async () => {
    const id = await newReport('sla', 'misleading');
    const list = await api('/api/admin/reports?status=open', { cookie: adminCookie });
    expect(list.status).toBe(200);
    const row = list.json.reports.find((r: { id: number }) => r.id === id);
    expect(row.sla_due_at).toBeTruthy();
    expect(row.sla.breached).toBe(false);
    // 48 hours, give or take a minute of test time.
    const hours = (new Date(row.sla.due_at).getTime() - new Date(row.created_at).getTime()) / 3600_000;
    expect(hours).toBeCloseTo(48, 1);
  });

  it('names the business and listing being reported', async () => {
    const list = await api('/api/admin/reports?status=open', { cookie: adminCookie });
    const row = list.json.reports[0];
    expect(row.listing_name).toBe('A Reported Item');
    expect(row.business_name).toBe('Reports Store');
  });

  it('claims a report to the admin who took it, and moves it out of the open queue', async () => {
    const id = await newReport('claim', 'misleading');
    const claim = await api(`/api/admin/reports/${id}/claim`, { method: 'POST', body: {}, cookie: adminCookie });
    expect(claim.status).toBe(200);

    const list = await api('/api/admin/reports?status=investigating', { cookie: adminCookie });
    const row = list.json.reports.find((r: { id: number }) => r.id === id);
    expect(row.assignee_email).toBeTruthy();
    expect(row.triaged_at).toBeTruthy();

    // Opening a report moves it out of the open queue.
    const open = await api('/api/admin/reports?status=open', { cookie: adminCookie });
    expect(open.json.reports.some((r: { id: number }) => r.id === id)).toBe(false);
  });

  it('acts on the outcome, not just notes it', async () => {
    const id = await newReport('act', 'fraud');
    const res = await api(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      cookie: adminCookie,
      body: { status: 'resolved', outcome: 'content_removed', note: 'Removed — it is counterfeit.', act: true },
    });
    expect(res.status).toBe(200);
    expect(String(res.json.acted)).toMatch(/listing/i);

    // The listing is actually off the market, not just noted as naughty.
    const listing = await api(`/api/vendor/items/${listingId}`, { cookie: vendorCookie });
    expect(listing.status).toBe(200);
    expect(listing.json.item?.status ?? listing.json.status).toBe('archived');
  });

  it('tells the reporter what happened', async () => {
    const id = await newReport('notify', 'abusive');
    await api(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      cookie: adminCookie,
      body: { status: 'dismissed', outcome: 'unfounded', note: 'Checked — no violation.', act: false },
    });
    const list = await api('/api/admin/reports?status=dismissed', { cookie: adminCookie });
    const row = list.json.reports.find((r: { id: number }) => r.id === id);
    expect(row.resolution).toBe('unfounded');
    expect(row.resolved_at).toBeTruthy();
    expect(row.resolution_note).toContain('no violation');
  });

  it('refuses an outcome that is not one of the five', async () => {
    const id = await newReport('badoutcome', 'spam');
    const res = await api(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      cookie: adminCookie,
      body: { status: 'resolved', outcome: 'delete_the_internet' },
    });
    expect(res.status).toBe(400);
  });

  it('is admin-only', async () => {
    const r = await api('/api/admin/reports?status=open', { cookie: vendorCookie });
    expect(r.status).toBe(403);
  });

  it('reports the SLA clock in terms the queue can render', () => {
    // Pure: how overdue is this report.
    const created = new Date(Date.now() - 50 * 3600_000).toISOString();
    const overdue = slaFor(created, null);
    expect(overdue.breached).toBe(true);
    expect(overdue.hours_left).toBeLessThan(0);

    const fresh = slaFor(new Date().toISOString(), null);
    expect(fresh.breached).toBe(false);
    expect(fresh.hours_left).toBeCloseTo(48, 0);

    // An explicit due date always wins — it is what the sweep set.
    const forced = slaFor(created, new Date(Date.now() + 3600_000).toISOString());
    expect(forced.breached).toBe(false);
    expect(forced.hours_left).toBeCloseTo(1, 0);
  });

  it('counts the queue by status for the filter chips', async () => {
    await newReport('counts', 'other');
    const list = await api('/api/admin/reports?status=open', { cookie: adminCookie });
    expect(list.json.sla_hours).toBe(48);
    expect(Array.isArray(list.json.counts)).toBe(true);
    expect(list.json.counts.some((c: { status: string }) => c.status === 'open')).toBe(true);
  });
});
