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

/** No automatic retry of money-creating requests. Verification/webhook delivery can retry safely. */
async function request(path: string, env: Env, body?: unknown): Promise<Record<string, any>> {
  try {
    const response = await fetch(`https://api.paystack.co${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('provider response');
    const json: unknown = await response.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('provider schema');
    return json as Record<string, any>;
  } catch {
    // Never forward provider bodies/errors: they can include credentials or customer data.
    throw new AppError(502, 'paystack_unavailable', 'Payment service is unavailable. Please check your payment status before retrying.');
  }
}

export async function initiatePaystack(env: Env, args: InitiateArgs): Promise<InitiateResult> {
  if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0) throw new AppError(400, 'invalid_amount', 'Payment amount must be a positive whole number of kobo.');
  if (paystackMock(env)) return { url: `${env.APP_URL}/paystack/mock?ref=${encodeURIComponent(args.reference)}`, mock: true, paystackReference: null };
  const json = await request('/transaction/initialize', env, {
    email: args.email, amount: args.amountKobo, currency: 'NGN', reference: args.reference,
    metadata: { ...args.meta, name: args.name }, callback_url: `${env.APP_URL}/payment/status`,
  });
  // Paystack's OpenAPI TransactionInitializeResponse specifies authorization_url, not authorization.url.
  const data = json.data;
  let url: URL | null = null;
  try { url = new URL(data?.authorization_url); } catch { /* invalid response */ }
  if (json.status !== true || data?.reference !== args.reference || !url ||
      url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.username || url.password || url.port || url.hash) {
    throw new AppError(502, 'paystack_failed', 'Could not start payment checkout. Please check your payment status before retrying.');
  }
  return { url: url.href, mock: false, paystackReference: data.reference };
}

export interface VerificationResult {
  success: boolean;
  amountKobo: number;
  email: string | null;
  terminalFailure: boolean;
}

export async function verifyPaystackReference(env: Env, reference: string): Promise<VerificationResult> {
  const json = await request(`/transaction/verify/${encodeURIComponent(reference)}`, env);
  const data = json.data;
  if (json.status !== true || !data || typeof data.status !== 'string' || data.reference !== reference ||
      data.currency !== 'NGN' || !Number.isSafeInteger(data.amount) || data.amount <= 0) {
    // Invalid responses are transient errors, never a basis for irreversible local state changes.
    throw new AppError(502, 'paystack_invalid_response', 'Payment confirmation is temporarily unavailable. Please check again shortly.');
  }
  return {
    success: data.status === 'success', amountKobo: data.amount,
    email: typeof data.customer?.email === 'string' ? data.customer.email : null,
    terminalFailure: ['failed', 'abandoned', 'reversed'].includes(data.status),
  };
}
