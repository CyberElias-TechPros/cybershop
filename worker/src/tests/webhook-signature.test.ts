import { afterEach, describe, it, expect, vi } from 'vitest';
import webhooks from '../routes/webhook';
import { handlePaystackWebhook } from '../lib/payments';
import { productionEnv } from './fixtures/env';

vi.mock('../lib/payments', () => ({ handlePaystackWebhook: vi.fn() }));
afterEach(() => vi.mocked(handlePaystackWebhook).mockReset());

async function signed(body: string, key: string) {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function call(body: string, signature?: string, mock = false) {
  return webhooks.fetch(new Request('https://api.cybershop.ng/paystack' + (mock ? '/mock' : ''), {
    method: 'POST', body, headers: signature ? { 'x-paystack-signature': signature } : {},
  }), productionEnv({ PAYSTACK_MOCK: mock ? '1' : '0' }));
}

describe('independent Paystack webhook signature gate', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'CS-SIGNED-001' } });
  it('allows only a correctly signed success event to reach authoritative verification', async () => {
    vi.mocked(handlePaystackWebhook).mockResolvedValue({ ok: true, detail: 'approved' });
    const signature = await signed(body, productionEnv().PAYSTACK_SECRET_KEY);
    expect((await call(body, signature)).status).toBe(200);
    expect(handlePaystackWebhook).toHaveBeenCalledWith(expect.anything(), 'CS-SIGNED-001', null);
  });
  it.each([undefined, '', 'bad', '0'.repeat(128)])('rejects missing/invalid signature %#', async (signature) => {
    expect((await call(body, signature)).status).toBe(401);
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
  it('rejects a changed body or wrong signing key', async () => {
    const signature = await signed(body, 'wrong-key');
    expect((await call(body, signature)).status).toBe(401);
    const correct = await signed(body, productionEnv().PAYSTACK_SECRET_KEY);
    expect((await call(body + ' ', correct)).status).toBe(401);
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
  it.each(['charge.failed', 'refund.processed', 'charge.success.fake', undefined])('ignores non-success or missing event %s', async (event) => {
    const raw = JSON.stringify({ event, data: { reference: 'CS-SIGNED-001' } });
    expect((await call(raw, await signed(raw, productionEnv().PAYSTACK_SECRET_KEY))).status).toBe(200);
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
  it('rejects malformed signed payload', async () => {
    const raw = '{invalid';
    expect((await call(raw, await signed(raw, productionEnv().PAYSTACK_SECRET_KEY))).status).toBe(400);
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
  it('never allows mock callbacks on production even if mock flag was accidentally set', async () => {
    expect((await call(JSON.stringify({ reference: 'CS-SIGNED-001' }), undefined, true)).status).toBe(403);
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
});
