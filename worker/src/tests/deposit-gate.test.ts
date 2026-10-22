import { describe, it, expect, vi } from 'vitest';
import { buyerDepositsEnabled } from '../config';
import { buildApp } from '../app';
import { createPaymentIntent } from '../lib/payments';
import { publicPremium } from '../lib/premium';
import { productionEnv } from './fixtures/env';

// Creation is disabled by default; existing references/webhook settlement and
// ledger access must remain available so a feature hold cannot strand funds.
describe('buyer-money release gate', () => {
  it('keeps real buyer collection off by default and permits explicit controlled opt-in', () => {
    expect(buyerDepositsEnabled(productionEnv())).toBe(false);
    expect(buyerDepositsEnabled(productionEnv({ BUYER_DEPOSITS_ENABLED: '1' }))).toBe(true);
    expect(buyerDepositsEnabled(productionEnv({ PAYSTACK_MOCK: '1' }))).toBe(false);
  });
  it('preserves local synthetic payment tests without enabling hosted mock money', () => {
    expect(buyerDepositsEnabled(productionEnv({ APP_ENV: 'development', APP_URL: 'http://localhost:3000', SESSION_SECURE: '0', PAYSTACK_MOCK: '1' }))).toBe(true);
  });
  it('denies new deposit intent before database writes or provider calls', async () => {
    const prepare = vi.fn(() => { throw new Error('unexpected database access'); });
    const env = productionEnv({ DB: { prepare } as unknown as D1Database });
    const response = await buildApp().fetch(new Request('https://api.cybershop.ng/api/public/deposits', {
      method: 'POST', headers: { 'x-internal-secret': env.INTERNAL_SECRET }, body: '{}',
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('hides the public deposit capability while preserving the entitlement record', async () => {
    const env = productionEnv({ DB: {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ type: 'buyer_escrow' }] }) }) }),
    } as unknown as D1Database });
    expect((await publicPremium(env, 1)).escrow).toBe(false);
    expect((await publicPremium({ ...env, BUYER_DEPOSITS_ENABLED: '1' }, 1)).escrow).toBe(true);
  });
  it('does not sell a disabled deposit add-on', async () => {
    const prepare = vi.fn();
    const env = productionEnv({ DB: { prepare } as unknown as D1Database });
    await expect(createPaymentIntent(env, {
      businessId: 1, kind: 'addon', method: 'paystack',
      addon: { id: 1, name: 'Deposit', slug: 'buyer-deposits', price: 100000, duration_days: 30, type: 'buyer_escrow' },
    })).rejects.toMatchObject({ status: 403 });
    expect(prepare).not.toHaveBeenCalled();
  });
});
