import { beforeAll, describe, expect, it } from 'vitest';
import { api, setupIntegration, adminLoginBody } from './harness';

setupIntegration({ main: 'src/tests/fixtures/operations-worker.ts' });
let admin = '';
let serial = 0;
beforeAll(async () => { admin = (await api('/api/auth/login', { method: 'POST', body: adminLoginBody() })).cookie!; });
const call = async (path: string, body: unknown) => {
  const r = await api(`/__test/${path}`, { method: 'POST', body });
  expect(r.status, r.text).toBe(200); return r.json;
};
async function vendor(credit = 300_000, extra = {}) {
  const n = ++serial;
  const r = await api('/api/auth/register', { method: 'POST', body: { role: 'vendor', name: 'Credit Vendor', email: `credit-${n}@test.ng`, password: 'Passw0rd123', business_name: `Credit Shop ${n}`, category_slug: 'fashion', whatsapp_number: '08031111111', ...extra } });
  expect(r.status, r.text).toBe(200);
  const v = { cookie: r.cookie!, userId: r.json.user.id, businessId: r.json.user.business_id };
  await call('credit-set', { userId: v.userId, amount: credit });
  return v;
}
async function intent(cookie: string, method = 'bank_transfer', addon?: string) {
  return api('/api/vendor/payment-intent', { method: 'POST', cookie, body: { ...(addon ? { addon_slug: addon } : { plan_slug: 'starter' }), method } });
}
const state = (id: number) => call('payment-state', { id });
const info = (v: { userId: number; businessId: number }) => call('credit-info', v);
const action = (id: number, action: string) => api(`/api/admin/payments/${id}/${action}`, { method: 'POST', cookie: admin, body: { reason: 'Synthetic operator-confirmed return; no provider transaction.' } });

describe('atomic credit reservation, restoration and settlement', () => {
  it('rolls back a failed replacement including the old intent, then returns credit exactly once on rejection', async () => {
    const v = await vendor();
    const first = await intent(v.cookie);
    expect(first.status).toBe(200);
    expect(first.json.payment.amount).toBe(1_200_000);
    await call('credit-fault', { enabled: true, mode: 'hold' });
    try {
      expect((await intent(v.cookie)).status).toBe(503);
      const unchanged = await info(v);
      expect(unchanged.payments).toHaveLength(1);
      expect(unchanged.payments[0].status).toBe('pending');
      expect(unchanged.user.referral_credit_kobo).toBe(0);
      expect((await state(first.json.payment.id)).credit.returned_at).toBeNull();
    } finally { await call('credit-fault', { enabled: false }); }
    const replacement = await intent(v.cookie);
    expect(replacement.status).toBe(200);
    expect(replacement.json.payment.amount).toBe(1_200_000);
    expect((await state(first.json.payment.id)).payment.status).toBe('failed');
    const rejected = await Promise.all([action(replacement.json.payment.id, 'reject'), action(replacement.json.payment.id, 'reject')]);
    expect(rejected.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await info(v)).user.referral_credit_kobo).toBe(300_000);
  });
  it('rolls back credit and all paid access if a fully funded intent cannot commit its receipt', async () => {
    const v = await vendor(1_500_000);
    await call('payment-fault', { enabled: true });
    try {
      expect((await intent(v.cookie, 'paystack')).status).toBe(503);
      const unchanged = await info(v);
      expect(unchanged.payments).toHaveLength(0);
      expect(unchanged.user.referral_credit_kobo).toBe(1_500_000);
      expect((await api('/api/auth/me', { cookie: v.cookie })).json.business.status).toBe('pending_payment');
    } finally { await call('payment-fault', { enabled: false }); }
    const settled = await intent(v.cookie, 'paystack');
    expect(settled.status, settled.text).toBe(200);
    expect(settled.json.settled_with_credit).toBe(true);
    expect(settled.json.payment.status).toBe('approved');
    expect(settled.json.payment.amount).toBe(0);
    expect(settled.json.payment.method).toBe('manual');
    expect((await info(v)).user.referral_credit_kobo).toBe(0);
    const receipt = await api(`/api/vendor/payments/${settled.json.payment.id}`, { cookie: v.cookie });
    expect(receipt.json.payment.gross_kobo).toBe(1_500_000);
    expect(receipt.json.payment.credit_kobo).toBe(1_500_000);
    expect(receipt.json.payment.amount).toBe(0);
    expect(receipt.json.payment.cash_display).toBe('₦0');
  });
  it('commits one refund, one credit return and one durable settlement despite concurrent retries', async () => {
    const v = await vendor();
    const p = (await intent(v.cookie)).json.payment;
    expect((await action(p.id, 'approve')).status).toBe(200);
    const results = await Promise.all([action(p.id, 'refund'), action(p.id, 'refund')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const refunded = await state(p.id);
    expect(refunded.payment.status).toBe('refunded');
    expect(refunded.credit.returned_at).toBeTruthy();
    expect(refunded.settlement.status).toBe('refunded');
    expect((await info(v)).user.referral_credit_kobo).toBe(300_000);
  });
  it('rolls back a failed settlement receipt, preserving the held balance until retry', async () => {
    const v = await vendor();
    const p = (await intent(v.cookie)).json.payment;
    await call('credit-fault', { enabled: true, mode: 'settlement' });
    try {
      expect((await action(p.id, 'reject')).status).toBe(500);
      const unchanged = await state(p.id);
      expect(unchanged.payment.status).toBe('pending');
      expect(unchanged.credit.returned_at).toBeNull();
      expect(unchanged.settlement).toBeNull();
      expect((await info(v)).user.referral_credit_kobo).toBe(0);
    } finally { await call('credit-fault', { enabled: false }); }
    expect((await action(p.id, 'reject')).status).toBe(200);
    expect((await info(v)).user.referral_credit_kobo).toBe(300_000);
    expect((await call('settlement-flush', { id: p.id })).processed).toBe(1);
    expect((await call('settlement-flush', { id: p.id })).processed).toBe(0);
    expect((await state(p.id)).mail).toHaveLength(1);
  });
  it('restores a terminally failed intent once, to its original credit owner', async () => {
    const v = await vendor();
    const nextOwner = await vendor(0);
    const p = (await intent(v.cookie)).json.payment;
    await call('business-owner', { businessId: v.businessId, userId: nextOwner.userId });
    await Promise.all([call('payment-terminal', { id: p.id }), call('payment-terminal', { id: p.id })]);
    expect((await info(v)).user.referral_credit_kobo).toBe(300_000);
    expect((await info(nextOwner)).user.referral_credit_kobo).toBe(0);
  });
  it('reserves once for concurrent provider intents and refuses unsafe replacement', async () => {
    const v = await vendor();
    const attempts = await Promise.all([intent(v.cookie, 'paystack'), intent(v.cookie, 'paystack')]);
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await info(v);
    expect(current.payments).toHaveLength(1);
    expect(current.payments[0].status).toBe('pending');
    expect(current.user.referral_credit_kobo).toBe(0);
    expect((await intent(v.cookie, 'bank_transfer')).status).toBe(409);
    expect((await info(v)).payments).toHaveLength(1);
  });
  it('expires only abandoned bank drafts, not potentially live hosted checkouts', async () => {
    const bank = await vendor();
    const provider = await vendor();
    const bp = (await intent(bank.cookie)).json.payment;
    const pp = (await intent(provider.cookie, 'paystack')).json.payment;
    await call('payment-age', { id: bp.id }); await call('payment-age', { id: pp.id });
    const cron = await call('hourly', {});
    expect(cron.summary.abandoned_payments).toBe(1);
    expect((await state(bp.id)).payment.status).toBe('failed');
    expect((await info(bank)).user.referral_credit_kobo).toBe(300_000);
    expect((await state(pp.id)).payment.status).toBe('pending');
    expect((await info(provider)).user.referral_credit_kobo).toBe(0);
  });
  it('never spends plan-only referral credit on an add-on and expires the refunded grant atomically', async () => {
    const v = await vendor(2_000_000);
    const p = (await intent(v.cookie, 'bank_transfer', 'extra-whatsapp-number')).json.payment;
    expect(p.amount).toBe(500_000);
    expect((await info(v)).user.referral_credit_kobo).toBe(2_000_000);
    expect((await state(p.id)).credit.amount_kobo).toBe(0);
    expect((await action(p.id, 'approve')).status).toBe(200);
    expect((await action(p.id, 'refund')).status).toBe(200);
    expect((await info(v)).user.referral_credit_kobo).toBe(2_000_000);
    expect((await state(p.id)).addons_active.n).toBe(0);
  });
  it('does not let stuck mail starve later follow-ups, and exposes aged backlog only to admins with cooldown', async () => {
    const v = await vendor(0);
    const ids: number[] = [];
    for (let n=0; n<12; n++) {
      const p = (await intent(v.cookie)).json.payment;
      ids.push(p.id);
      await call('payment-commit-only', { id: p.id });
    }
    await call('payment-flush', { unconfigured: true });
    await call('payment-flush', { unconfigured: true });
    for (const id of ids) {
      const pending = (await state(id)).activation;
      expect(pending.last_attempt_at).toBeTruthy();
      expect(pending.referral_processed_at).toBeTruthy();
      expect(pending.notice_processed_at).toBeNull();
    }
    expect((await api('/api/admin/health')).status).toBe(401);
    expect((await api('/api/admin/health', { cookie: v.cookie })).status).toBe(403);
    const health = await api('/api/admin/health', { cookie: admin });
    expect(health.status, health.text).toBe(200);
    expect(health.json.payment_followups.oldest_pending.filter((r: any) => ids.includes(r.payment_id))).toHaveLength(12);
    expect((await call('followup-alert', {})).due).toBe(false);
    await call('followup-age', { id: ids[0] });
    expect((await call('followup-alert', { mark: true })).due).toBe(true);
    expect((await call('followup-alert', {})).due).toBe(false);
  });
  it('retries referral receipts atomically and rewards the purchased price, not a later catalogue price', async () => {
    const referrer = await vendor(0);
    const home = await api('/api/account/home', { cookie: referrer.cookie });
    const referred = await vendor(0, { referral_code: home.json.referral.code });
    const p = (await intent(referred.cookie)).json.payment;
    await call('payment-commit-only', { id: p.id });
    await call('plan-price', { price: 9_900_000 });
    await call('referral-notice-fault', { enabled: true });
    try {
      await call('payment-flush', { id: p.id });
      expect((await info(referrer)).user.referral_credit_kobo).toBe(0);
      expect((await state(p.id)).activation.referral_processed_at).toBeNull();
      expect(await call('referral-notices', { userId: referrer.userId })).toHaveLength(0);
    } finally { await call('referral-notice-fault', { enabled: false }); }
    try {
      await Promise.all([call('payment-flush', { id: p.id }), call('payment-flush', { id: p.id })]);
      expect((await info(referrer)).user.referral_credit_kobo).toBe(150_000);
      expect(await call('referral-notices', { userId: referrer.userId })).toHaveLength(1);
      await call('referral-notice-fault', { enabled: true });
      expect((await action(p.id, 'refund')).status).toBe(200);
      expect((await info(referrer)).user.referral_credit_kobo).toBe(150_000);
      expect((await state(p.id)).settlement.referral_processed_at).toBeNull();
      await call('referral-notice-fault', { enabled: false });
      await Promise.all([call('settlement-flush', { id: p.id }), call('settlement-flush', { id: p.id })]);
      expect((await info(referrer)).user.referral_credit_kobo).toBe(0);
      expect((await call('referral-notices', { userId: referrer.userId })).map((n: any) => n.type).sort()).toEqual(['referral.reversed','referral.rewarded']);
    } finally {
      await call('plan-price', { price: 1_500_000 });
      await call('referral-notice-fault', { enabled: false });
    }
  });

});
