import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { assertReadiness, checkProductionConfig, readJsonc, httpsOrigin } from '../lib/release.mjs';

const config = () => readJsonc(fileURLToPath(new URL('../../worker/wrangler.jsonc', import.meta.url)));
const host = 'https://cybershop-api.calm-disk-8311.workers.dev';
const secrets = ['AUTH_SECRET', 'INTERNAL_SECRET', 'IP_SALT', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY', 'MAIL_FROM', 'MAIL_OUTBOX_KEY', 'RESEND_API_KEY'];

describe('production release preflight', () => {
  it('parses checked-in JSONC without destroying HTTPS URLs', () => {
    assert.equal(config().env.production.vars.APP_URL, 'https://cybershop.ng');
    assert.deepEqual(checkProductionConfig(config(), host, secrets), []);
  });
  for (const [key, value] of Object.entries({ APP_ENV: 'development', SESSION_SECURE: '0', PAYSTACK_MOCK: '1', REQUIRE_ADMIN_2FA: '0', BUYER_DEPOSITS_ENABLED: '1', WEB_ORIGIN: 'http://localhost:3000', PAYSTACK_WEBHOOK_URL: 'https://other.cybershop.ng/api/webhooks/paystack' })) {
    it(`rejects unsafe ${key}`, () => {
      const c = config(); c.env.production.vars[key] = value;
      assert.ok(checkProductionConfig(c, host, secrets).length);
    });
  }
  it('rejects inherited/missing database binding and cron', () => {
    const c = config(); delete c.env.production.d1_databases; delete c.env.production.triggers;
    assert.equal(checkProductionConfig(c, host, secrets).length, 3);
  });
  it('requires explicit host and actual secret names', () => {
    assert.ok(checkProductionConfig(config(), undefined, secrets).length);
    assert.ok(checkProductionConfig(config(), host, []).length >= 7);
  });
  it('requires gateway signing secret for gateway driver', () => {
    const c = config(); c.env.production.vars.MEDIA_DRIVER = 'gateway';
    assert.ok(checkProductionConfig(c, host, secrets).some((e) => e.includes('GATEWAY_SECRET')));
  });
  it('does not confuse static config with live values', () => {
    assert.deepEqual(checkProductionConfig(config(), host), []);
  });
  it('does not enable development crons', () => assert.equal(config().triggers, undefined));
  for (const value of ['http://localhost:8787', 'https://example.com', 'https://user:pass@cybershop.ng', 'https://cybershop.ng/path', 'https://cybershop.ng/#fragment']) {
    it(`rejects invalid live origin ${value}`, () => assert.equal(httpsOrigin(value), null));
  }
});

describe('readiness and exact-release assertions', () => {
  const ready = () => ({ ok: true, service: 'cybershop-api', config: { ok: true, production: true }, database: true, release: 'abc' });
  it('accepts exact ready release', () => assert.doesNotThrow(() => assertReadiness(ready(), 'abc')));
  it('rejects top-level-only health success', () => assert.throws(() => assertReadiness({ ok: true }, 'abc')));
  it('rejects wrong release', () => assert.throws(() => assertReadiness(ready(), 'other')));
  for (const change of [{ database: false }, { config: { ok: false, production: true } }, { config: { ok: true, production: false } }, { service: 'other' }]) {
    it(`fails closed for ${JSON.stringify(change)}`, () => assert.throws(() => assertReadiness({ ...ready(), ...change }, 'abc')));
  }
});

describe('deployment safety source invariants', () => {
  const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/deploy-backend.yml', import.meta.url)), 'utf8');
  it('gates production on reusable exact-commit CI', () => {
    assert.match(workflow, /uses: \.\/\.github\/workflows\/ci.yml/);
    assert.match(workflow, /needs: checks/);
    assert.match(workflow, /environment: production/);
  });
  it('never invokes unqualified remote migration or deploy', () => {
    for (const line of workflow.split('\n').filter((line) => /npx wrangler (deploy|d1 .*--remote)/.test(line))) assert.match(line, /--env production/);
  });
  it('saves encrypted backup before migrations', () => {
    assert.ok(workflow.indexOf('actions/upload-artifact') < workflow.indexOf('name: Apply production migrations'));
    assert.match(workflow, /-pass env:D1_BACKUP_PASSPHRASE/);
    assert.match(workflow, /EXPECTED_RELEASE_SHA/);
  });
});
