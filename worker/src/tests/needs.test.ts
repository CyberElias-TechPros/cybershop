import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

setupIntegration();

let adminCookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;
}, 30000);

async function openStore(suffix: string, extra: Record<string, unknown> = {}) {
  const email = `need-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Need ${suffix}`, email, phone: '+2348033333333', password: 'Passw0rd123',
      business_name: `Need Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08033333333', city: 'Lagos',
      ...extra,
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  const free = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(free.status, JSON.stringify(free.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  const biz = await api('/api/vendor/business', { cookie });
  return { cookie, email, businessId: me.json.business.id as number, slug: me.json.business.slug as string, name: biz.json.business.name as string, referral: biz.json.referral as { code: string; credit_kobo: number } };
}

describe('needs: storefront, saved stores, referrals, offers in the chat', () => {
  it('lets a buyer save a store and a vendor shape the storefront', async () => {
    const v = await openStore(`sf-${Date.now()}`);
    const saved = await api('/api/vendor/business', {
      method: 'PUT', cookie: v.cookie,
      body: {
        name: v.name,
        storefront: { style: 'minimal', hours: 'Mon–Sat 9–6', sections: { about: false, faq: true }, faq: [{ q: 'Do you deliver?', a: 'Yes, we agree the fee on WhatsApp.' }] },
      },
    });
    expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    const page = await api(`/api/public/business/${v.slug}`);
    expect(page.json.business.storefront.hours).toBe('Mon–Sat 9–6');
    expect(page.json.business.storefront.sections.about).toBe(false);
    expect(page.json.business.storefront.faq[0].q).toBe('Do you deliver?');

    const buyer = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Store Saver', email: `saver-${Date.now()}@test.ng`, password: 'Passw0rd123' } });
    expect(buyer.status).toBe(200);
    const toggle = await api('/api/account/businesses', { method: 'POST', cookie: buyer.cookie, body: { business_id: v.businessId } });
    expect(toggle.json.saved).toBe(true);
    const list = await api('/api/account/businesses', { cookie: buyer.cookie });
    expect((list.json.businesses as { id: number }[]).some((b) => b.id === v.businessId)).toBe(true);
  });

  it('puts the live offer into the WhatsApp message', async () => {
    const v = await openStore(`off-${Date.now()}`);
    const item = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: 'Offer Gown', item_type_slug: 'product', category_slug: 'fashion', price_kobo: 2000000, price_type: 'fixed', publish: true },
    });
    expect(item.status).toBe(200);
    const offer = await api('/api/vendor/offers', { method: 'POST', cookie: v.cookie, body: { title: 'Early bird 10 percent', kind: 'percent_off', value: 10 } });
    expect(offer.status, JSON.stringify(offer.json)).toBe(200);
    const enquiry = await api('/api/public/inquiries', { method: 'POST', body: { business_id: v.businessId, listing_id: item.json.id, name: 'Tunde' } });
    expect(enquiry.status, JSON.stringify(enquiry.json)).toBe(200);
    expect(String(enquiry.json.message)).toContain('Early bird 10 percent');
  });

  it('credits the referrer after the referred store pays, then spends that credit', async () => {
    const a = await openStore(`refa-${Date.now()}`);
    expect(a.referral.code).toMatch(/^[a-f0-9]{8}$/);
    const b = await openStore(`refb-${Date.now()}`, { referral_code: a.referral.code });
    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie: b.cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    expect(intent.status, JSON.stringify(intent.json)).toBe(200);
    const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
    expect(appr.status, JSON.stringify(appr.json)).toBe(200);
    const home = await api('/api/account/home', { cookie: a.cookie });
    expect(home.json.referral.credit_kobo).toBe(150_000);
    const next = await api('/api/vendor/payment-intent', { method: 'POST', cookie: a.cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    expect(next.status, JSON.stringify(next.json)).toBe(200);
    expect(next.json.payment.amount).toBe(1_350_000);
  });

  it('hides a paused store from the market but lets the owner preview it', async () => {
    const v = await openStore(`pause-${Date.now()}`);
    const name = `Pause Gown ${Date.now()}`;
    const item = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name, item_type_slug: 'product', category_slug: 'fashion', price_kobo: 1500000, price_type: 'fixed', publish: true },
    });
    expect(item.status, JSON.stringify(item.json)).toBe(200);
    const live = await api(`/api/public/listings?q=${encodeURIComponent(name)}`);
    expect(live.json.total).toBe(1);
    const paused = await api('/api/vendor/business/pause', { method: 'POST', cookie: v.cookie, body: { paused: true } });
    expect(paused.json.paused).toBe(true);
    const hidden = await api(`/api/public/listings?q=${encodeURIComponent(name)}`);
    expect(hidden.json.total).toBe(0);
    const guest = await api(`/api/public/business/${v.slug}`);
    expect(guest.json.unavailable).toBe(true);
    expect(guest.json.unavailable_reason).toBe('paused');
    expect(guest.json.items).toEqual([]);
    expect(guest.json.business.whatsapp_number).toBeNull();
    const owner = await api(`/api/public/business/${v.slug}`, { cookie: v.cookie });
    expect(owner.json.preview).toBe(true);
    expect((owner.json.items as unknown[]).length).toBe(1);
    const back = await api('/api/vendor/business/pause', { method: 'POST', cookie: v.cookie, body: { paused: false } });
    expect(back.json.paused).toBe(false);
    const again = await api(`/api/public/listings?q=${encodeURIComponent(name)}`);
    expect(again.json.total).toBe(1);
  });

  it('filters listings by a category select field', async () => {
    const stamp = `cond-${Date.now()}`;
    const v = await openStore(stamp, { category_slug: 'technology' });
    const mk = (label: string, condition: string) => api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: `${stamp} ${label}`, item_type_slug: 'product', category_slug: 'technology', price_kobo: 900000, price_type: 'fixed', publish: true, custom_fields: { condition } },
    });
    expect((await mk('new', 'Brand new')).status).toBe(200);
    expect((await mk('used', 'Used - good')).status).toBe(200);
    const filtered = await api(`/api/public/listings?q=${encodeURIComponent(stamp)}&category=technology&cf_condition=${encodeURIComponent('Brand new')}`);
    expect(filtered.status).toBe(200);
    expect(filtered.json.total).toBe(1);
    expect((filtered.json.items as { name: string }[])[0].name).toContain('new');
    expect((filtered.json.field_filters as { key: string }[]).some((f) => f.key === 'condition')).toBe(true);
  });

  it('lets an admin feature a store, extend a plan, refund a payment, and suspend a buyer', async () => {
    const a = await openStore(`opsa-${Date.now()}`);
    const feat = await api(`/api/admin/vendors/${a.businessId}/feature`, { method: 'POST', cookie: adminCookie, body: { featured: true, days: 7 } });
    expect(feat.status, JSON.stringify(feat.json)).toBe(200);
    const page = await api(`/api/public/business/${a.slug}`);
    expect(page.json.business.featured).toBe(true);

    const subs = await api('/api/admin/subscriptions', { cookie: adminCookie });
    const sub = (subs.json.subscriptions as { id: number; business_name: string }[]).find((s) => s.business_name === a.name);
    expect(sub).toBeTruthy();
    const ext = await api(`/api/admin/subscriptions/${sub!.id}/extend`, { method: 'POST', cookie: adminCookie, body: { days: 30 } });
    expect(ext.status, JSON.stringify(ext.json)).toBe(200);
    expect(String(ext.json.expires_at).length).toBeGreaterThan(8);

    const b = await openStore(`opsb-${Date.now()}`, { referral_code: a.referral.code });
    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie: b.cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    expect(intent.status, JSON.stringify(intent.json)).toBe(200);
    const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
    expect(appr.status).toBe(200);
    const credited = await api('/api/account/home', { cookie: a.cookie });
    expect(credited.json.referral.credit_kobo).toBe(150_000);
    const refund = await api(`/api/admin/payments/${intent.json.payment.id}/refund`, { method: 'POST', cookie: adminCookie, body: { reason: 'Vendor asked for the money back.' } });
    expect(refund.status, JSON.stringify(refund.json)).toBe(200);
    const cleared = await api('/api/account/home', { cookie: a.cookie });
    expect(cleared.json.referral.credit_kobo).toBe(0);
    const still = await api(`/api/public/business/${b.slug}`);
    expect(still.json.unavailable).toBeFalsy();

    const email = `buyer-sus-${Date.now()}@test.ng`;
    const buyer = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Sus Buyer', email, password: 'Passw0rd123' } });
    expect(buyer.status).toBe(200);
    const found = await api(`/api/admin/users?q=${encodeURIComponent(email)}`, { cookie: adminCookie });
    const user = (found.json.users as { id: number }[])[0];
    const sus = await api(`/api/admin/users/${user.id}/suspend`, { method: 'POST', cookie: adminCookie });
    expect(sus.status).toBe(200);
    const denied = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    expect(denied.status).toBe(403);
    const back = await api(`/api/admin/users/${user.id}/activate`, { method: 'POST', cookie: adminCookie });
    expect(back.status).toBe(200);
    const ok = await api('/api/auth/login', { method: 'POST', body: { email, password: 'Passw0rd123' } });
    expect(ok.status).toBe(200);
  });
});
