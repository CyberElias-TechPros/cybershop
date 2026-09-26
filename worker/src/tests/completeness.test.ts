import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

setupIntegration();

let adminCookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status).toBe(200);
  adminCookie = r.cookie!;
}, 30000);

async function registerVendor(suffix: string) {
  const email = `vendor-cx-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor CX ${suffix}`, email, phone: '+2348032222222', password: 'Passw0rd123',
      business_name: `CX Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08032222222', city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, email, name: `CX Store ${suffix}`, businessId: me.json.business.id as number, slug: me.json.business.slug as string };
}

async function buyAddon(cookie: string, slug: string) {
  const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { addon_slug: slug, method: 'bank_transfer' } });
  expect(intent.status, JSON.stringify(intent.json)).toBe(200);
  const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
  expect(appr.status, JSON.stringify(appr.json)).toBe(200);
}

describe('completeness: accounts, staff, blocks, reviews, import', () => {
  it('lets a buyer keep an account, block a seller, and review only after an enquiry', async () => {
    const v = await registerVendor(`rev-${Date.now()}`);
    const item = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: 'Review Gown', item_type_slug: 'product', category_slug: 'fashion', price_kobo: 1500000, price_type: 'fixed', publish: true },
    });
    expect(item.status, JSON.stringify(item.json)).toBe(200);

    const email = `buyer-cx-${Date.now()}@test.ng`;
    const reg = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Ada Buyer', email, password: 'Passw0rd123' } });
    expect(reg.status, JSON.stringify(reg.json)).toBe(200);
    const buyer = reg.cookie!;

    const denied = await api('/api/vendor/items', { cookie: buyer });
    expect(denied.status).toBe(403);

    const early = await api('/api/account/reviews', { method: 'POST', cookie: buyer, body: { business_id: v.businessId, listing_id: item.json.id, rating: 5, body: 'Loved the fabric and the chat.' } });
    expect(early.status).toBe(403);

    const enquiry = await api('/api/public/inquiries', { method: 'POST', cookie: buyer, body: { business_id: v.businessId, listing_id: item.json.id, name: 'Ada' } });
    expect(enquiry.status, JSON.stringify(enquiry.json)).toBe(200);

    const review = await api('/api/account/reviews', { method: 'POST', cookie: buyer, body: { business_id: v.businessId, listing_id: item.json.id, rating: 5, body: 'Loved the fabric and the chat.' } });
    expect(review.status, JSON.stringify(review.json)).toBe(200);

    const page = await api(`/api/public/item?biz=${v.slug}&segment=products&slug=${item.json.slug}`);
    expect(page.json.item.reviews.count).toBe(1);

    const visible = await api(`/api/public/businesses?q=${encodeURIComponent(v.name)}`, { cookie: buyer });
    expect(visible.json.total).toBeGreaterThan(0);

    const block = await api('/api/account/blocks', { method: 'POST', cookie: buyer, body: { business_id: v.businessId } });
    expect(block.status).toBe(200);
    const hidden = await api(`/api/public/businesses?q=${encodeURIComponent(v.name)}`, { cookie: buyer });
    expect((hidden.json.businesses as { slug: string }[]).some((b) => b.slug === v.slug)).toBe(false);
    const gone = await api(`/api/public/business/${v.slug}`, { cookie: buyer });
    expect(gone.status).toBe(404);

    const again = await api('/api/public/inquiries', { method: 'POST', cookie: buyer, body: { business_id: v.businessId, listing_id: item.json.id, name: 'Ada' } });
    expect(again.status).toBe(403);
  });

  it('sells a staff seat instead of mutating the free plan, and limits that seat', async () => {
    const v = await registerVendor(`staff-${Date.now()}`);
    const blocked = await api('/api/vendor/staff/invite', { method: 'POST', cookie: v.cookie, body: { email: `cat-${Date.now()}@test.ng`, role: 'catalogue' } });
    expect(blocked.status).toBe(403);

    await buyAddon(v.cookie, 'extra-staff-account');
    const email = `cat-${Date.now()}@test.ng`;
    const invite = await api('/api/vendor/staff/invite', { method: 'POST', cookie: v.cookie, body: { email, role: 'catalogue' } });
    expect(invite.status, JSON.stringify(invite.json)).toBe(200);
    const token = String(invite.json.invite_url).split('/invite/')[1];
    const preview = await api(`/api/auth/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.json.role).toBe('catalogue');

    const accept = await api('/api/auth/invites/accept', { method: 'POST', body: { token, name: 'Catalogue Hand', password: 'Passw0rd123' } });
    expect(accept.status, JSON.stringify(accept.json)).toBe(200);
    const staff = accept.cookie!;
    const items = await api('/api/vendor/items', { cookie: staff });
    expect(items.status).toBe(200);
    const billing = await api('/api/vendor/payment-intent', { method: 'POST', cookie: staff, body: { addon_slug: 'extra-staff-account', method: 'bank_transfer' } });
    expect(billing.status).toBe(403);
  });

  it('imports catalogue drafts and keeps a scheduled listing off the market', async () => {
    const v = await registerVendor(`csv-${Date.now()}`);
    const csv = await api('/api/vendor/catalog/import', {
      method: 'POST', cookie: v.cookie,
      body: { csv: 'name,price_naira,category\nImported Wrapper,4500,fashion\n' },
    });
    expect(csv.status, JSON.stringify(csv.json)).toBe(200);
    expect(csv.json.created).toBe(1);
    const list = await api('/api/vendor/items?status=draft', { cookie: v.cookie });
    expect((list.json.items as { name: string }[]).some((i) => i.name === 'Imported Wrapper')).toBe(true);

    const when = new Date(Date.now() + 3 * 86400_000).toISOString();
    const scheduled = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: 'Later Drop', item_type_slug: 'product', category_slug: 'fashion', price_kobo: 900000, price_type: 'fixed', publish: true, scheduled_publish_at: when },
    });
    expect(scheduled.status, JSON.stringify(scheduled.json)).toBe(200);
    const row = await api(`/api/vendor/items/${scheduled.json.id}`, { cookie: v.cookie });
    expect(row.json.item.status).toBe('draft');
    const pub = await api(`/api/public/listings?q=${encodeURIComponent('Later Drop')}`);
    expect((pub.json.items as { name: string }[]).some((i) => i.name === 'Later Drop')).toBe(false);
  });

  it('closes an account and frees the email for a new signup', async () => {
    const email = `close-${Date.now()}@test.ng`;
    const reg = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Closer', email, password: 'Passw0rd123' } });
    expect(reg.status).toBe(200);
    const closed = await api('/api/account/close', { method: 'POST', cookie: reg.cookie, body: { password: 'Passw0rd123' } });
    expect(closed.status, JSON.stringify(closed.json)).toBe(200);
    const again = await api('/api/auth/register', { method: 'POST', body: { role: 'buyer', name: 'Closer Two', email, password: 'Passw0rd123' } });
    expect(again.status, JSON.stringify(again.json)).toBe(200);
  });
});
