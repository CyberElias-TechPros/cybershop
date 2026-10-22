import { describe, it, expect } from 'vitest';
import { checkEnv, isPublicHttps } from '../lib/envcheck';
import { paystackMock } from '../config';
import { productionEnv } from './fixtures/env';

describe('production configuration safety', () => {
  it('accepts explicit secure production configuration', () => expect(checkEnv(productionEnv()).ok).toBe(true));
  it.each([
    { APP_ENV: undefined }, { SESSION_SECURE: '0' }, { PAYSTACK_MOCK: '1' },
    { REQUIRE_ADMIN_2FA: '0' }, { PAYSTACK_SECRET_KEY: 'sk_test_synthetic' },
    { PAYSTACK_PUBLIC_KEY: 'pk_test_synthetic' }, { AUTH_SECRET: 'test-secret' },
    { INTERNAL_SECRET: '' }, { IP_SALT: 'short' }, { APP_URL: 'http://cybershop.ng' },
    { WEB_ORIGIN: 'https://other.cybershop.ng' }, { PAYSTACK_WEBHOOK_URL: 'https://api.cybershop.ng/wrong' },
    { RESEND_API_KEY: undefined, MAIL_ENDPOINT: undefined }, { MAIL_FROM: undefined },
    { MAIL_OUTBOX_KEY: undefined }, { MAIL_OUTBOX_KEY: 'short' }, { MAIL_ENDPOINT: 'http://mail.cybershop.ng' }, { MEDIA_DRIVER: 'gateway' as const, GATEWAY_SECRET: '' },
  ])('rejects unsafe settings %#', (overrides) => expect(checkEnv(productionEnv(overrides)).ok).toBe(false));
  it('cannot disguise a hosted deployment with insecure cookies', () => {
    const report = checkEnv(productionEnv({ APP_ENV: undefined, SESSION_SECURE: '0' }));
    expect(report.production).toBe(true);
    expect(report.ok).toBe(false);
  });
  it('requires test (not live) keys in explicitly isolated staging', () => {
    expect(checkEnv(productionEnv({ APP_ENV: 'staging' })).ok).toBe(false);
    const report = checkEnv(productionEnv({ APP_ENV: 'staging', PAYSTACK_SECRET_KEY: 'sk_test_synthetic', PAYSTACK_PUBLIC_KEY: 'pk_test_synthetic' }));
    expect(report.ok).toBe(true);
    expect(report.production).toBe(false);
  });
  it('never includes credential values in diagnostics', () => {
    const env = productionEnv({ AUTH_SECRET: 'short-secret-should-not-leak' });
    expect(JSON.stringify(checkEnv(env))).not.toContain(env.AUTH_SECRET);
  });
  it('mock payments work only on local development', () => {
    expect(paystackMock(productionEnv({ PAYSTACK_MOCK: '1' }))).toBe(false);
    expect(paystackMock(productionEnv({ APP_ENV: 'staging', PAYSTACK_MOCK: '1' }))).toBe(false);
    expect(paystackMock(productionEnv({ APP_ENV: 'development', PAYSTACK_MOCK: '1', SESSION_SECURE: '0', APP_URL: 'http://localhost:3000' }))).toBe(true);
  });
  it.each(['http://cybershop.ng', 'https://user:pass@cybershop.ng', 'https://localhost', 'https://127.0.0.1', 'https://api.<your-subdomain>.workers.dev', 'https://example.com', 'https://cybershop.ng/#secret', 'not a URL'])('rejects unsafe URL %s', (url) => expect(isPublicHttps(url)).toBe(false));
  it('distinguishes origins from endpoint URLs', () => {
    expect(isPublicHttps('https://cybershop.ng/path', true)).toBe(false);
    expect(isPublicHttps('https://cybershop.ng/path')).toBe(true);
  });
});
