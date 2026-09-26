import type { Env } from '../config';
import { nowIso } from './util';
import { sendEmail, mailHtml, mailConfigured } from './mail';

/**
 * Types that mirror to email. Everything a user must not miss — money,
 * access, renewals, and (for vendors) leads. In-app always happens first;
 * email is best-effort and skipped silently when no provider is configured.
 */
const EMAIL_TYPES = new Set([
  'payment.approved',
  'payment.rejected',
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
  'staff.joined',
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
  } else if (type === 'review.new') {
    cta = { label: 'See the review', url: `${env.APP_URL}/dashboard` };
  }
  return { html: mailHtml(esc(title), esc(body), cta), cta };
}

export async function notify(
  env: Env,
  args: { userId: number; type: string; title: string; body?: string; data?: Record<string, unknown> }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(args.userId, args.type, args.title, args.body ?? null, args.data ? JSON.stringify(args.data) : null, nowIso()).run();

  if (!mailConfigured(env) || !EMAIL_TYPES.has(args.type)) return;
  try {
    const user = (await env.DB.prepare('SELECT email FROM users WHERE id = ? AND deleted_at IS NULL').bind(args.userId).first()) as { email: string } | null;
    if (!user?.email) return;
    const body = args.body ?? '';
    const { html, cta } = emailBodyFor(args.type, args.title, body, env, args.data);
    await sendEmail(env, {
      to: user.email,
      subject: `${args.title} · CyberShop`,
      text: `${args.title}\n\n${body}\n\n— CyberShop\n${cta ? cta.url + '\n' : ''}`,
      html,
    });
  } catch (e) {
    console.error('[notify] email mirror failed', e);
  }
}
