import type { Env } from '../config';
import { randomToken, nowIso } from './util';
import { notify } from './notify';

const REWARD_CAP_KOBO = 500_000;

export async function ensureReferralCode(env: Env, userId: number): Promise<string> {
  const row = (await env.DB.prepare('SELECT referral_code FROM users WHERE id = ?').bind(userId).first()) as { referral_code: string | null } | null;
  if (row?.referral_code) return row.referral_code;
  for (let i = 0; i < 4; i++) {
    const code = randomToken(4);
    const res = await env.DB.prepare('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL').bind(code, userId).run();
    if (res.meta.changes) return code;
    const again = (await env.DB.prepare('SELECT referral_code FROM users WHERE id = ?').bind(userId).first()) as { referral_code: string | null } | null;
    if (again?.referral_code) return again.referral_code;
  }
  throw new Error('Could not assign a referral code.');
}

export function referralLink(env: Env, code: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/register?ref=${code}`;
}

/** Look up a code. Invalid or self codes are ignored so signup never fails on a bad link. */
export async function referrerIdForCode(env: Env, code: string, selfId: number): Promise<number | null> {
  const clean = code.trim().toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(clean)) return null;
  const row = (await env.DB.prepare('SELECT id FROM users WHERE referral_code = ? AND deleted_at IS NULL').bind(clean).first()) as { id: number } | null;
  if (!row || row.id === selfId) return null;
  return row.id;
}

export async function referralCredit(env: Env, userId: number): Promise<number> {
  const row = (await env.DB.prepare('SELECT referral_credit_kobo FROM users WHERE id = ?').bind(userId).first()) as { referral_credit_kobo: number } | null;
  return Math.max(0, Number(row?.referral_credit_kobo || 0));
}

/** Spend credit against a plan payment. Returns how much was taken. 0 if the balance moved. */
export async function spendCredit(env: Env, userId: number, want: number): Promise<number> {
  if (want <= 0) return 0;
  const have = await referralCredit(env, userId);
  const take = Math.min(have, want);
  if (take <= 0) return 0;
  const res = await env.DB.prepare(
    'UPDATE users SET referral_credit_kobo = referral_credit_kobo - ? WHERE id = ? AND referral_credit_kobo >= ?'
  ).bind(take, userId, take).run();
  return res.meta.changes ? take : 0;
}

export async function restoreCredit(env: Env, userId: number, amount: number): Promise<void> {
  if (amount <= 0) return;
  await env.DB.prepare('UPDATE users SET referral_credit_kobo = referral_credit_kobo + ? WHERE id = ?').bind(amount, userId).run();
}

/** Undo the one-time reward when the payment that earned it is refunded and nothing else still qualifies. */
export async function reverseReferralReward(env: Env, businessId: number, planPriceKobo: number): Promise<void> {
  const biz = (await env.DB.prepare(
    'SELECT name, referred_by_user_id, referral_rewarded_at FROM businesses WHERE id = ?'
  ).bind(businessId).first()) as { name: string; referred_by_user_id: number | null; referral_rewarded_at: string | null } | null;
  if (!biz?.referred_by_user_id || !biz.referral_rewarded_at) return;
  const stillPaid = (await env.DB.prepare(
    `SELECT id FROM payments WHERE business_id = ? AND status = 'approved' AND plan_id IS NOT NULL LIMIT 1`
  ).bind(businessId).first()) as { id: number } | null;
  if (stillPaid) return;
  const reward = Math.min(REWARD_CAP_KOBO, Math.floor(planPriceKobo * 0.1));
  if (reward > 0) {
    await env.DB.prepare(
      `UPDATE users SET referral_credit_kobo = CASE WHEN referral_credit_kobo >= ? THEN referral_credit_kobo - ? ELSE 0 END WHERE id = ?`
    ).bind(reward, reward, biz.referred_by_user_id).run();
  }
  await env.DB.prepare('UPDATE businesses SET referral_rewarded_at = NULL WHERE id = ?').bind(businessId).run();
  await notify(env, {
    userId: biz.referred_by_user_id,
    type: 'referral.reversed',
    title: 'Referral credit adjusted',
    body: `${biz.name}'s plan payment was refunded, so that credit was taken back. It was never cash.`,
  });
}

/** One reward per referred store, only after that store actually pays for a plan. */
export async function rewardReferrer(env: Env, businessId: number, planPriceKobo: number): Promise<void> {
  if (planPriceKobo <= 0) return;
  const biz = (await env.DB.prepare(
    'SELECT id, name, owner_user_id, referred_by_user_id, referral_rewarded_at FROM businesses WHERE id = ?'
  ).bind(businessId).first()) as { id: number; name: string; owner_user_id: number; referred_by_user_id: number | null; referral_rewarded_at: string | null } | null;
  if (!biz?.referred_by_user_id || biz.referral_rewarded_at || biz.referred_by_user_id === biz.owner_user_id) return;
  const marked = await env.DB.prepare(
    'UPDATE businesses SET referral_rewarded_at = ? WHERE id = ? AND referral_rewarded_at IS NULL'
  ).bind(nowIso(), biz.id).run();
  if (!marked.meta.changes) return;
  const reward = Math.min(REWARD_CAP_KOBO, Math.floor(planPriceKobo * 0.1));
  if (reward <= 0) return;
  await env.DB.prepare('UPDATE users SET referral_credit_kobo = referral_credit_kobo + ? WHERE id = ?').bind(reward, biz.referred_by_user_id).run();
  const naira = `₦${(reward / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  await notify(env, {
    userId: biz.referred_by_user_id,
    type: 'referral.rewarded',
    title: `${naira} referral credit`,
    body: `${biz.name} paid for a plan. The credit comes off your next plan payment. It is not cash.`,
  });
}
