import type { Env } from '../config';

import { enqueueMail, dispatchMail, type DeliveryOptions } from './outbox';

/** Durable encrypted delivery. true means queued, not delivered to an inbox. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function mailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY || env.MAIL_ENDPOINT);
}

export async function sendEmail(env: Env, msg: MailMessage, options: DeliveryOptions = {}): Promise<boolean> {
  if (!mailConfigured(env)) return false;
  let id: string;
  try { id = await enqueueMail(env, msg, options); }
  catch {
    console.error('[mail] enqueue_failed'); // No addresses, tokens or provider bodies.
    return false;
  }
  try { await dispatchMail(env, { id, limit: 1 }); }
  catch { console.error('[mail] dispatch_deferred'); } // Durable intent survives provider/runtime failure.
  return true;
}

export const escapeMailHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Shared shell for transactional mail — dark-market brand, readable anywhere. */
export function mailHtml(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#060b09;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#edf5f1;">
  <div style="max-width:520px;margin:0 auto;background:#0a120f;border:1px solid rgba(237,245,241,.12);border-radius:16px;padding:28px;">
    <p style="margin:0 0 18px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6ff0b0;">Cyber<span style="color:#f2c879">Shop</span></p>
    <h1 style="margin:0 0 12px;font-size:20px;color:#edf5f1;">${escapeMailHtml(title)}</h1>
    <div style="font-size:14px;line-height:1.6;color:#a3bcb2;">${bodyHtml}</div>
    ${cta ? `<p style="margin:22px 0 0;"><a href="${escapeMailHtml(cta.url)}" style="display:inline-block;background:#0fb56c;color:#04150d;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px;">${escapeMailHtml(cta.label)}</a></p>` : ''}
    <p style="margin:22px 0 0;font-size:12px;color:#6f8d7f;">CyberShop · find a business, talk to it on WhatsApp.<br>If you weren't expecting this email, you can ignore it.</p>
  </div>
</body></html>`;
}
