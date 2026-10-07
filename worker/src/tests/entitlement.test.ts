import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

/**
 * The platform owner's store — Cyber Elias Academy, whose platform CyberShop
 * is — must sit on the highest package permanently and never be charged.
 *
 * These tests pin the three ways that could silently break:
 *   1. quotas stop being unlimited (the 13-course catalogue stops fitting);
 *   2. the store gets expired or suspended by the billing lifecycle;
 *   3. the vendor is asked to pay for a plan they are entitled to for free.
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
      name: `Entitlement Vendor ${suffix}`,
      email: `vendor-ent-${suffix}@test.ng`,
      phone: '+2348032222222',
      password: 'Passw0rd123',
      business_name: `Entitlement Store ${suffix}`,
      category_slug: 'academy',
      whatsapp_number: '08032222222',
      city: 'Port Harcourt',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  // Start on the free plan so the store has a real subscription to replace.
  const free = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(free.status, JSON.stringify(free.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, businessId: me.json.business.id as number };
}

async function grant(v: { businessId: number }, planSlug: string, extra: Record<string, unknown> = {}) {
  return api(`/api/admin/vendors/${v.businessId}/entitlement`, {
    method: 'POST',
    cookie: adminCookie,
    body: { plan_slug: planSlug, reason: 'Platform owner — CyberShop is Cyber Elias Academy’s own platform.', ...extra },
  });
}

describe('platform entitlement (a plan granted permanently, free of charge)', () => {
  it('puts the store on the granted plan with no payment and no expiry', async () => {
    const v = await registerVendor('grant');

    // Beforehand the store is on the free plan: 10 catalogue items, charged.
    const before = await api('/api/vendor/plans', { cookie: v.cookie });
    expect(before.json.entitlement).toBeNull();
    expect(before.json.subscription.plan_slug).toBe('free');

    const g = await grant(v, 'enterprise', { is_platform_owner: true });
    expect(g.status, JSON.stringify(g.json)).toBe(200);
    expect(g.json.entitlement.plan_slug).toBe('enterprise');
    expect(g.json.entitlement.is_platform_owner).toBe(true);

    // Unlimited where it matters. -1 is the “no limit” sentinel.
    const quotas = (await api('/api/vendor/business', { cookie: v.cookie })).json.quotas;
    expect(quotas.plan_slug).toBe('enterprise');
    expect(quotas.max_listings).toBe(-1);
    expect(quotas.max_storage_mb).toBe(-1);
    expect(quotas.max_categories).toBe(-1);

    // The perpetual subscription is what every other screen reads.
    const after = await api('/api/vendor/plans', { cookie: v.cookie });
    expect(after.json.subscription.plan_slug).toBe('enterprise');
    expect(after.json.subscription.expires_at).toBeNull();
    expect(after.json.subscription.status).toBe('active');

    // The store is live, verified and featured without anyone paying for it.
    const pub = await api(`/api/public/business/entitlement-store-grant`);
    expect(pub.json.business.is_platform_owner).toBe(true);
    expect(pub.json.business.verification_status).toBe('verified');
    expect(pub.json.business.featured).toBe(true);
  }, 60000);

  it('lifts the free plan’s 10-item cap, so a 13-course catalogue fits', async () => {
    const v = await registerVendor('catalogue');

    // 11 items on the free plan — the 11th must be refused.
    for (let i = 1; i <= 10; i++) {
      const r = await api('/api/vendor/items', {
        method: 'POST',
        cookie: v.cookie,
        body: { name: `Course ${i}`, item_type_slug: 'course', category_slug: 'academy', price_kobo: 2000000, price_type: 'fixed', publish: true, custom_fields: { duration: '2 weeks' } },
      });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
    }
    const capped = await api('/api/vendor/items', {
      method: 'POST',
      cookie: v.cookie,
      body: { name: 'Course 11', item_type_slug: 'course', category_slug: 'academy', price_kobo: 2000000, price_type: 'fixed', publish: true, custom_fields: { duration: '2 weeks' } },
    });
    // quota_exceeded is a 403 in this API (see lib/errors.ts).
    expect(capped.status).toBe(403);
    expect(capped.json.error.code).toBe('quota_exceeded');

    // Grant the top plan → the cap disappears, no payment involved.
    expect((await grant(v, 'enterprise')).status).toBe(200);
    for (let i = 11; i <= 13; i++) {
      const r = await api('/api/vendor/items', {
        method: 'POST',
        cookie: v.cookie,
        body: { name: `Course ${i}`, item_type_slug: 'course', category_slug: 'academy', price_kobo: 2000000, price_type: 'fixed', publish: true, custom_fields: { duration: '2 weeks' } },
      });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
    }
  }, 120000);

  it('survives the billing lifecycle — the expiry cron cannot touch it', async () => {
    const v = await registerVendor('cron');

    // Force the store into the states the lifecycle drives it through.
    await api(`/api/admin/vendors/${v.businessId}/suspend`, { method: 'POST', cookie: adminCookie, body: { note: 'test' } });
    let biz = await api(`/api/admin/vendors/${v.businessId}`, { cookie: adminCookie });
    expect(biz.json.business.status).toBe('suspended');

    expect((await grant(v, 'enterprise')).status).toBe(200);

    // Granting repairs the store immediately…
    biz = await api(`/api/admin/vendors/${v.businessId}`, { cookie: adminCookie });
    expect(biz.json.business.status).toBe('active');

    // …and the hourly job keeps it that way, with no expiry to find.
    const cron = await api('/api/cron/hourly', { method: 'POST' });
    expect(cron.status, JSON.stringify(cron.json)).toBe(200);
    expect(cron.json.summary.entitlements_synced).toBeGreaterThanOrEqual(1);
    expect(cron.json.summary.expired_subs ?? 0).toBe(0);

    const after = await api('/api/vendor/plans', { cookie: v.cookie });
    expect(after.json.subscription.status).toBe('active');
    expect(after.json.subscription.expires_at).toBeNull();
  }, 60000);

  it('refuses to grant a plan without a reason on the record', async () => {
    const v = await registerVendor('noreason');
    const r = await api(`/api/admin/vendors/${v.businessId}/entitlement`, {
      method: 'POST',
      cookie: adminCookie,
      body: { plan_slug: 'enterprise' },
    });
    expect(r.status).toBe(400);

    const bad = await api(`/api/admin/vendors/${v.businessId}/entitlement`, {
      method: 'POST',
      cookie: adminCookie,
      body: { plan_slug: 'not-a-plan', reason: 'test' },
    });
    expect(bad.status).toBe(400);
  }, 60000);

  it('scores the store and tells the vendor what to fix next', async () => {
    const v = await registerVendor('strength');
    const before = await api('/api/vendor/overview', { cookie: v.cookie });
    expect(before.status, JSON.stringify(before.json)).toBe(200);
    const c = before.json.completeness;
    expect(c).toBeTruthy();
    // A brand-new store has no photo, no About text and nothing published.
    expect(c.pct).toBeLessThan(60);
    expect(c.level).not.toBe('strong');
    // Every missing item is actionable and points somewhere real in the app.
    for (const item of c.missing) {
      expect(item.href.startsWith('/dashboard/')).toBe(true);
      expect(typeof item.label).toBe('string');
    }
    // The heaviest item is offered first — that is the point of the score.
    const weights = c.missing.map((i: { weight: number }) => i.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);

    // Filling things in moves the number.
    const logo = new FormData();
    logo.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'logo.jpg', { type: 'image/jpeg' }));
    await api('/api/vendor/media/upload', { method: 'POST', cookie: v.cookie, form: logo });
    const media = await api('/api/vendor/media', { cookie: v.cookie });
    const first = media.json.media?.[0];
    if (first) {
      await api('/api/vendor/business/media', { method: 'POST', cookie: v.cookie, body: { field: 'logo', media_id: first.id } });
      const after = await api('/api/vendor/overview', { cookie: v.cookie });
      expect(after.json.completeness.pct).toBeGreaterThan(c.pct);
      expect(after.json.completeness.done.map((i: { key: string }) => i.key)).toContain('logo');
    }
  }, 60000);

  it('gives 30 days’ notice when a granted plan is taken away', async () => {
    const v = await registerVendor('revoke');
    expect((await grant(v, 'enterprise')).status).toBe(200);

    const off = await api(`/api/admin/vendors/${v.businessId}/entitlement`, {
      method: 'DELETE',
      cookie: adminCookie,
      body: { reason: 'No longer the platform owner.' },
    });
    expect(off.status, JSON.stringify(off.json)).toBe(200);

    const plans = await api('/api/vendor/plans', { cookie: v.cookie });
    expect(plans.json.entitlement).toBeNull();
    // Not cut off on the spot — the store keeps working while it decides.
    expect(plans.json.subscription.expires_at).toBeTruthy();
    const days = (new Date(plans.json.subscription.expires_at).getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  }, 60000);
});
