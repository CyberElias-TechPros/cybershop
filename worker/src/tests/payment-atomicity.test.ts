import { beforeAll, describe, expect, it } from 'vitest';
import { setupIntegration, api, adminLoginBody } from './harness';

setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts' });
let admin = '';
let serial = 0;
beforeAll(async () => { admin = (await api('/api/auth/login', { method: 'POST', body: adminLoginBody() })).cookie!; });
const call = async (path: string, body: unknown) => {
  const r = await api(`/__test/${path}`, { method: 'POST', body });
  expect(r.status, r.text).toBe(200);
  return r.json;
};
async function vendor(extra = {}) {
  const n = ++serial;
  const r = await api('/api/auth/register', { method: 'POST', body: {
    role: 'vendor', name: 'Atomic Vendor', email: `atomic-${n}@test.ng`, password: 'Passw0rd123',
    business_name: `Atomic Shop ${n}`, category_slug: 'fashion', whatsapp_number: '08031111111', ...extra,
  } });
  expect(r.status, r.text).toBe(200);
  return { cookie: r.cookie!, id: r.json.user.id, businessId: r.json.user.business_id };
}
async function intent(cookie: string, body: unknown) {
  const r = await api('/api/vendor/payment-intent', { method: 'POST', cookie, body });
  expect(r.status, r.text).toBe(200);
  return r.json.payment;
}
const approve = (id: number) => api(`/api/admin/payments/${id}/approve`, { method: 'POST', cookie: admin, body: {} });

describe('atomic paid activation and entitlement effects on real D1', () => {
  it('commits only one add-on for concurrent approvals', async () => {
    const v = await vendor();
    const p = await intent(v.cookie, { addon_slug: 'extra-whatsapp-number', method: 'bank_transfer' });
    const attempts = await Promise.all([approve(p.id), approve(p.id)]);
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    const state = await call('payment-state', { id: p.id });
    expect(state.payment.status).toBe('approved');
    expect(state.addons.n).toBe(1);
    expect(state.notices.n).toBe(1);
    expect(state.activation.payment_id).toBe(p.id);
  });
  it('idempotently handles simultaneous synthetic provider confirmations', async () => {
    const v = await vendor();
    const p = await intent(v.cookie, { plan_slug: 'starter', method: 'paystack' });
    const results = await Promise.all([1, 2, 3].map(() => api('/api/webhooks/paystack/mock', { method: 'POST', body: { reference: p.reference } })));
    expect(results.every((r) => r.status === 200 && r.json.ok)).toBe(true);
    const state = await call('payment-state', { id: p.id });
    expect(state.payment.status).toBe('approved');
    expect(state.subscription.status).toBe('active');
    expect(state.notices.n).toBe(1);
  });
  it('rolls back status AND entitlement if the durable receipt fails, then retries safely', async () => {
    const v = await vendor();
    const p = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    const before = await call('payment-state', { id: p.id });
    await call('payment-fault', { enabled: true });
    try {
      expect((await approve(p.id)).status).toBe(500);
      const failed = await call('payment-state', { id: p.id });
      expect(failed.payment.status).toBe('pending');
      expect(failed.activation).toBeNull();
      expect(failed.notices.n).toBe(0);
      expect(failed.subscription).toEqual(before.subscription);
      expect((await api('/api/auth/me', { cookie: v.cookie })).json.business.status).toBe('pending_payment');
    } finally { await call('payment-fault', { enabled: false }); }
    expect((await approve(p.id)).status).toBe(200);
    expect((await call('payment-state', { id: p.id })).notices.n).toBe(1);
  });
  it('serializes two different renewals against current expiry, losing neither purchased period', async () => {
    const v = await vendor();
    await api('/api/vendor/payment-intent', { method: 'POST', cookie: v.cookie, body: { plan_slug: 'free' } });
    const first = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('payment-submitted', { id: first.id });
    const second = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    const results = await Promise.all([approve(first.id), approve(second.id)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const state = await call('payment-state', { id: first.id });
    const days = (Date.parse(state.subscription.expires_at) - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(59.99);
    expect(days).toBeLessThanOrEqual(60.01);
  });
  it('resumes a committed activation after a simulated crash before email enqueue', async () => {
    const v = await vendor();
    const p = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('payment-commit-only', { id: p.id });
    const committed = await call('payment-state', { id: p.id });
    expect(committed.payment.status).toBe('approved');
    expect(committed.activation.notice_processed_at).toBeNull();
    expect(committed.notices.n).toBe(1);
    expect((await call('payment-flush', { id: p.id })).processed).toBe(1);
    const resumed = await call('payment-state', { id: p.id });
    expect(resumed.activation.notice_processed_at).not.toBeNull();
    expect(resumed.mail).toHaveLength(1);
    expect(resumed.mail[0].status).toBe('queued'); // Synthetic provider outage; no real email sent.
    expect(resumed.mail[0].payload).not.toContain('atomic-');
    expect((await call('payment-flush', { id: p.id })).processed).toBe(0);
    expect((await call('payment-state', { id: p.id })).mail).toHaveLength(1);
  });
  it('atomically rewards/reverses referral credit once and uses the originally recorded reward', async () => {
    const referrer = await vendor();
    const home = await api('/api/account/home', { cookie: referrer.cookie });
    const referred = await vendor({ referral_code: home.json.referral.code });
    const p = await intent(referred.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('payment-commit-only', { id: p.id });
    const args = { businessId: referred.businessId, userId: referrer.id, price: 1_500_000 };
    await Promise.all([call('referral', args), call('referral', args)]);
    expect((await api('/api/account/home', { cookie: referrer.cookie })).json.referral.credit_kobo).toBe(150_000);
    await call('referral-refund', { id: p.id });
    await Promise.all([1, 2].map(() => call('referral', { ...args, reverse: true, price: 9_900_000 })));
    expect((await api('/api/account/home', { cookie: referrer.cookie })).json.referral.credit_kobo).toBe(0);
  });
  it('preserves both purchased periods when two first-time activations are approved concurrently', async () => {
    const v = await vendor();
    const first = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('payment-submitted', { id: first.id });
    await call('business-status', { businessId: v.businessId, status: 'pending_approval' });
    const second = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    expect((await call('payment-state', { id: second.id })).payment.kind).toBe('activation');
    const approvals = await Promise.all([approve(first.id),approve(second.id)]);
    expect(approvals.map((r) => r.status)).toEqual([200,200]);
    const days = (Date.parse((await call('payment-state', { id: first.id })).subscription.expires_at)-Date.now())/86400_000;
    expect(days).toBeGreaterThan(59.99);
    expect(days).toBeLessThanOrEqual(60.01);
    expect((await api('/api/auth/me', { cookie: v.cookie })).json.business.status).toBe('active');
  });
  it('activates a credit-funded first plan while bank proof is under review, preserving the later paid period', async () => {
    const v = await vendor();
    const first = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('payment-submitted', { id: first.id });
    await call('business-status', { businessId: v.businessId, status: 'pending_approval' });
    await call('credit-set', { userId: v.id, amount: 1_500_000 });
    const funded = await intent(v.cookie, { plan_slug: 'starter', method: 'paystack' });
    expect(funded.status).toBe('approved');
    expect((await api('/api/auth/me', { cookie: v.cookie })).json.business.status).toBe('active');
    expect((await approve(first.id)).status).toBe(200);
    const days = (Date.parse((await call('payment-state', { id: first.id })).subscription.expires_at)-Date.now())/86400_000;
    expect(days).toBeGreaterThan(59.99);
  });
  it('does not lift moderation suspension when an existing payment is approved', async () => {
    const v = await vendor();
    const p = await intent(v.cookie, { plan_slug: 'starter', method: 'bank_transfer' });
    await call('business-status', { businessId: v.businessId, status: 'suspended' });
    expect((await approve(p.id)).status).toBe(200);
    expect((await api('/api/auth/me', { cookie: v.cookie })).json.business.status).toBe('suspended');
    expect((await call('payment-state', { id: p.id })).subscription.status).toBe('active');
  });

});
