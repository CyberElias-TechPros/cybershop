import type { Env } from '../config';
import { nowUnix, sha256Hex } from './util';
import { isProduction } from './envcheck';
import { emailAllowed } from './notifyprefs';
import type { MailMessage } from './mail';

export interface DeliveryOptions {
  userId?: number;
  notificationType?: string;
  idempotencyKey?: string;
  expiresInSeconds?: number;
}
type Fetcher = typeof fetch;
interface Row {
  id: string; payload: string | null; user_id: number | null; notification_type: string | null;
  status: string; attempts: number; available_at: number; expires_at: number;
}
const MAX_ATTEMPTS = 8;

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const hosted = isProduction(env) || env.APP_ENV === 'staging';
  const material = env.MAIL_OUTBOX_KEY || (!hosted ? env.AUTH_SECRET : undefined);
  if (!material || material.length < 24) throw new Error('Outbox encryption key unavailable');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function sealMail(env: Env, message: MailMessage, id: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`outbox:${id}`) },
    await encryptionKey(env), new TextEncoder().encode(JSON.stringify(message)));
  return JSON.stringify({ v: 1, iv: b64(iv), data: b64(new Uint8Array(encrypted)) });
}
export async function openMail(env: Env, value: string, id: string): Promise<MailMessage> {
  const sealed = JSON.parse(value);
  if (sealed.v !== 1) throw new Error('Unsupported outbox payload');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv), additionalData: new TextEncoder().encode(`outbox:${id}`) },
    await encryptionKey(env), bytes(sealed.data));
  const msg = JSON.parse(new TextDecoder().decode(plain));
  if (typeof msg.to !== 'string' || typeof msg.subject !== 'string' || typeof msg.text !== 'string') throw new Error('Invalid outbox payload');
  return msg;
}

/** Persist before delivery. Stable caller keys make retries the same logical send. */
export async function enqueueMail(env: Env, message: MailMessage, options: DeliveryOptions = {}): Promise<string> {
  const now = nowUnix();
  const id = options.idempotencyKey ? await sha256Hex(`mail:${options.idempotencyKey}`) : crypto.randomUUID();
  const ttl = Math.min(23 * 3600, Math.max(60, options.expiresInSeconds ?? 23 * 3600));
  if (!Number.isFinite(ttl) || message.to.length > 320 || message.subject.length > 500 || JSON.stringify(message).length > 200_000) throw new Error('Invalid mail intent');
  const payload = await sealMail(env, message, id);
  await env.DB.prepare(`INSERT INTO email_outbox (id,payload,user_id,notification_type,available_at,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, payload, options.userId ?? null, options.notificationType ?? null, now, now + Math.floor(ttl), now, now).run();
  return id;
}

/** Provider acceptance, not inbox delivery. Stable key supports provider-side deduplication. */
async function deliver(env: Env, message: MailMessage, id: string, fetcher: Fetcher): Promise<{ accepted: boolean; retry: boolean; code: string }> {
  const sender = env.MAIL_FROM || 'CyberShop <noreply@cybershop.ng>';
  const from = env.MAIL_FROM_NAME && !sender.includes(env.MAIL_FROM_NAME) ? `${env.MAIL_FROM_NAME} <${sender.replace(/^[^<]*</, '').replace(/>.*$/, '')}>` : sender;
  if (!env.RESEND_API_KEY && !env.MAIL_ENDPOINT) return { accepted: false, retry: true, code: 'provider_unconfigured' };
  try {
    const resend = Boolean(env.RESEND_API_KEY);
    const response = await fetcher(resend ? 'https://api.resend.com/emails' : env.MAIL_ENDPOINT!, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'Idempotency-Key': `cybershop/${id}`,
        ...(resend ? { authorization: `Bearer ${env.RESEND_API_KEY}` } : {}) },
      body: JSON.stringify({ from, to: resend ? [message.to] : message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
    });
    await response.body?.cancel();
    return { accepted: response.ok, retry: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500, code: `http_${response.status}` };
  } catch { return { accepted: false, retry: true, code: 'provider_unavailable' }; }
}

export async function dispatchMail(env: Env, options: { id?: string; limit?: number; fetcher?: Fetcher } = {}): Promise<{ sent: number; failed: number; cancelled: number }> {
  const result = { sent: 0, failed: 0, cancelled: 0 };
  const now = nowUnix();
  await env.DB.prepare(`UPDATE email_outbox SET status='cancelled',payload=NULL,lock_token=NULL,locked_until=NULL,last_error='expired',updated_at=?
    WHERE status IN ('queued','processing','dead') AND expires_at<=?`).bind(now, now).run();
  await env.DB.prepare(`UPDATE email_outbox SET status='dead',lock_token=NULL,locked_until=NULL,last_error='attempts_exhausted',updated_at=?
    WHERE status='processing' AND locked_until<=? AND attempts>=?`).bind(now, now, MAX_ATTEMPTS).run();
  const rows = (await env.DB.prepare(`SELECT * FROM email_outbox WHERE expires_at>? AND attempts<?
    AND ((status='queued' AND available_at<=?) OR (status='processing' AND locked_until<=?))
    ${options.id ? 'AND id=?' : ''} ORDER BY available_at,id LIMIT ?`)
    .bind(now, MAX_ATTEMPTS, now, now, ...(options.id ? [options.id] : []), Math.min(20, Math.max(1, options.limit ?? 10))).all()).results as unknown as Row[];
  for (const row of rows) {
    const lock = crypto.randomUUID();
    const claimed = await env.DB.prepare(`UPDATE email_outbox SET status='processing',attempts=attempts+1,lock_token=?,locked_until=?,updated_at=?
      WHERE id=? AND expires_at>? AND attempts<? AND ((status='queued' AND available_at<=?) OR (status='processing' AND locked_until<=?))`)
      .bind(lock, nowUnix() + 60, nowUnix(), row.id, nowUnix(), MAX_ATTEMPTS, nowUnix(), nowUnix()).run();
    if (!claimed.meta.changes) continue;
    let outcome: { accepted: boolean; retry: boolean; code: string };
    let message: MailMessage | undefined;
    try { if (row.payload) message = await openMail(env, row.payload, row.id); } catch { /* Authenticated decryption failed. */ }
    if (!message) outcome = { accepted: false, retry: false, code: 'payload_invalid' };
    else {
      if (row.user_id !== null) {
        const user = await env.DB.prepare(`SELECT email FROM users WHERE id=? AND status='active' AND deleted_at IS NULL`).bind(row.user_id).first<{ email: string }>();
        if (!user || user.email !== message.to || (row.notification_type && !(await emailAllowed(env, row.user_id, row.notification_type)))) {
          await env.DB.prepare(`UPDATE email_outbox SET status='cancelled',payload=NULL,locked_until=NULL,lock_token=NULL,updated_at=? WHERE id=? AND lock_token=?`).bind(nowUnix(), row.id, lock).run();
          result.cancelled++; continue;
        }
      }
      outcome = await deliver(env, message, row.id, options.fetcher ?? fetch);
    }
    const attempts = row.attempts + 1;
    const status = outcome.accepted ? 'sent' : outcome.retry && attempts < MAX_ATTEMPTS ? 'queued' : 'dead';
    const next = nowUnix() + Math.min(3600, 30 * 2 ** attempts);
    await env.DB.prepare(`UPDATE email_outbox SET status=?,payload=CASE WHEN ?='sent' THEN NULL ELSE payload END,
      available_at=?,last_error=?,locked_until=NULL,lock_token=NULL,updated_at=? WHERE id=? AND lock_token=?`)
      .bind(status, status, next, outcome.accepted ? null : outcome.code, nowUnix(), row.id, lock).run();
    if (outcome.accepted) result.sent++; else result.failed++;
  }
  await env.DB.prepare(`DELETE FROM email_outbox WHERE created_at<? AND status IN ('sent','cancelled','dead')`).bind(now - 7 * 86400).run();
  return result;
}

export async function outboxHealth(env: Env) {
  const counts = (await env.DB.prepare('SELECT status,COUNT(*) AS n FROM email_outbox GROUP BY status').all()).results;
  const recent = (await env.DB.prepare(`SELECT id,status,attempts,available_at,expires_at,last_error,created_at,updated_at FROM email_outbox ORDER BY created_at DESC LIMIT 30`).all()).results;
  return { counts, recent };
}
export async function replayMail(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(`UPDATE email_outbox SET status='queued',attempts=0,available_at=?,updated_at=?,last_error=NULL
    WHERE id=? AND status='dead' AND payload IS NOT NULL AND expires_at>?`).bind(nowUnix(), nowUnix(), id, nowUnix()).run();
  return result.meta.changes === 1;
}
