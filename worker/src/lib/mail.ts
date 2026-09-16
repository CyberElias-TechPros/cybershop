import type { Env } from '../config';

/**
 * Transactional email for Cloudflare Workers.
 *
 * Providers (first configured wins):
 *  1. Resend   — RESEND_API_KEY (https://resend.com, generous free tier)
 *  2. MailChannels-compatible HTTP endpoint — MAIL_ENDPOINT (e.g. paid
 *     MailChannels or any POST-JSON bridge)
 *
 * When nothing is configured (local dev / not yet provisioned) mail is a
 * logged no-op — never an error path. All sends are best-effort: a mail
 * failure must never fail the user's actual request, so callers may await
 * it freely but every internal error is swallowed + logged.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function mailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY || env.MAIL_ENDPOINT);
}

export async function sendEmail(env: Env, msg: MailMessage): Promise<boolean> {
  const from = env.MAIL_FROM || 'CyberShop <noreply@cybershop.ng>';
  const fromName = env.MAIL_FROM_NAME;
  const fromHeader = fromName && !from.includes(fromName) ? `${fromName} <${from.replace(/^[^<]*</, '').replace(/>.*$/, '')}>` : from;
  try {
    if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: fromHeader,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
        }),
      });
      if (!res.ok) {
        console.error('[mail] resend failed', res.status, (await res.text()).slice(0, 300));
        return false;
      }
      return true;
    }
    if (env.MAIL_ENDPOINT) {
      const res = await fetch(env.MAIL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: fromHeader, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
      });
      if (!res.ok) {
        console.error('[mail] endpoint failed', res.status);
        return false;
      }
      return true;
    }
    console.log(`[mail] not configured — would send to ${msg.to}: ${msg.subject}`);
    return false;
  } catch (e) {
    console.error('[mail] send error', e);
    return false;
  }
}

/** Shared shell for transactional mail — dark-market brand, readable anywhere. */
export function mailHtml(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#060b09;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#edf5f1;">
  <div style="max-width:520px;margin:0 auto;background:#0a120f;border:1px solid rgba(237,245,241,.12);border-radius:16px;padding:28px;">
    <p style="margin:0 0 18px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6ff0b0;">Cyber<span style="color:#f2c879">Shop</span></p>
    <h1 style="margin:0 0 12px;font-size:20px;color:#edf5f1;">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#a3bcb2;">${bodyHtml}</div>
    ${cta ? `<p style="margin:22px 0 0;"><a href="${cta.url}" style="display:inline-block;background:#0fb56c;color:#04150d;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px;">${cta.label}</a></p>` : ''}
    <p style="margin:22px 0 0;font-size:12px;color:#6f8d7f;">CyberShop · find a business, talk to it on WhatsApp.<br>If you weren't expecting this email, you can ignore it.</p>
  </div>
</body></html>`;
}
