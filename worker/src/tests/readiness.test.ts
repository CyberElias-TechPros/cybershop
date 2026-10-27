import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../app';
import { productionEnv } from './fixtures/env';

const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

describe('separate liveness and readiness', () => {
  it('returns readiness only for a valid live config and reachable database', async () => {
    const response = await buildApp().fetch(new Request('https://api.cybershop.ng/readyz'), productionEnv({ RELEASE_SHA: 'abc123' }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ ok: true, config: { ok: true, production: true }, database: true, release: 'abc123' });
  });
  it('does not report insecure configuration as ready', async () => {
    const response = await buildApp().fetch(new Request('https://api.cybershop.ng/readyz'), productionEnv({ SESSION_SECURE: '0' }), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it('refuses hosted operations before bootstrap or payment handlers when unsafe', async () => {
    const prepare = vi.fn(() => { throw new Error('must not touch database'); });
    const env = productionEnv({ PAYSTACK_MOCK: '1', DB: { prepare } as unknown as D1Database });
    const response = await buildApp().fetch(new Request('https://api.cybershop.ng/api/webhooks/paystack/mock', { method: 'POST', body: '{}' }), env, context);
    expect(response.status).toBe(503);
    expect(prepare).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'service_unavailable' } });
  });
  it('reports database failure without trying admin bootstrap or exposing errors', async () => {
    const prepare = vi.fn(() => { throw new Error('sensitive database details'); });
    const env = productionEnv({ DB: { prepare } as unknown as D1Database });
    const response = await buildApp().fetch(new Request('https://api.cybershop.ng/readyz'), env, context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith('SELECT 1 AS ok');
    const live = await buildApp().fetch(new Request('https://api.cybershop.ng/healthz'), env, context);
    expect(live.status).toBe(200);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
