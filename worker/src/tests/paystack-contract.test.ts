import { afterEach, describe, expect, it, vi } from 'vitest';
import { initiatePaystack, verifyPaystackReference } from '../lib/paystack';
import { productionEnv } from './fixtures/env';

// Synthetic fixtures shaped from PaystackOSS/openapi at 07c5abc8c34536e98a7755a5338178b4f430b09b.
// Not captured sandbox/live traffic. See docs/operations/release-safety.md.
const args = { reference: 'CS-CONTRACT-001', amountKobo: 150000, email: 'test@invalid.test', name: 'Synthetic Vendor' };
const initialized = () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/synthetic', access_code: 'synthetic', reference: args.reference } });
const verified = () => ({ status: true, data: { status: 'success', reference: args.reference, amount: 150000, currency: 'NGN', customer: { email: args.email } } });
function respond(body: unknown, status = 200) {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Paystack initialize provider contract', () => {
  it('uses authorization_url from the documented initialize schema', async () => {
    respond(initialized());
    expect(await initiatePaystack(productionEnv(), args)).toEqual({ url: initialized().data.authorization_url, mock: false, paystackReference: args.reference });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect(JSON.parse(options!.body as string)).toMatchObject({ amount: 150000, currency: 'NGN', reference: args.reference, callback_url: 'https://cybershop.ng/payment/status' });
    expect(options!.signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects the old incorrect nested authorization.url schema', async () => {
    respond({ status: true, data: { authorization: { url: 'https://checkout.paystack.com/synthetic' }, reference: args.reference } });
    await expect(initiatePaystack(productionEnv(), args)).rejects.toMatchObject({ code: 'paystack_failed' });
  });
  it.each(['http://checkout.paystack.com/x', 'https://checkout.paystack.com.evil.test/x', 'https://evil.test/x', 'javascript:alert(1)', 'https://user:pass@checkout.paystack.com/x'])('rejects unsafe checkout %s', async (url) => {
    const fixture = initialized(); fixture.data.authorization_url = url; respond(fixture);
    await expect(initiatePaystack(productionEnv(), args)).rejects.toMatchObject({ code: 'paystack_failed' });
  });
  it('rejects wrong references', async () => {
    const fixture = initialized(); fixture.data.reference = 'wrong'; respond(fixture);
    await expect(initiatePaystack(productionEnv(), args)).rejects.toMatchObject({ code: 'paystack_failed' });
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amount %s without contacting provider', async (amountKobo) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(initiatePaystack(productionEnv(), { ...args, amountKobo })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Paystack authoritative verification', () => {
  it('requires correct reference, NGN and integer kobo', async () => {
    respond(verified());
    expect(await verifyPaystackReference(productionEnv(), args.reference)).toEqual({ success: true, amountKobo: 150000, email: args.email, terminalFailure: false });
  });
  it.each([{ reference: 'wrong' }, { currency: 'USD' }, { amount: 1.5 }, { amount: 0 }, { amount: '150000' }, { status: undefined }])('rejects mismatched/malformed verification %#', async (changes) => {
    const fixture = verified(); Object.assign(fixture.data, changes); respond(fixture);
    await expect(verifyPaystackReference(productionEnv(), args.reference)).rejects.toMatchObject({ code: 'paystack_invalid_response' });
  });
  it.each(['pending', 'ongoing', 'processing', 'queued'])('does not permanently fail %s transactions', async (status) => {
    const fixture = verified(); fixture.data.status = status; respond(fixture);
    expect(await verifyPaystackReference(productionEnv(), args.reference)).toMatchObject({ success: false, terminalFailure: false });
  });
  it.each(['failed', 'abandoned', 'reversed'])('recognizes terminal %s', async (status) => {
    const fixture = verified(); fixture.data.status = status; respond(fixture);
    expect(await verifyPaystackReference(productionEnv(), args.reference)).toMatchObject({ success: false, terminalFailure: true });
  });
  it.each([401, 429, 500, 503])('sanitizes HTTP %s and does not auto-retry', async (status) => {
    respond({ message: 'sensitive provider details' }, status);
    await expect(verifyPaystackReference(productionEnv(), args.reference)).rejects.toMatchObject({ status: 502, code: 'paystack_unavailable' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('sanitizes malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>private</html>')));
    await expect(verifyPaystackReference(productionEnv(), args.reference)).rejects.toMatchObject({ code: 'paystack_unavailable' });
  });
  it('sanitizes network and timeout failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret network details')));
    await expect(initiatePaystack(productionEnv(), args)).rejects.toMatchObject({ message: expect.not.stringContaining('secret') });
  });
});
