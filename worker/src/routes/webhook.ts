import { Hono } from 'hono';
import type { Env } from '../config';
import { paystackMock } from '../config';
import { handlePaystackWebhook } from '../lib/payments';

const app = new Hono<{ Bindings: Env }>();

/**
 * Paystack webhook endpoint (public — called by Paystack servers).
 * The payload is NOT trusted: activation always goes through
 * verifyPaystackReference() (server-to-server with the secret key)
 * or, in mock mode, the mock callback with its own HMAC check.
 */
app.post('/paystack', async (c) => {
  const env = c.env;
  const ip = c.req.header("cf-connecting-ip") || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null;
  let reference: string | null = null;
  try {
    const body = await c.req.json();
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
