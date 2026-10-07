import type { Env } from '../config';
import { nowIso, todayStr } from '../lib/util';
import { notify } from '../lib/notify';
import { pruneRateLimits } from '../lib/ratelimit';
import { expireVerifiedBadges, notifySavedSearches, trimFeaturedOverflow } from '../lib/premium';
import { restoreCredit } from '../lib/referral';
import { entitledBusinessIds, syncEntitlement } from '../lib/entitlement';
import { reportSlaSweep } from '../lib/moderation';
import { reconcilePayments } from '../lib/reconcile';
import { ALERT_RULES, shouldAlert, markAlertSent, pruneErrorLog } from '../lib/errorlog';

/** Hourly maintenance job (Cloudflare Cron Trigger). Idempotent. */
export async function runHourlyJobs(env: Env): Promise<{ summary: Record<string, number> }> {
  const summary: Record<string, number> = {};
  const now = nowIso();

  // 0. Stores on a granted plan (the platform owner's own store) are re-asserted
  //    before anything else runs, so nothing below can expire, suspend or
  //    downgrade them. A granted plan's subscription has expires_at = NULL,
  //    which every sweep in this job already skips — this is the belt to that
  //    braces: it also repairs the store if an admin suspended it by hand.
  const entitled = await entitledBusinessIds(env);
  for (const id of entitled) await syncEntitlement(env, id);
  summary.entitlements_synced = entitled.length;

  // 1. Subscription expiry: active → expired (+7 day grace) → business 'expired'
  const expiring = (await env.DB.prepare(
    `SELECT s.id AS sub_id, s.business_id, s.expires_at FROM subscriptions s
     WHERE s.status IN ('active','trialing') AND s.expires_at IS NOT NULL AND s.expires_at <= ?
       AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = s.business_id AND b.plan_override IS NOT NULL)`
  ).bind(now).all()).results as { sub_id: number; business_id: number }[];
  for (const s of expiring) {
    const graceUntil = new Date(Date.now() + 7 * 86400_000).toISOString();
    await env.DB.prepare(`UPDATE subscriptions SET status = 'expired', grace_until = ? WHERE id = ?`).bind(graceUntil, s.sub_id).run();
    await env.DB.prepare(`UPDATE businesses SET status = 'expired' WHERE id = ? AND status = 'active'`).bind(s.business_id).run();
    const owner = (await env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(s.business_id).first()) as { owner_user_id: number } | null;
    if (owner) {
      await notify(env, { userId: owner.owner_user_id, type: 'subscription.expired', title: 'Your subscription has expired', body: 'Your store is paused. Renew within 7 days to avoid suspension.' });
    }
    summary.expired_subs = (summary.expired_subs || 0) + 1;
  }

  // 2. Expiring soon (within 7 days) → one-time notification, status 'expiring'
  const soonCutoff = new Date(Date.now() + 7 * 86400_000).toISOString();
  const soon = (await env.DB.prepare(
    `SELECT s.id AS sub_id, s.business_id FROM subscriptions s
     WHERE s.status = 'active' AND s.expires_at IS NOT NULL AND s.expires_at <= ? AND s.expires_at > ?
       AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = s.business_id AND b.plan_override IS NOT NULL)`
  ).bind(soonCutoff, now).all()).results as { sub_id: number; business_id: number }[];
  for (const s of soon) {
    await env.DB.prepare(`UPDATE subscriptions SET status = 'expiring' WHERE id = ? AND status = 'active'`).bind(s.sub_id).run();
    const owner = (await env.DB.prepare('SELECT owner_user_id FROM businesses WHERE id = ?').bind(s.business_id).first()) as { owner_user_id: number } | null;
    if (owner) {
      const already = (await env.DB.prepare(`SELECT id FROM notifications WHERE user_id = ? AND type = 'subscription.expiring' AND created_at > ?`).bind(owner.owner_user_id, new Date(Date.now() - 8 * 86400_000).toISOString()).first()) as { id: number } | null;
      if (!already) await notify(env, { userId: owner.owner_user_id, type: 'subscription.expiring', title: 'Your subscription expires in 7 days', body: 'Renew to keep your storefront live.' });
    }
    summary.expiring_subs = (summary.expiring_subs || 0) + 1;
  }

  // 3. Grace period over → business suspended
  const graceOver = (await env.DB.prepare(
    `SELECT s.business_id, s.id AS sub_id FROM subscriptions s
     WHERE s.status IN ('expired') AND s.grace_until IS NOT NULL AND s.grace_until <= ?
       AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = s.business_id AND b.plan_override IS NOT NULL)`
  ).bind(now).all()).results as { business_id: number; sub_id: number }[];
  for (const s of graceOver) {
    await env.DB.prepare(`UPDATE subscriptions SET status = 'grace' WHERE id = ?`).bind(s.sub_id).run();
    await env.DB.prepare(`UPDATE businesses SET status = 'suspended' WHERE id = ? AND status = 'expired'`).bind(s.business_id).run();
    summary.suspended = (summary.suspended || 0) + 1;
  }

  // 4. Scheduled item publication
  await env.DB.prepare(
    `UPDATE listings SET status = 'published', published_at = COALESCE(published_at, ?)
     WHERE status = 'draft' AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= ? AND deleted_at IS NULL`
  ).bind(now, now).run();
  summary.scheduled_published = summary.scheduled_published || 0;

  // 5. Addon expiry
  const addonsExpired = (await env.DB.prepare(
    `UPDATE vendor_addons SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?`
  ).bind(now).run());
  summary.addons_expired = Number(addonsExpired.meta?.changes || 0);

  // 6. Orphan cleanup: unused > 7 days → orphaned; orphaned > 30 days → soft delete (D1 blobs freed)
  const toOrphan = (await env.DB.prepare(
    `UPDATE media SET status = 'orphaned' WHERE status = 'unused' AND created_at < datetime('now', '-7 days') AND deleted_at IS NULL`
  ).bind().run());
  summary.orphaned = Number(toOrphan.meta?.changes || 0);
  const toDelete = (await env.DB.prepare(
    `UPDATE media SET status = 'deleted', deleted_at = ?, d1_blob = NULL WHERE status = 'orphaned' AND created_at < datetime('now', '-30 days') AND deleted_at IS NULL`
  ).bind(now).run());
  summary.orphan_deleted = Number(toDelete.meta?.changes || 0);

  // 7. Daily analytics rollup for today (approximate, updated each hour)
  const day = todayStr();
  const rollups = (await env.DB.prepare(
    `SELECT business_id,
      SUM(CASE WHEN event_type = 'storefront_view' THEN 1 ELSE 0 END) AS sv,
      SUM(CASE WHEN event_type = 'item_view' THEN 1 ELSE 0 END) AS iv,
      SUM(CASE WHEN event_type = 'wa_click' THEN 1 ELSE 0 END) AS wc
     FROM analytics_events WHERE date(created_at) = ? GROUP BY business_id`
  ).bind(day).all()).results as { business_id: number; sv: number; iv: number; wc: number }[];
  for (const r of rollups) {
    const visitors = (await env.DB.prepare(`SELECT COUNT(DISTINCT session_id) AS n FROM analytics_events WHERE business_id = ? AND date(created_at) = ?`).bind(r.business_id, day).first()) as { n: number };
    await env.DB.prepare(
      `INSERT INTO analytics_daily (business_id, day, storefront_views, item_views, wa_clicks, unique_visitors) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_id, day) DO UPDATE SET storefront_views = excluded.storefront_views, item_views = excluded.item_views, wa_clicks = excluded.wa_clicks, unique_visitors = excluded.unique_visitors`
    ).bind(r.business_id, day, r.sv, r.iv, r.wc, visitors.n).run();
  }
  summary.rollups = rollups.length;

  // 8. Premium housekeeping: unboost overflow, drop expired Verified ID, saved-search alerts
  summary.featured_trimmed = await trimFeaturedOverflow(env);
  summary.verified_expired = await expireVerifiedBadges(env);
  summary.saved_search_alerts = await notifySavedSearches(env);

  // 9. Lead follow-ups the vendor scheduled
  const due = (await env.DB.prepare(
    `SELECT i.id, i.buyer_name, i.business_id, b.owner_user_id
     FROM inquiries i JOIN businesses b ON b.id = i.business_id
     WHERE i.follow_up_at IS NOT NULL AND i.follow_up_at <= ?
       AND i.follow_up_notified_at IS NULL
       AND i.status NOT IN ('converted','lost')`
  ).bind(now).all()).results as { id: number; buyer_name: string | null; owner_user_id: number }[];
  for (const row of due) {
    await notify(env, {
      userId: row.owner_user_id,
      type: 'follow_up.due',
      title: 'Follow-up is due',
      body: row.buyer_name ? `Time to get back to ${row.buyer_name}.` : 'A lead you marked for follow-up is due.',
      data: { inquiry_id: row.id },
    });
    await env.DB.prepare(`UPDATE inquiries SET follow_up_notified_at = ? WHERE id = ?`).bind(now, row.id).run();
    summary.follow_ups = (summary.follow_ups || 0) + 1;
  }

  // 10. Featured placement expires. A null featured_until stays until an admin clears it.
  const unfeatured = await env.DB.prepare(
    `UPDATE businesses SET is_featured = 0 WHERE is_featured = 1 AND featured_until IS NOT NULL AND featured_until <= ?`
  ).bind(now).run();
  summary.unfeatured = Number(unfeatured.meta?.changes || 0);

  // 11. Pending plan payments that never got a proof release their referral credit.
  const abandoned = (await env.DB.prepare(
    `SELECT p.id, p.metadata, b.owner_user_id FROM payments p
     JOIN businesses b ON b.id = p.business_id
     WHERE p.status = 'pending' AND p.plan_id IS NOT NULL AND p.created_at <= datetime('now', '-2 days')
     LIMIT 40`
  ).all()).results as { id: number; metadata: string | null; owner_user_id: number }[];
  for (const row of abandoned) {
    let held = 0;
    try { held = Number((JSON.parse(row.metadata || '{}') as { credit_kobo?: number }).credit_kobo || 0); } catch { held = 0; }
    if (held > 0) await restoreCredit(env, row.owner_user_id, held);
    await env.DB.prepare(`UPDATE payments SET status = 'failed', rejection_reason = 'Abandoned before proof was sent.' WHERE id = ? AND status = 'pending'`).bind(row.id).run();
    summary.abandoned_payments = (summary.abandoned_payments || 0) + 1;
  }

  // 12. Trust & safety: warn on reports nearing their 48-hour SLA and flag the
  //     ones that have missed it. A marketplace is judged by how fast it answers
  //     a report, not by how many it receives.
  const sla = await reportSlaSweep(env);
  summary.report_sla_warned = sla.warned;
  summary.report_sla_breached = sla.breached;

  // 13. Yesterday's money, checked against Paystack. Silent when it agrees;
  //     a notification per discrepancy when it does not.
  try {
    const recon = await reconcilePayments(env, { from: todayStr(), to: todayStr() });
    if (recon.available && recon.discrepancies.length > 0) {
      const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as { id: number }[];
      const money = recon.discrepancies.filter((d) => d.kind !== 'missing_on_paystack');
      for (const a of admins) {
        await notify(env, {
          userId: a.id,
          type: 'reconciliation.mismatch',
          title: `${recon.discrepancies.length} payment mismatch(es) found`,
          body: money.length
            ? `${money.length} involve real money. Open Admin → Reconciliation.`
            : 'Abandoned checkouts only — no money is missing.',
          data: { date: todayStr() },
        });
      }
      summary.reconciliation_mismatches = recon.discrepancies.length;
    }
  } catch (e) {
    // Reconciliation must never take the hourly job down with it.
    console.error('[cron] reconciliation failed', e);
  }

  // 14. Alert on error rates. One notification per bad hour, not one per error.
  try {
    for (const rule of ALERT_RULES) {
      if (!(await shouldAlert(env, rule))) continue;
      const admins = (await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all()).results as { id: number }[];
      for (const a of admins) {
        await notify(env, { userId: a.id, type: 'health.alert', title: rule.title, body: rule.body, data: { alert_key: rule.key } });
      }
      await markAlertSent(env, rule.key);
      summary[`alert_${rule.key}`] = 1;
    }
  } catch (e) {
    console.error('[cron] alerting failed', e);
  }

  // 15. Housekeeping
  await pruneRateLimits(env);
  summary.error_log_pruned = await pruneErrorLog(env);
  await env.DB.prepare(`DELETE FROM upload_tokens WHERE expires_at < ? AND used_at IS NOT NULL`).bind(Math.floor(Date.now() / 1000) - 86400).run();
  await env.DB.prepare(`DELETE FROM sessions WHERE last_activity < ?`).bind(Math.floor(Date.now() / 1000) - 30 * 86400).run();

  return { summary };
}
