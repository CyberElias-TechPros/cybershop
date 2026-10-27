import type { Env } from '../config';
import { nowIso } from './util';
import { sendEmail, mailHtml, mailConfigured } from './mail';
import { emailAllowed } from './notifyprefs';

/**
 * Types that mirror to email. Everything a user must not miss — money,
 * access, renewals, and (for vendors) leads. In-app always happens first;
 * email is queued durably when a provider is configured. Preferences are rechecked at dispatch.
 */
const EMAIL_TYPES = new Set([
  'security.2fa_enabled',
  'security.2fa_disabled',
  'payment.approved',
  'payment.rejected',
  'payment.refunded',
  'subscription.extended',
  'business.featured',
  'subscription.expiring',
  'subscription.expired',
  'business.active',
  'business.suspended',
  'verification.approved',
  'verification.rejected',
  'inquiry.new',
  'saved_search.match',
  'deposit.paid',
  'deposit.released',
  'deposit.refunded',
  'deposit.refund_requested',
  'thread.message',
  'thread.new',
  'review.new',
  'follow_up.due',
  'report.resolved',
  'staff.joined',
  'seller.digest',
]);

function emailBodyFor(type: string, title: string, body: string, env: Env, data?: Record<string, unknown>): { html: string; cta?: { label: string; url: string } } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let cta: { label: string; url: string } | undefined;
  if (type === 'payment.approved' && data?.payment_id) {
    cta = { label: 'View receipt', url: `${env.APP_URL}/dashboard/billing/receipt/${data.payment_id}` };
  } else if (type.startsWith('subscription.')) {
    cta = { label: 'Renew in billing', url: `${env.APP_URL}/dashboard/billing` };
  } else if (type === 'inquiry.new' || type === 'follow_up.due') {
    cta = { label: 'Open your leads', url: `${env.APP_URL}/dashboard/leads` };
  } else if (type === 'business.active') {
    cta = { label: 'Open your dashboard', url: `${env.APP_URL}/dashboard` };
  } else if (type === 'saved_search.match') {
    cta = { label: 'See new ads', url: `${env.APP_URL}/account` };
  } else if (type.startsWith('deposit.')) {
    cta = { label: 'Open deposits', url: `${env.APP_URL}/dashboard/deposits` };
  } else if (type.startsWith('thread.')) {
    cta = { label: 'Open inbox', url: `${env.APP_URL}/dashboard/inbox` };
  } else if (type === 'seller.digest') {
    cta = { label: 'Open analytics', url: `${env.APP_URL}/dashboard/analytics` };
  } else if (type === 'review.new') {
    cta = { label: 'See the review', url: `${env.APP_URL}/dashboard` };
  }
  return { html: mailHtml(title, esc(body), cta), cta };
}

export async function notify(
  env: Env,
  args: { userId: number; type: string; title: string; body?: string; data?: Record<string, unknown> }
): Promise<void> {
  const inserted = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(args.userId, args.type, args.title, args.body ?? null, args.data ? JSON.stringify(args.data) : null, nowIso()).run();

  await mirrorNotification(env, Number(inserted.meta.last_row_id));
}

/** Mirror an existing durable notification; stable row ID deduplicates queue retries. */
export async function mirrorNotification(env: Env, notificationId: number): Promise<boolean> {
  if (!mailConfigured(env)) return false;
  try {
    const record = await env.DB.prepare('SELECT user_id,type,title,body,data FROM notifications WHERE id=?').bind(notificationId)
      .first<{ user_id: number; type: string; title: string; body: string | null; data: string | null }>();
    if (!record || !EMAIL_TYPES.has(record.type)) return true;
    if (!(await emailAllowed(env, record.user_id, record.type))) return true;
    const user = await env.DB.prepare("SELECT email FROM users WHERE id=? AND status='active' AND deleted_at IS NULL").bind(record.user_id).first<{ email: string }>();
    if (!user) return true;
    const body = record.body ?? '';
    const data = record.data ? JSON.parse(record.data) as Record<string, unknown> : undefined;
    const { html, cta } = emailBodyFor(record.type, record.title, body, env, data);
    return await sendEmail(env, {
      to: user.email, subject: `${record.title} · CyberShop`,
      text: `${record.title}\n\n${body}\n\n— CyberShop\n${cta ? cta.url + '\n' : ''}`, html,
    }, { userId: record.user_id, notificationType: record.type, idempotencyKey: `notification:${notificationId}` });
  } catch {
    console.error('[notify] email_mirror_failed');
    return false;
  }
}
