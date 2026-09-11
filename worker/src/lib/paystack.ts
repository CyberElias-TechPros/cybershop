import type { Env } from '../config';
import { paystackMock } from '../config';
import { AppError } from './errors';

export interface InitiateArgs {
  reference: string;
  amountKobo: number;
  email: string;
  name: string;
  meta?: Record<string, string>;
}

export interface InitiateResult {
  url: string;
  mock: boolean;
  paystackReference: string | null;
}

/**
 * Start a Paystack hosted checkout. In mock mode (no live key) returns a URL to a
 * local mock checkout page that exercises the exact same webhook path.
 */
export async function initiatePaystack(env: Env, args: InitiateArgs): Promise<InitiateResult> {
  if (paystackMock(env)) {
    return {
      url: `${env.APP_URL}/paystack/mock?ref=${encodeURIComponent(args.reference)}`,
      mock: true,
      paystackReference: null,
    };
  }
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      currency: 'NGN',
      reference: args.reference,
      metadata: { ...args.meta, name: args.name },
      callback_url: `${env.APP_URL}/payment/status`,
    }),
  });
  const json = (await res.json()) as { status: boolean; message?: string; data?: { authorization?: { url?: string }; reference?: string } };
  if (!json.status || !json.data?.authorization?.url) {
    throw new AppError(502, 'paystack_failed', json.message || 'Could not start Paystack checkout. Try again or use bank transfer.');
  }
  return { url: json.data.authorization.url, mock: false, paystackReference: json.data.reference ?? null };
}

/**
 * Verify a Paystack transaction by reference using the secret key (server-to-server).
 * This is the authoritative check for webhook handling — the webhook body itself is
 * never trusted for activation decisions.
 */
export async function verifyPaystackReference(env: Env, reference: string): Promise<{ success: boolean; amountKobo: number; email: string | null }> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const json = (await res.json()) as { status: boolean; data?: { status?: string; amount?: number; customer?: { email?: string } } };
  if (!json.status || !json.data) return { success: false, amountKobo: 0, email: null };
  return {
    success: json.data.status === 'success',
    amountKobo: json.data.amount ?? 0,
    email: json.data.customer?.email ?? null,
  };
}
