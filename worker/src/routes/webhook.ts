import { Hono } from 'hono';
import type { Env } from '../config';
import { paystackMock } from '../config';
import { handlePaystackWebhook } from '../lib/payments';

const app = new Hono<{ Bindings: Env }>();

/** Constant-time string compare — never leak how much of a signature matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Paystack signs every webhook with HMAC-SHA512 of the raw request body using
 * the secret key. Without this check anyone who learns a reference could POST
 * here and make us do work, so in live mode an unsigned or badly signed
 * delivery is rejected outright.
 */
async function signatureMatches(env: Env, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.PAYSTACK_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, signature.trim().toLowerCase());
}

/**
 * Paystack webhook endpoint (public — called by Paystack servers).
 *
 * Two independent checks before anything is trusted:
 *   1. the `x-paystack-signature` HMAC over the raw body (proves it came from
 *      Paystack, and that the body was not tampered with in transit);
 *   2. verifyPaystackReference() inside handlePaystackWebhook — a
 *      server-to-server call with the secret key. The webhook payload is never
 *      the basis of an activation decision, only a trigger to go and check.
 */
app.post('/paystack', async (c) => {
  const env = c.env;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const raw = await c.req.text();

  // Mock mode has no real secret key to sign with, so it is gated on being
  // explicitly enabled (and is a hard error in production — see lib/envcheck).
  if (!paystackMock(env)) {
    const signature = c.req.header('x-paystack-signature');
    if (!(await signatureMatches(env, raw, signature ?? null))) {
      console.warn('[webhook] paystack signature check failed');
      return c.json({ ok: false, error: 'invalid signature' }, 401);
    }
  }

  let event: string | undefined;
  let reference: string | null = null;
  try {
    const body = JSON.parse(raw) as { event?: unknown; data?: { transaction?: { reference?: unknown }; reference?: unknown }; reference?: unknown };
    if (typeof body?.event === 'string') event = body.event;
    // Paystack sends event + data (data.reference or data.transaction.reference)
    reference =
      (body?.data?.transaction?.reference as string | undefined) ||
      (body?.data?.reference as string | undefined) ||
      (body?.reference as string | undefined) ||
      null;
  } catch {
    reference = null;
  }
  if (!reference || typeof reference !== 'string' || reference.length > 120) {
    return c.json({ ok: false, error: 'missing reference' }, 400);
  }
  // Only money arriving is interesting. Refunds, chargebacks and failed charges
  // carry a reference too, and acting on them would look like a payment.
  if (event && !event.startsWith('charge.success')) {
    return c.json({ ok: true, detail: `ignored event ${event}` });
  }

  const result = await handlePaystackWebhook(env, reference, ip);
  return c.json({ ok: result.ok, detail: result.detail });
});

/** Development-only mock callback used by the local mock Paystack checkout page. */
app.post('/paystack/mock', async (c) => {
  const env = c.env;
  if (!paystackMock(env)) return c.json({ ok: false, error: 'mock disabled' }, 403);
  const body = await c.req.json().catch(() => null);
  const reference = typeof body?.reference === 'string' ? body.reference.slice(0, 60) : '';
  if (!/^[A-Z0-9-]{10,60}$/.test(reference)) return c.json({ ok: false, error: 'bad reference' }, 400);
  const result = await handlePaystackWebhook(env, reference, null);
  return c.json({ ok: result.ok, detail: result.detail });
});

export default app;
