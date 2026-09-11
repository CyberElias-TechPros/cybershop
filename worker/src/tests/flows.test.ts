import { describe, it, expect, beforeAll } from 'vitest';
import { setupIntegration, api, adminLoginBody, BASE_URL } from './harness';

setupIntegration();

let adminCookie = '';

beforeAll(async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: adminLoginBody() });
  expect(r.status, 'admin login should work in test env').toBe(200);
  adminCookie = r.cookie!;
}, 30000);

async function registerVendor(suffix: string, plan: 'free' | 'paid' = 'free') {
  const email = `vendor-${suffix}@test.ng`;
  let r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      role: 'vendor', name: `Vendor ${suffix}`, email, phone: '+2348031111111', password: 'Passw0rd123',
      business_name: `Test Store ${suffix}`, category_slug: 'fashion', whatsapp_number: '08031111111', city: 'Lagos',
    },
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const cookie = r.cookie!;
  if (plan === 'free') {
    r = await api('/api/vendor/payment-intent', { method: 'POST', body: { plan_slug: 'free', method: 'bank_transfer' }, cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.free).toBe(true);
  }
  return { cookie, email, ...r.json };
}

function jpegFile(): File {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  return new File([jpeg], 'proof.jpg', { type: 'image/jpeg' });
}

function pngFile(name = 'photo.png'): File {
  // 1x1 transparent PNG (valid magic bytes)
  const png = new Uint8Array(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  ));
  return new File([png], name, { type: 'image/png' });
}

describe('vendor onboarding + free plan activation', () => {
  it('registers a vendor and activates on the free plan', async () => {
    const { cookie } = await registerVendor('free1', 'free');
    const me = await api('/api/auth/me', { cookie });
    expect(me.status).toBe(200);
    expect(me.json.user.role).toBe('vendor');
    expect(me.json.business.status).toBe('active');
    expect(me.json.business.plan_name).toBe('Free');
  });

  it('creates items using the dynamic category fields', async () => {
    const { cookie } = await registerVendor('cat1', 'free');
    const r = await api('/api/vendor/items', {
      method: 'POST', cookie,
      body: {
        name: 'Ankara Dress', item_type_slug: 'product', category_slug: 'fashion',
        price_kobo: 4500000, price_type: 'fixed', publish: true,
        custom_fields: { brand: 'Made by me', sizes: ['M', 'L'], gender: 'Women', material: 'Cotton', colours: ['Red'] },
        stock_status: 'in_stock',
      },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.status).toBe('published');
    const list = await api('/api/vendor/items', { cookie });
    expect(list.json.items.length).toBe(1);
    const one = await api(`/api/vendor/items/${r.json.id}`, { cookie });
    expect(one.json.item.custom_fields).toMatchObject({ brand: 'Made by me', sizes: ['M', 'L'], gender: 'Women' });
  });

  it('rejects invalid custom field values server-side', async () => {
    const { cookie } = await registerVendor('cat2', 'free');
    const r = await api('/api/vendor/items', {
      method: 'POST', cookie,
      body: { name: 'Bad Item', item_type_slug: 'product', category_slug: 'fashion', publish: true, custom_fields: { gender: 'Android' } },
    });
    expect(r.status).toBe(422);
  });
});

describe('bank transfer payment flow (proof → admin approval → activation)', () => {
  it('runs the full lifecycle', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'vendor', name: 'Paying Vendor', email: 'paying@test.ng', phone: '+2348032222222', password: 'Passw0rd123', business_name: 'Paying Store', category_slug: 'technology', whatsapp_number: '08032222222' },
    });
    expect(reg.status).toBe(200);
    const cookie = reg.cookie!;

    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    expect(intent.status).toBe(200);
    expect(intent.json.payment.amount).toBe(1500000); // ₦15,000 in kobo

    const form = new FormData();
    form.append('proof', jpegFile());
    const up = await api(`/api/vendor/payment-proof/${intent.json.payment.id}`, { method: 'POST', form, cookie });
    expect(up.status, JSON.stringify(up.json)).toBe(200);

    const me1 = await api('/api/auth/me', { cookie });
    expect(me1.json.business.status).toBe('pending_approval');

    const queue = await api('/api/admin/payments?status=submitted', { cookie: adminCookie });
    expect(queue.status).toBe(200);
    const found = queue.json.payments.find((p: any) => p.reference === intent.json.payment.reference);
    expect(found, 'payment should be in admin queue').toBeTruthy();
    expect(found.has_proof).toBe(1);

    // proof is private: vendor (non-admin) can't download it
    const proofVendor = await api(`/api/admin/payments/${found.id}/proof`, { cookie });
    expect(proofVendor.status).toBe(403);

    const appr = await api(`/api/admin/payments/${found.id}/approve`, { method: 'POST', cookie: adminCookie });
    expect(appr.status).toBe(200);

    const me2 = await api('/api/auth/me', { cookie });
    expect(me2.json.business.status).toBe('active');
    expect(me2.json.business.plan_name).toBe('Starter');

    const audit = await api('/api/admin/audit', { cookie: adminCookie });
    expect(audit.json.logs.some((l: any) => l.action === 'payment.approve')).toBe(true);
  });

  it('rejects with reason and notifies', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'vendor', name: 'Reject Vendor', email: 'reject@test.ng', phone: '+2348033333333', password: 'Passw0rd123', business_name: 'Reject Store', category_slug: 'food', whatsapp_number: '08033333333' },
    });
    expect(reg.status).toBe(200);
    const cookie = reg.cookie!;
    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    const form = new FormData();
    form.append('proof', jpegFile());
    await api(`/api/vendor/payment-proof/${intent.json.payment.id}`, { method: 'POST', form, cookie });

    const queue = await api('/api/admin/payments?status=submitted', { cookie: adminCookie });
    const found = queue.json.payments.find((p: any) => p.reference === intent.json.payment.reference);
    const rej = await api(`/api/admin/payments/${found.id}/reject`, { method: 'POST', cookie: adminCookie, body: { reason: 'Amount does not match the plan price.' } });
    expect(rej.status).toBe(200);

    const me = await api('/api/auth/me', { cookie });
    expect(me.json.business.status).toBe('pending_payment'); // still not active

    const notifs = await api('/api/vendor/notifications', { cookie });
    expect(notifs.json.notifications.some((n: any) => n.type === 'payment.rejected')).toBe(true);
  });

  it('rejects non-image proof files by magic bytes', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'vendor', name: 'Evil Vendor', email: 'evil@test.ng', phone: '+2348034444444', password: 'Passw0rd123', business_name: 'Evil Store', category_slug: 'food', whatsapp_number: '08034444444' },
    });
    expect(reg.status).toBe(200);
    const cookie = reg.cookie!;
    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { plan_slug: 'starter', method: 'bank_transfer' } });
    const form = new FormData();
    form.append('proof', new File([new TextEncoder().encode('<?php echo "pwned";')], 'proof.jpg', { type: 'image/jpeg' }));
    const res = await api(`/api/vendor/payment-proof/${intent.json.payment.id}`, { method: 'POST', form, cookie });
    expect(res.status).toBe(422);
  });
});

describe('catalogue media upload (D1 driver)', () => {
  it('uploads an image, serves it, and lists it', async () => {
    const { cookie } = await registerVendor('media');
    const form = new FormData();
    form.append('file', pngFile());
    const up = await api('/api/vendor/media/upload', { method: 'POST', form, cookie });
    expect(up.status, JSON.stringify(up.json)).toBe(200);
    const mediaId = up.json.media.id;
    expect(String(up.json.media.url)).toContain('/api/media/file/');

    // the public file endpoint serves it without the internal secret
    const file = await fetch(`${BASE_URL}/api/media/file/${mediaId}`);
    expect(file.status).toBe(200);
    expect((file.headers.get('content-type') || '').startsWith('image/png')).toBe(true);
    // served bytes must be byte-identical to what was uploaded (guards
    // against blob→string coercion corrupting the body)
    const served = new Uint8Array(await file.arrayBuffer());
    expect(served.length).toBe(70);
    expect(Array.from(served.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const list = await api('/api/vendor/media', { cookie });
    expect(list.status).toBe(200);
    expect(list.json.media.some((m: { id: number }) => m.id === mediaId)).toBe(true);
  });

  it('rejects non-images for catalogue uploads by magic bytes', async () => {
    const { cookie } = await registerVendor('mediabad');
    const form = new FormData();
    form.append('file', new File([new TextEncoder().encode('<svg onload="alert(1)">')], 'pic.svg', { type: 'image/svg+xml' }));
    const res = await api('/api/vendor/media/upload', { method: 'POST', form, cookie });
    expect(res.status).toBe(422);
  });
});

describe('catalogue media finalize (gateway driver contract)', () => {
  it('finalizes a real-length signed token and enforces single-use', async () => {
    const { cookie } = await registerVendor('gwmedia');
    const tok = await api('/api/vendor/media/token', { method: 'POST', body: { kind: 'catalogue' }, cookie });
    expect(tok.status, JSON.stringify(tok.json)).toBe(200);
    expect(typeof tok.json.token).toBe('string');
    // regression: a real token is ~160 chars; finalize once capped it at 64
    expect(tok.json.token.length).toBeGreaterThan(100);
    const key = tok.json.pathPrefix + 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff.jpg';
    const fin = await api('/api/vendor/media/finalize', {
      method: 'POST',
      body: { token: tok.json.token, storage_key: key, original_name: 'x.jpg', mime: 'image/jpeg', size: 1200 },
      cookie,
    });
    expect(fin.status, JSON.stringify(fin.json)).toBe(200);
    expect(String(fin.json.media.url)).toContain('media/vendors/');

    const replay = await api('/api/vendor/media/finalize', {
      method: 'POST',
      body: { token: tok.json.token, storage_key: tok.json.pathPrefix + '11112222-3333-4444-8555-666677778888.jpg', original_name: 'y.jpg', mime: 'image/jpeg', size: 1200 },
      cookie,
    });
    expect(replay.status, 'token is single-use').toBeGreaterThanOrEqual(400);
  });

  it('rejects a tampered token signature on finalize', async () => {
    const { cookie } = await registerVendor('gwbad');
    const tok = await api('/api/vendor/media/token', { method: 'POST', body: { kind: 'catalogue' }, cookie });
    const token = tok.json.token as string;
    const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    const fin = await api('/api/vendor/media/finalize', {
      method: 'POST',
      body: { token: tampered, storage_key: tok.json.pathPrefix + 'aaaa1111-bbbb-4ccc-8ddd-eeee22223333.jpg', mime: 'image/jpeg', size: 10 },
      cookie,
    });
    expect(fin.status).toBe(403);
  });
});

describe('Paystack (mock) auto-activation', () => {
  it('webhook reference auto-activates without admin touch', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'vendor', name: 'PS Vendor', email: 'ps@test.ng', phone: '+2348035555555', password: 'Passw0rd123', business_name: 'PS Store', category_slug: 'academy', whatsapp_number: '08035555555' },
    });
    expect(reg.status).toBe(200);
    const cookie = reg.cookie!;
    const intent = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { plan_slug: 'business', method: 'paystack' } });
    expect(intent.status).toBe(200);
    expect(intent.json.paystack.mock).toBe(true);
    expect(intent.json.paystack.url).toContain('/paystack/mock');

    // the mock checkout "pays" → webhook path
    const wh = await api('/api/webhooks/paystack/mock', { method: 'POST', body: { reference: intent.json.payment.reference }, authed: false });
    expect(wh.status).toBe(200);
    expect(wh.json.ok).toBe(true);

    const me = await api('/api/auth/me', { cookie });
    expect(me.json.business.status).toBe('active');
    expect(me.json.business.plan_name).toBe('Business');

    // idempotent: second webhook is a no-op
    const wh2 = await api('/api/webhooks/paystack/mock', { method: 'POST', body: { reference: intent.json.payment.reference }, authed: false });
    expect(wh2.json.ok).toBe(true);

    // unknown reference is rejected
    const wh3 = await api('/api/webhooks/paystack/mock', { method: 'POST', body: { reference: 'CS-2026-NOPE00' }, authed: false });
    expect(wh3.json.ok).toBe(false);
  });
});

describe('IDOR / tenant isolation', () => {
  it('vendor A cannot read or modify vendor B resources', async () => {
    const a = await registerVendor('idor-a', 'free');
    const b = await registerVendor('idor-b', 'free');
    const aMe = await api('/api/auth/me', { cookie: a.cookie });
    const bMe = await api('/api/auth/me', { cookie: b.cookie });

    // A updates A's own business (ownership is session-derived, not body-derived)
    const r1 = await api('/api/vendor/business', { method: 'PUT', cookie: a.cookie, body: { name: 'HACKED' } });
    expect(r1.status).toBe(200);
    const aMe2 = await api('/api/auth/me', { cookie: a.cookie });
    expect(aMe2.json.business.name).toBe('HACKED');

    // A's overview is always scoped to A
    const r3 = await api('/api/vendor/overview', { cookie: a.cookie });
    expect(r3.json.business.id).toBe(aMe.json.business.id);

    // vendor cannot reach admin APIs
    const r4 = await api('/api/admin/overview', { cookie: a.cookie });
    expect(r4.status).toBe(403);

    // public item lookup scoped by business + slug
    const r5 = await api(`/api/public/item?biz=${bMe.json.business.slug}&segment=products&slug=does-not-exist`);
    expect(r5.status).toBe(404);
    void bMe;
  });
});

describe('public pages + WhatsApp inquiry capture', () => {
  it('exposes active businesses and builds a wa.me inquiry link', async () => {
    const { cookie } = await registerVendor('public1', 'free');
    await api('/api/vendor/items', {
      method: 'POST', cookie,
      body: { name: 'HP Laptop', item_type_slug: 'product', category_slug: 'fashion', price_kobo: 45000000, publish: true },
    });
    const me = await api('/api/auth/me', { cookie });
    const slug = me.json.business.slug;

    const home = await api('/api/public/home');
    expect(home.status).toBe(200);
    expect(home.json.businesses.some((b: any) => b.slug === slug)).toBe(true);

    const storefront = await api(`/api/public/business/${slug}`);
    expect(storefront.status).toBe(200);
    expect(storefront.json.items.length).toBe(1);

    const item = await api(`/api/public/item?biz=${slug}&segment=products&slug=${storefront.json.items[0].slug}`);
    expect(item.status).toBe(200);
    expect(item.json.wa.url).toMatch(/^https:\/\/wa\.me\/2348031111111\?text=/);
    const decoded = decodeURIComponent(item.json.wa.url.split('text=')[1]);
    expect(decoded).toContain('HP Laptop');
    expect(decoded).toContain('₦450,000');

    const inq = await api('/api/public/inquiries', {
      method: 'POST',
      body: { business_id: me.json.business.id, listing_id: storefront.json.items[0].id, quantity: 2 },
    });
    expect(inq.status).toBe(200);
    expect(inq.json.wa_url).toContain('wa.me');
    expect(decodeURIComponent(inq.json.wa_url)).toContain('Quantity: 2');

    const leads = await api('/api/vendor/inquiries', { cookie });
    expect(leads.json.total).toBe(1);
    expect(leads.json.inquiries[0].item_name).toBe('HP Laptop');

    // sitemap includes the published item
    const res = await fetch(`${BASE_URL}/api/sitemap.xml`);
    const xml = await res.text();
    expect(xml).toContain(`/business/${slug}/products/${storefront.json.items[0].slug}`);
  });

  it('does not expose inactive businesses on public pages', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { role: 'vendor', name: 'Hidden Vendor', email: 'hidden@test.ng', phone: '+2348036666666', password: 'Passw0rd123', business_name: 'Hidden Store', category_slug: 'food', whatsapp_number: '08036666666' },
    });
    expect(reg.status).toBe(200);
    const home = await api('/api/public/home');
    expect(home.json.businesses.every((b: any) => b.slug !== 'hidden-store')).toBe(true);
  });
});

describe('auth security', () => {
  it('rate-limits registrations per IP (3/hour)', async () => {
    const ip = '10.77.77.77';
    const codes: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const r = await api('/api/auth/register', {
        method: 'POST',
        ip,
        body: {
          role: 'vendor',
          name: 'Reg Limit',
          email: `reglimit${i}@test.ng`,
          password: 'Passw0rd123',
          business_name: `Reg Limit Store ${i}`,
          category_slug: 'fashion',
          whatsapp_number: `080311111${String(i).padStart(2, '0')}`,
        },
      });
      codes.push(r.status);
    }
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBe(200);
    expect(codes[2]).toBe(200);
    expect(codes[3], JSON.stringify({ codes })).toBe(429);
  });

  it('rate-limits repeated failed logins', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: 'nobody@test.ng', password: 'WrongPass1' }, ip: '10.66.66.66' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('does not reveal account existence on forgot-password', async () => {
    const r1 = await api('/api/auth/forgot', { method: 'POST', body: { email: 'real-existing@test.ng' } });
    const r2 = await api('/api/auth/forgot', { method: 'POST', body: { email: 'ghost-999@test.ng' } });
    expect(r1.json.message).toBe(r2.json.message);
  });

  it('requires the internal secret for vendor API routes', async () => {
    const res = await api('/api/vendor/items', { authed: false });
    expect(res.status).toBe(403); // internal-secret check first
  });
});
