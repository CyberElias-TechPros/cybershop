import type { Env } from '../config';
import { AppError, badRequest, notFound, conflict, forbidden } from './errors';
import { paymentReference, nowIso, daysFromNow, todayStr } from './util';
import { logError } from './errorlog';
import { audit } from './audit';
import { notify, mirrorNotification } from './notify';
import { verifyPaystackReference, type InitiateResult, type VerificationResult } from './paystack';
import { paystackMock, buyerDepositsEnabled } from '../config';
import type { SessionUser } from './auth';
import { markDepositPaid } from './premium';
import { rewardReferrer, reverseReferralReward } from './referral';

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
  if (args.addon?.type === 'buyer_escrow' && !buyerDepositsEnabled(env)) throw forbidden('The deposits add-on is not currently available for purchase.');
  const planId = args.plan?.id ?? null;
  const addonId = args.addon?.id ?? null;
  const gross = args.plan ? args.plan.price : args.addon ? args.addon.price : 0;
  if (gross <= 0) throw badRequest('Nothing to pay for this selection (free plan needs no payment).');
  if (!Number.isSafeInteger(gross)) throw badRequest('Invalid payment amount.');
  const reference = paymentReference();
  // The INSERT triggers reserve credit, replace eligible bank drafts and (if
  // fully credit-funded) approve atomically. No balance read/write before it.
  try {
    await env.DB.prepare(`INSERT INTO payments (business_id,kind,reference,plan_id,addon_id,amount,currency,method,status,metadata)
      VALUES (?,?,?,?,?,?,'NGN',?,'pending',?)`)
      .bind(args.businessId, args.kind, reference, planId, addonId, gross, args.method, JSON.stringify({ created: nowIso() })).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes('A provider payment is already pending')) {
      throw conflict('A provider payment is already pending. Review it in Billing before starting another.');
    }
    throw new AppError(503, 'payment_intent_unavailable', 'Unable to create a payment safely. Please retry.');
  }
  const payment = await env.DB.prepare('SELECT * FROM payments WHERE reference=?').bind(reference).first<PaymentRow>();
  if (!payment) throw new AppError(503, 'payment_intent_unavailable', 'Unable to retrieve the payment. Check Billing before retrying.');
  if (payment.status === 'approved') {
    try { await flushPaymentActivations(env, payment.id); } catch { console.error('[payments] followup_deferred'); }
  }
  return payment;
}

/** Persist only validated provider capabilities, never browser-supplied URLs. */
export async function saveHostedCheckout(env: Env, paymentId: number, checkout: InitiateResult): Promise<void> {
  if (!safeCheckoutUrl(env,checkout.url)) throw new AppError(502,'paystack_invalid_checkout','Unable to save checkout. Check Billing before retrying.');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO payment_checkouts(payment_id,checkout_url,created_at)
      SELECT id,?,? FROM payments WHERE id=? AND method='paystack' AND status='pending' ON CONFLICT(payment_id) DO NOTHING`)
      .bind(checkout.url,nowIso(),paymentId),
    env.DB.prepare(`UPDATE payments SET paystack_reference=? WHERE id=? AND method='paystack' AND status='pending'`)
      .bind(checkout.paystackReference,paymentId),
  ]);
}
function safeCheckoutUrl(env: Env, value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (url.protocol==='https:' && url.hostname==='checkout.paystack.com' && !url.port) return url.href;
    if (paystackMock(env) && url.origin===new URL(env.APP_URL).origin && url.pathname==='/paystack/mock') return url.href;
  } catch { /* invalid capability */ }
  return null;
}

/** Read authoritative state before offering the same checkout; never initialize a replacement. */
export async function recoverHostedPayment(env: Env, businessId: number, paymentId: number,
  verifier: (env: Env, reference: string) => Promise<VerificationResult> = verifyPaystackReference) {
  const p = await env.DB.prepare('SELECT * FROM payments WHERE id=? AND business_id=?').bind(paymentId,businessId).first<PaymentRow>();
  if (!p) throw notFound('Payment not found.');
  const current = async (message?: string, review=false) => {
    const row = (await env.DB.prepare('SELECT status FROM payments WHERE id=?').bind(p.id).first<{status:string}>())!;
    return { status: row.status, checkout_url: null as string | null, needs_review: review, message: message ?? (row.status==='approved' ? 'Payment confirmed. Your receipt is available.' : `Payment is ${row.status}.`) };
  };
  if (!['pending','submitted'].includes(p.status)) return current();
  if (p.method!=='paystack') throw badRequest('This is not a hosted checkout. Use bank transfer proof review.');
  if (!paystackMock(env)) {
    let verified: VerificationResult;
    try { verified=await verifier(env,p.paystack_reference || p.reference); }
    catch { throw new AppError(503,'payment_status_unavailable','The provider could not confirm this payment. No replacement or credit release was made. Please check again later.'); }
    if (verified.amountKobo!==p.amount) {
      await logError(env,{scope:'api',route:'/api/vendor/payments/recover',status:502,code:'paystack_amount_mismatch',message:'Provider amount mismatch requires finance review.'});
      return current('The provider amount needs operator review. Do not pay again.',true);
    }
    if (verified.success) {
      await applyApproved(env,p,null,true,p.paystack_reference || p.reference);
      return current();
    }
    if (verified.terminalFailure) {
      await env.DB.prepare(`UPDATE payments SET status='failed' WHERE id=? AND status IN ('pending','submitted')`).bind(p.id).run();
      return current('The provider confirmed this attempt ended without an outstanding payment. Any held platform credit was returned.');
    }
  }
  const result=await current('This payment is not yet confirmed. Resume the same saved checkout if available; do not start another payment.');
  if (!['pending','submitted'].includes(result.status)) return result;
  const checkout=await env.DB.prepare('SELECT checkout_url,created_at FROM payment_checkouts WHERE payment_id=?').bind(p.id).first<{checkout_url:string;created_at:string}>();
  // A local age bound is not a claim about provider expiry. Unknown/old links
  // require support/provider reconciliation, not a new initialization request.
  if (checkout && Date.parse(checkout.created_at)>=Date.now()-86400_000) result.checkout_url=safeCheckoutUrl(env,checkout.checkout_url);
  if (!result.checkout_url) result.message='No usable saved checkout is available. Keep this reference and contact support for provider reconciliation. Do not pay again.';
  return result;
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
  const submitted = await env.DB.prepare(`UPDATE payments SET status='submitted',proof_media_id=?,submitted_at=? WHERE id=? AND status='pending' RETURNING id`)
    .bind(args.proofMediaId, nowIso(), p.id).first();
  if (!submitted) throw conflict('Payment status changed. Refresh before uploading proof.');
  if (p.kind === 'activation') {
    await env.DB.prepare(`UPDATE businesses SET status = 'pending_approval' WHERE id = ? AND status = 'pending_payment'`).bind(args.businessId).run();
  }
  const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as { id: number }[];
  for (const a of admins) {
    await notify(env, { userId: a.id, type: 'payment.submitted', title: 'New payment proof submitted', body: `${p.reference} — ${new Intl.NumberFormat('en-NG').format(p.amount / 100)} NGN` });
  }
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(p.id).first()) as PaymentRow;
}

/** The database trigger commits status, entitlement, receipt, audit and retry ledger together. */
async function applyApproved(env: Env, p: PaymentRow, verifiedBy: number | null, auto: boolean, reference?: string): Promise<boolean> {
  const changed = await env.DB.prepare(`UPDATE payments SET status='approved',verified_at=?,verified_by=?,
    paystack_reference=COALESCE(paystack_reference,?) WHERE id=? AND status IN ('pending','submitted','reviewing') RETURNING id`)
    .bind(nowIso(), verifiedBy, reference ?? null, p.id).first<{ id: number }>();
  if (!changed) return false;
  // A crash here cannot lose paid access or its in-app receipt. The two-minute
  // sweep retries provider enqueue/referrals using the committed activation ledger.
  try { await flushPaymentActivations(env, p.id); }
  catch { console.error('[payments] followup_deferred'); }
  return true;
}

export async function flushPaymentActivations(env: Env, paymentId?: number): Promise<number> {
  const rows = (await env.DB.prepare(`SELECT a.*,p.business_id,p.plan_id,p.kind,p.amount,h.gross_kobo FROM payment_activations a JOIN payments p ON p.id=a.payment_id LEFT JOIN payment_credit_holds h ON h.payment_id=p.id
    WHERE p.status='approved' AND (a.notice_processed_at IS NULL OR a.referral_processed_at IS NULL)
    ${paymentId ? 'AND p.id=?' : ''} ORDER BY COALESCE(a.last_attempt_at,a.created_at),a.payment_id LIMIT 10`).bind(...(paymentId ? [paymentId] : [])).all()).results as unknown as {
      payment_id: number; notification_id: number; notice_processed_at: string | null; referral_processed_at: string | null;
      business_id: number; plan_id: number | null; kind: string; amount: number; gross_kobo: number | null;
    }[];
  for (const row of rows) {
    try {
      await env.DB.prepare('UPDATE payment_activations SET last_attempt_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      if (!row.notice_processed_at && await mirrorNotification(env, row.notification_id)) {
        await env.DB.prepare('UPDATE payment_activations SET notice_processed_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      }
      if (!row.referral_processed_at) {
        if (row.plan_id && ['activation','subscription_renewal'].includes(row.kind)) {
          await rewardReferrer(env, row.business_id, row.gross_kobo ?? row.amount);
        }
        await env.DB.prepare('UPDATE payment_activations SET referral_processed_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      }
    } catch { console.error('[payments] activation_followup_deferred'); }
  }
  return rows.length;
}

/** Retry post-commit email/referral work without redoing credit or entitlement effects. */
export async function flushPaymentSettlements(env: Env, paymentId?: number): Promise<number> {
  const rows = (await env.DB.prepare(`SELECT s.*,p.business_id,p.plan_id,p.amount FROM payment_settlements s JOIN payments p ON p.id=s.payment_id
    WHERE p.status=s.status AND (s.notice_processed_at IS NULL OR s.referral_processed_at IS NULL)
    ${paymentId ? 'AND p.id=?' : ''} ORDER BY COALESCE(s.last_attempt_at,s.created_at),s.payment_id LIMIT 10`).bind(...(paymentId ? [paymentId] : [])).all()).results as unknown as {
      payment_id: number; notification_id: number; notice_processed_at: string | null; referral_processed_at: string | null;
      business_id: number; plan_id: number | null; amount: number;
    }[];
  for (const row of rows) {
    try {
      await env.DB.prepare('UPDATE payment_settlements SET last_attempt_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      if (!row.notice_processed_at && await mirrorNotification(env, row.notification_id)) {
        await env.DB.prepare('UPDATE payment_settlements SET notice_processed_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      }
      if (!row.referral_processed_at) {
        const plan = row.plan_id ? await env.DB.prepare('SELECT price FROM plans WHERE id=?').bind(row.plan_id).first<{ price: number }>() : null;
        await reverseReferralReward(env, row.business_id, plan?.price ?? row.amount);
        await env.DB.prepare('UPDATE payment_settlements SET referral_processed_at=? WHERE payment_id=?').bind(nowIso(), row.payment_id).run();
      }
    } catch { console.error('[payments] settlement_followup_deferred'); }
  }
  return rows.length;
}

export async function paymentFollowupHealth(env: Env) {
  const rows = (await env.DB.prepare(`SELECT 'activation' AS kind,a.payment_id AS payment_id,a.created_at AS created_at FROM payment_activations a JOIN payments p ON p.id=a.payment_id
    WHERE p.status='approved' AND (a.notice_processed_at IS NULL OR a.referral_processed_at IS NULL)
    UNION ALL SELECT 'settlement',s.payment_id AS payment_id,s.created_at AS created_at FROM payment_settlements s JOIN payments p ON p.id=s.payment_id
    WHERE p.status=s.status AND (s.notice_processed_at IS NULL OR s.referral_processed_at IS NULL)
    ORDER BY created_at LIMIT 30`).all()).results;
  return { oldest_pending: rows };
}

/** Admin approves a payment (bank proof path). */
export async function approvePayment(
  env: Env,
  args: { paymentId: number; admin: SessionUser; ip?: string | null }
): Promise<PaymentRow> {
  const p = (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(args.paymentId).first()) as PaymentRow | null;
  if (!p) throw notFound('Payment not found.');
  if (!['pending', 'submitted', 'reviewing'].includes(p.status)) throw conflict(`Payment is already ${p.status}.`);
  if (!(await applyApproved(env, p, args.admin.id, false))) throw conflict('Payment status changed. Refresh before reviewing.');
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
  const rejected = await env.DB.prepare(`UPDATE payments SET status='rejected',rejection_reason=?,verified_at=?,verified_by=? WHERE id=? AND status IN ('pending','submitted','reviewing') RETURNING id`)
    .bind(args.reason, nowIso(), args.admin.id, p.id).first();
  if (!rejected) throw conflict('Payment status changed. Refresh before reviewing.');
  try { await flushPaymentSettlements(env, p.id); } catch { console.error('[payments] settlement_followup_deferred'); }
  await audit(env, { actor: args.admin, action: 'payment.reject', entityType: 'payment', entityId: p.id, ip: args.ip, meta: { reference: p.reference, reason: args.reason } });
  return (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(p.id).first()) as PaymentRow;
}

/**
 * Mark an approved platform payment refunded. CyberShop does not move money —
 * the operator confirms they already returned it. Credit spent on the payment
 * comes back. A referral reward is reversed only if no other paid plan remains.
 * The store stays as it is; revoke the subscription separately if the plan should stop.
 */
export async function refundPayment(
  env: Env,
  args: { paymentId: number; admin: SessionUser; reason: string; ip?: string | null }
): Promise<PaymentRow> {
  const p = (await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(args.paymentId).first()) as PaymentRow | null;
  if (!p) throw notFound('Payment not found.');
  if (p.status !== 'approved') throw conflict('Only an approved payment can be marked refunded.');
  const marked = await env.DB.prepare(`UPDATE payments SET status = 'refunded', rejection_reason = ?, verified_at = ?, verified_by = ? WHERE id = ? AND status = 'approved'`)
    .bind(args.reason, nowIso(), args.admin.id, p.id).run();
  if (marked.meta.changes === 0) throw conflict('Only an approved payment can be marked refunded.');
  try { await flushPaymentSettlements(env, p.id); } catch { console.error('[payments] settlement_followup_deferred'); }
  await audit(env, { actor: args.admin, action: 'payment.refund', entityType: 'payment', entityId: p.id, ip: args.ip, meta: { reference: p.reference, reason: args.reason } });
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

  let verified: Awaited<ReturnType<typeof verifyPaystackReference>>;
  if (paystackMock(env)) {
    verified = { success: true, amountKobo: p.amount, email: null, terminalFailure: false };
  } else {
    verified = await verifyPaystackReference(env, reference);
  }
  if (!verified.success) {
    if (verified.terminalFailure) await env.DB.prepare(`UPDATE payments SET status = 'failed' WHERE id = ? AND status IN ('pending','submitted')`).bind(p.id).run();
    return { ok: false, detail: 'paystack verification failed' };
  }
  if (verified.amountKobo !== p.amount) {
    await env.DB.prepare(`UPDATE payments SET status = 'rejected', rejection_reason = 'Amount received does not match.' WHERE id = ? AND status IN ('pending','submitted')`).bind(p.id).run();
    return { ok: false, detail: 'amount mismatch' };
  }

  if (!(await applyApproved(env, p, null, true, reference))) {
    const current = await env.DB.prepare('SELECT status FROM payments WHERE id=?').bind(p.id).first<{ status: string }>();
    return { ok: current?.status === 'approved', detail: current?.status === 'approved' ? 'already approved (idempotent)' : 'payment status changed' };
  }
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
