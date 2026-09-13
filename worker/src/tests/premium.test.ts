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
  const email = `vendor-pm-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor PM ${suffix}`, email, phone: '+2348031111111', password: 'Passw0rd123',
      business_name: `PM Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08031111111', city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
  expect(r.status).toBe(200);
  const me = await api('/api/auth/me', { cookie });
  return { cookie, businessId: me.json.business.id as number, businessSlug: me.json.business.slug as string };
}

async function buyAddon(cookie: string, slug: string) {
  const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { addon_slug: slug, method: 'bank_transfer' } });
  expect(intent.status, JSON.stringify(intent.json)).toBe(200);
  const appr = await api(`/api/admin/payments/${intent.json.payment.id}/approve`, { method: 'POST', cookie: adminCookie });
  expect(appr.status, JSON.stringify(appr.json)).toBe(200);
}

async function createProduct(cookie: string, name: string, extra: Record<string, unknown> = {}) {
  const r = await api('/api/vendor/items', {
    method: 'POST', cookie,
    body: {
      name, item_type_slug: 'product', category_slug: 'fashion',
      price_kobo: 2500000, price_type: 'fixed', publish: true, stock_status: 'in_stock',
      ...extra,
    },
  });
  return r;
}

describe('premium add-ons (vendors pay; WhatsApp stays free)', () => {
  it('gates in-app chat, then opens a guest thread after the vendor buys the add-on', async () => {
    const v = await registerVendor('chat');
    const item = await createProduct(v.cookie, 'Chat Gown');
    expect(item.status).toBe(200);

    const blocked = await api('/api/public/threads', {
      method: 'POST',
      body: { business_id: v.businessId, listing_id: item.json.id, name: 'Ada', body: 'Is this still available?' },
    });
    expect(blocked.status).toBe(403);

    await buyAddon(v.cookie, 'in-app-chat');

    const opened = await api('/api/public/threads', {
      method: 'POST',
      body: { business_id: v.businessId, listing_id: item.json.id, name: 'Ada', body: 'Is this still available?' },
    });
    expect(opened.status, JSON.stringify(opened.json)).toBe(200);
    expect(opened.json.token).toMatch(/^[a-f0-9]{32}$/);

    const view = await api(`/api/public/threads/${opened.json.token}`);
    expect(view.status).toBe(200);
    expect(view.json.messages.length).toBe(1);

    const inbox = await api('/api/vendor/threads', { cookie: v.cookie });
    expect(inbox.json.locked).toBe(false);
    expect(inbox.json.threads.length).toBe(1);

    const page = await api(`/api/public/item?biz=${v.businessSlug}&segment=products&slug=${item.json.slug}`);
    expect(page.json.business.premium.chat).toBe(true);
  });

  it('rejects boosted ads on free plan, then allows one after Featured listing add-on', async () => {
    const v = await registerVendor('boost');
    const no = await createProduct(v.cookie, 'Boost Me', { featured: true });
    expect(no.status).toBe(403);

    await buyAddon(v.cookie, 'featured-listing');
    const yes = await createProduct(v.cookie, 'Boosted Tee', { featured: true });
    expect(yes.status, JSON.stringify(yes.json)).toBe(200);

    const extra = await createProduct(v.cookie, 'Second Boost', { featured: true });
    expect(extra.status).toBe(403);

    const saved = await api(`/api/vendor/items/${yes.json.id}`, { cookie: v.cookie });
    expect(saved.json.item.featured).toBeTruthy();

    const feed = await api('/api/public/listings?q=Boosted%20Tee');
    const hit = (feed.json.items as { name: string; boosted?: boolean }[]).find((i) => i.name === 'Boosted Tee');
    expect(hit, JSON.stringify(feed.json)).toBeTruthy();
    expect(hit?.boosted).toBe(true);
  });

  it('blocks jobs and deposits until the matching add-on is paid, then records a Paystack deposit', async () => {
    const v = await registerVendor('esc');
    const job = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: 'Shop assistant', item_type_slug: 'job', price_type: 'negotiable', publish: true },
    });
    expect(job.status).toBe(403);

    await buyAddon(v.cookie, 'jobs-board');
    const hired = await api('/api/vendor/items', {
      method: 'POST', cookie: v.cookie,
      body: { name: 'Shop assistant', item_type_slug: 'job', price_type: 'negotiable', publish: true },
    });
    expect(hired.status, JSON.stringify(hired.json)).toBe(200);

    const jobs = await api('/api/public/listings?category=jobs');
    expect((jobs.json.items as { name: string }[]).some((i) => i.name === 'Shop assistant')).toBe(true);

    const item = await createProduct(v.cookie, 'Escrow Phone');
    const noDep = await api('/api/public/deposits', {
      method: 'POST',
      body: { listing_id: item.json.id, amount_kobo: 500000, email: 'buyer@test.ng', name: 'Bola' },
    });
    expect(noDep.status).toBe(403);

    await buyAddon(v.cookie, 'buyer-escrow');
    const dep = await api('/api/public/deposits', {
      method: 'POST',
      body: { listing_id: item.json.id, amount_kobo: 500000, email: 'buyer@test.ng', name: 'Bola' },
    });
    expect(dep.status, JSON.stringify(dep.json)).toBe(200);
    expect(dep.json.reference).toMatch(/^CS-DEP-/);
    expect(dep.json.paystack.url).toContain('/paystack/mock');

    const wh = await api('/api/webhooks/paystack/mock', { method: 'POST', body: { reference: dep.json.reference }, authed: false });
    expect(wh.json.ok).toBe(true);

    const check = await api(`/api/public/deposits/${dep.json.reference}`);
    expect(check.json.deposit.status).toBe('paid');

    const vendorDeps = await api('/api/vendor/deposits', { cookie: v.cookie });
    expect(vendorDeps.json.locked).toBe(false);
    const row = vendorDeps.json.deposits[0];
    expect(row.status).toBe('paid');
    const rel = await api(`/api/vendor/deposits/${row.id}/release`, { method: 'POST', cookie: v.cookie, body: {} });
    expect(rel.status).toBe(200);
  });
});
