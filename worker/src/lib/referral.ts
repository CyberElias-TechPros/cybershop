import type { Env } from '../config';
import { randomToken, nowIso } from './util';

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

/** Undo the one-time reward when the payment that earned it is refunded and nothing else still qualifies. */
export async function reverseReferralReward(env: Env, businessId: number, planPriceKobo: number): Promise<void> {
  const biz = (await env.DB.prepare(
    'SELECT name, referred_by_user_id, referral_rewarded_at FROM businesses WHERE id = ?'
  ).bind(businessId).first()) as { name: string; referred_by_user_id: number | null; referral_rewarded_at: string | null } | null;
  if (!biz?.referred_by_user_id || !biz.referral_rewarded_at) return;
  const token = crypto.randomUUID();
  // Legacy rewards have no recorded amount; preserve the previous fallback for those only.
  const state = await env.DB.prepare('SELECT referral_reward_kobo FROM businesses WHERE id=?').bind(businessId).first<{ referral_reward_kobo: number | null }>();
  const reward = state?.referral_reward_kobo ?? Math.min(REWARD_CAP_KOBO, Math.floor(planPriceKobo * 0.1));
  await env.DB.batch([
    env.DB.prepare(`UPDATE businesses SET referral_reward_token=? WHERE id=? AND referral_rewarded_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payments WHERE business_id=? AND status='approved' AND plan_id IS NOT NULL)`)
      .bind(token, businessId, businessId),
    env.DB.prepare(`UPDATE users SET referral_credit_kobo=MAX(0,referral_credit_kobo-?) WHERE id=?
      AND EXISTS (SELECT 1 FROM businesses WHERE id=? AND referral_reward_token=?)`).bind(reward, biz.referred_by_user_id, businessId, token),
    env.DB.prepare(`UPDATE businesses SET referral_rewarded_at=NULL,referral_reward_token=NULL,referral_reward_kobo=NULL WHERE id=? AND referral_reward_token=?`).bind(businessId, token),
  ]);

}

/** One reward per referred store, only after that store actually pays for a plan. */
export async function rewardReferrer(env: Env, businessId: number, planPriceKobo: number): Promise<void> {
  if (planPriceKobo <= 0) return;
  const biz = (await env.DB.prepare(
    'SELECT id, name, owner_user_id, referred_by_user_id, referral_rewarded_at FROM businesses WHERE id = ?'
  ).bind(businessId).first()) as { id: number; name: string; owner_user_id: number; referred_by_user_id: number | null; referral_rewarded_at: string | null } | null;
  if (!biz?.referred_by_user_id || biz.referral_rewarded_at || biz.referred_by_user_id === biz.owner_user_id) return;
  const reward = Math.min(REWARD_CAP_KOBO, Math.floor(planPriceKobo * 0.1));
  if (reward <= 0) return;
  const token = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`UPDATE businesses SET referral_rewarded_at=?,referral_reward_token=?,referral_reward_kobo=? WHERE id=? AND referral_rewarded_at IS NULL
      AND EXISTS (SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL)
      AND EXISTS (SELECT 1 FROM payments WHERE business_id=? AND status='approved' AND plan_id IS NOT NULL)`)
      .bind(nowIso(), token, reward, biz.id, biz.referred_by_user_id, biz.id),
    env.DB.prepare(`UPDATE users SET referral_credit_kobo=referral_credit_kobo+? WHERE id=?
      AND EXISTS (SELECT 1 FROM businesses WHERE id=? AND referral_reward_token=?)`).bind(reward, biz.referred_by_user_id, biz.id, token),
  ]);

}
