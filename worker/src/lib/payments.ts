import type { Env } from '../config';
import { AppError, badRequest, notFound, conflict } from './errors';
import { paymentReference, nowIso, daysFromNow, todayStr } from './util';
import { audit } from './audit';
import { notify } from './notify';
import { verifyPaystackReference } from './paystack';
import { paystackMock } from '../config';
import type { SessionUser } from './auth';
import { markDepositPaid } from './premium';

export interface PaymentRow {
  id: number;
  business_id: number;
  kind: 'activation' | 'subscription_renewal' | 'addon';
  reference: string;
  plan_id: number | null;
  addon_id: number | null;
  amount: number;
  currency: string;
  method: 'bank_transfer' | 'paystack' | 'manual';
  paystack_reference: string | null;
  proof_media_id: number | null;
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: number | null;
  metadata: string | null;
  created_at: string;
}

const INTERVAL_DAYS: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365 };

export interface PlanRow {
  id: number;
  name: string;
  slug: string;
  price: number;
  interval: string;
  trial_days: number;
}

export interface AddonRow {
  id: number;
  name: string;
  slug: string;
  price: number;
  duration_days: number;
  type: string;
}

/** Create a pending payment intent for a plan (activation/renewal) or an add-on. */
export async function createPaymentIntent(
  env: Env,
  args: {
    businessId: number;
    kind: PaymentRow['kind'];
    plan?: PlanRow | null;
    addon?: AddonRow | null;
    method: PaymentRow['method'];
  }
): Promise<PaymentRow> {
  const planId = args.plan?.id ?? null;
  const addonId = args.addon?.id ?? null;
  const amount = args.plan ? args.plan.price : args.addon ? args.addon.price : 0;
  if (amount <= 0) throw badRequest('Nothing to pay for this selection (free plan needs no payment).');
  const reference = paymentReference();
  const res = await env.DB.prepare(
    `INSERT INTO payments (business_id, kind, reference, plan_id, addon_id, amount, currency, method, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'NGN', ?, 'pending', ?)`
  ).bind(args.businessId, args.kind, reference, planId, addonId, amount, args.method, JSON.stringify({ created: nowIso() })).run();
  const id = Number(res.meta.last_row_id);
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first()) as PaymentRow;
}

/** Vendor uploads a bank-transfer proof → payment becomes submitted; business moves to pending_approval. */
export async function submitBankProof(
  env: Env,
  args: { paymentId: number; businessId: number; proofMediaId: number; vendor: SessionUser }
): Promise<PaymentRow> {
  const p = (await env.DB.prepare('SELECT * FROM payments WHERE id = ? AND business_id = ?').bind(args.paymentId, args.businessId).first()) as PaymentRow | null;
  if (!p) throw notFound('Payment not found.');
  if (!['pending'].includes(p.status)) throw conflict('This payment can no longer be updated.');
  if (p.method !== 'bank_transfer') throw badRequest('Proof upload is only for bank transfer payments.');
  await env.DB.prepare(`UPDATE payments SET status = 'submitted', proof_media_id = ?, submitted_at = ? WHERE id = ?`)
    .bind(args.proofMediaId, nowIso(), p.id).run();
  if (p.kind === 'activation') {
    await env.DB.prepare(`UPDATE businesses SET status = 'pending_approval' WHERE id = ? AND status = 'pending_payment'`).bind(args.businessId).run();
  }
  const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as { id: number }[];
  for (const a of admins) {
    await notify(env, { userId: a.id, type: 'payment.submitted', title: 'New payment proof submitted', body: `${p.reference} — ${new Intl.NumberFormat('en-NG').format(p.amount / 100)} NGN` });
  }
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(p.id).first()) as PaymentRow;
}

/** Apply the approved side effects: activate business / renew subscription / grant add-on. */
async function applyApproved(env: Env, p: PaymentRow, verifiedBy: number | null, auto: boolean): Promise<void> {
  const biz = (await env.DB.prepare('SELECT id, name, owner_user_id FROM businesses WHERE id = ?').bind(p.business_id).first()) as
    | { id: number; name: string; owner_user_id: number }
    | null;

  if (p.kind === 'activation' && p.plan_id) {
    const plan = (await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(p.plan_id).first()) as PlanRow & { trial_days: number } | null;
    if (plan) {
      await env.DB.prepare(`UPDATE businesses SET status = 'active' WHERE id = ?`).bind(p.business_id).run();
      const days = INTERVAL_DAYS[plan.interval] ?? 0;
      const sub = (await env.DB.prepare(
        `SELECT id, status FROM subscriptions WHERE business_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(p.business_id).first()) as { id: number; status: string } | null;
      if (sub) {
        await env.DB.prepare(
          `UPDATE subscriptions SET plan_id = ?, status = 'active', starts_at = ?, renews_at = ?, expires_at = ? WHERE id = ?`
        ).bind(plan.id, nowIso(), days ? daysFromNow(days) : null, days ? daysFromNow(days) : null, sub.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO subscriptions (business_id, plan_id, status, starts_at, renews_at, expires_at) VALUES (?, ?, 'active', ?, ?, ?)`
        ).bind(p.business_id, plan.id, nowIso(), days ? daysFromNow(days) : null, days ? daysFromNow(days) : null).run();
      }
    }
  }

  if (p.kind === 'subscription_renewal' && p.plan_id) {
    const plan = (await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(p.plan_id).first()) as PlanRow | null;
    const sub = (await env.DB.prepare(`SELECT * FROM subscriptions WHERE business_id = ? ORDER BY id DESC LIMIT 1`).bind(p.business_id).first()) as
      | { id: number; expires_at: string | null; plan_id: number }
      | null;
    if (plan && sub) {
      const days = INTERVAL_DAYS[plan.interval] ?? 30;
      const base = sub.expires_at && sub.expires_at > nowIso() ? new Date(sub.expires_at).getTime() : Date.now();
      const next = new Date(base + days * 86400_000).toISOString();
      await env.DB.prepare(
        `UPDATE subscriptions SET plan_id = ?, status = 'active', expires_at = ?, renews_at = ? WHERE id = ?`
      ).bind(plan.id, next, next, sub.id).run();
      await env.DB.prepare(`UPDATE businesses SET status = 'active' WHERE id = ? AND status IN ('expired','grace','suspended')`).bind(p.business_id).run();
    }
  }

  if (p.kind === 'addon' && p.addon_id) {
    const addon = (await env.DB.prepare('SELECT * FROM addons WHERE id = ?').bind(p.addon_id).first()) as AddonRow | null;
    if (addon) {
      const expires = new Date(Date.now() + addon.duration_days * 86400_000).toISOString();
      await env.DB.prepare(
        `INSERT INTO vendor_addons (business_id, addon_id, quantity, status, payment_id, purchased_at, expires_at) VALUES (?, ?, 1, 'active', ?, ?, ?)`
      ).bind(p.business_id, addon.id, p.id, nowIso(), expires).run();
    }
  }

  if (biz) {
    await notify(env, {
      userId: biz.owner_user_id,
      type: 'payment.approved',
      title: auto ? 'Payment confirmed' : 'Your payment has been approved',
      body: `${p.reference} — ${new Intl.NumberFormat('en-NG').format(p.amount / 100)} NGN. Your store is ready.`,
      data: { payment_id: p.id },
    });
  }
}

/** Admin approves a payment (bank proof path). */
export async function approvePayment(
  env: Env,
  args: { paymentId: number; admin: SessionUser; ip?: string | null }
): Promise<PaymentRow> {
  const p = (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(args.paymentId).first()) as PaymentRow | null;
  if (!p) throw notFound('Payment not found.');
  if (!['pending', 'submitted', 'reviewing'].includes(p.status)) throw conflict(`Payment is already ${p.status}.`);
  await env.DB.prepare(`UPDATE payments SET status = 'approved', verified_at = ?, verified_by = ? WHERE id = ?`)
    .bind(nowIso(), args.admin.id, p.id).run();
  await applyApproved(env, p, args.admin.id, false);
  await audit(env, { actor: args.admin, action: 'payment.approve', entityType: 'payment', entityId: p.id, ip: args.ip, meta: { reference: p.reference, amount: p.amount, method: p.method } });
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(p.id).first()) as PaymentRow;
}

/** Admin rejects a payment with a reason. Vendor can create a new intent. */
export async function rejectPayment(
  env: Env,
  args: { paymentId: number; admin: SessionUser; reason: string; ip?: string | null }
): Promise<PaymentRow> {
  const p = (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(args.paymentId).first()) as PaymentRow | null;
  if (!p) throw notFound('Payment not found.');
  if (!['pending', 'submitted', 'reviewing'].includes(p.status)) throw conflict(`Payment is already ${p.status}.`);
  await env.DB.prepare(`UPDATE payments SET status = 'rejected', rejection_reason = ?, verified_at = ?, verified_by = ? WHERE id = ?`)
    .bind(args.reason, nowIso(), args.admin.id, p.id).run();
  // The business goes back to "still owes a payment" so the vendor can pay
  // again (new proof or new payment intent) without further admin action.
  await env.DB.prepare(`UPDATE businesses SET status = 'pending_payment' WHERE id = ? AND status = 'pending_approval'`)
    .bind(p.business_id).run();
  const biz = (await env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(p.business_id).first()) as { owner_user_id: number } | null;
  if (biz) {
    await notify(env, { userId: biz.owner_user_id, type: 'payment.rejected', title: 'Your payment was not approved', body: args.reason, data: { payment_id: p.id } });
  }
  await audit(env, { actor: args.admin, action: 'payment.reject', entityType: 'payment', entityId: p.id, ip: args.ip, meta: { reference: p.reference, reason: args.reason } });
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(p.id).first()) as PaymentRow;
}

/**
 * Paystack webhook handler: verify reference server-side with Paystack, then approve.
 * Idempotent: already-approved payments are a no-op.
 * In mock mode, verification is the mock callback (development only).
 */
export async function handlePaystackWebhook(env: Env, reference: string, ip: string | null): Promise<{ ok: boolean; detail: string }> {
  const depositHit = await markDepositPaid(env, reference, ip);
  if (depositHit.detail !== 'deposit not found') return depositHit;

  const p = (await env.DB.prepare('SELECT * FROM payments WHERE reference = ? OR paystack_reference = ?').bind(reference, reference).first()) as PaymentRow | null;
  if (!p) return { ok: false, detail: 'payment not found' };
  if (p.status === 'approved') return { ok: true, detail: 'already approved (idempotent)' };
  if (!['pending', 'submitted'].includes(p.status)) return { ok: false, detail: `payment ${p.status}` };

  let verified: { success: boolean; amountKobo: number };
  if (paystackMock(env)) {
    verified = { success: true, amountKobo: p.amount };
  } else {
    verified = await verifyPaystackReference(env, reference);
  }
  if (!verified.success) {
    await env.DB.prepare(`UPDATE payments SET status = 'failed' WHERE id = ? AND status IN ('pending','submitted')`).bind(p.id).run();
    return { ok: false, detail: 'paystack verification failed' };
  }
  if (verified.amountKobo + 1 < p.amount) {
    await env.DB.prepare(`UPDATE payments SET status = 'rejected', rejection_reason = 'Amount received does not match.' WHERE id = ?`).bind(p.id).run();
    return { ok: false, detail: 'amount mismatch' };
  }

  await env.DB.prepare(`UPDATE payments SET status = 'approved', verified_at = ?, verified_by = NULL, paystack_reference = COALESCE(paystack_reference, ?) WHERE id = ?`)
    .bind(nowIso(), reference, p.id).run();
  await applyApproved(env, { ...p, status: 'approved' }, null, true);
  await audit(env, { actor: { id: null, role: 'system' }, action: 'payment.auto_approve', entityType: 'payment', entityId: p.id, ip, meta: { reference: p.reference, amount: p.amount, mock: paystackMock(env) } });
  return { ok: true, detail: 'approved' };
}

/** Vendor-facing: activate on the free plan without a payment. */
export async function activateFreePlan(env: Env, businessId: number): Promise<void> {
  const plan = (await env.DB.prepare(`SELECT * FROM plans WHERE slug = 'free' AND is_active = 1 LIMIT 1`).first()) as PlanRow | null;
  if (!plan) return;
  const sub = (await env.DB.prepare(`SELECT id, status FROM subscriptions WHERE business_id = ? ORDER BY id DESC LIMIT 1`).bind(businessId).first()) as { id: number; status: string } | null;
  if (sub) {
    const status = sub.status === 'cancelled' ? 'active' : sub.status;
    await env.DB.prepare(`UPDATE subscriptions SET plan_id = ?, status = ? WHERE id = ?`).bind(plan.id, status, sub.id).run();
  } else {
    const starts = nowIso();
    await env.DB.prepare(`INSERT INTO subscriptions (business_id, plan_id, status, starts_at, renews_at, expires_at) VALUES (?, ?, 'active', ?, ?, ?)`)
      .bind(businessId, plan.id, starts, null, null).run();
  }
  await env.DB.prepare(`UPDATE businesses SET status = 'active' WHERE id = ? AND status IN ('pending_payment','pending_approval')`).bind(businessId).run();
}

/** Daily rollup helper used by the cron job. */
export function rollupDay(day: string): string {
  return day;
}
