import type { Env } from '../config';

export interface EnvReport {
  ok: boolean;
  missing: string[];
  unsafe: string[];
  warnings: string[];
  production: boolean;
}

const weak = (value: string) => value.length < 24 || /^(dev-only-|test-|change-?me|secret$)/i.test(value);

/** Strict URL parsing; prefix checks alone accept credentials and placeholder hosts. */
export function isPublicHttps(value: string | undefined, originOnly = false): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash &&
      !/[<>\s]/.test(value) && !/(localhost|your-subdomain|example\.(com|org)|^127\.|^0\.0\.0\.0$|^\[::1\]$)/i.test(u.hostname) &&
      (!originOnly || (u.pathname === '/' && !u.search));
  } catch { return false; }
}

/** HTTPS origins also trigger live safeguards: insecure cookies cannot disguise a live deployment. */
export function isProduction(env: Env): boolean {
  return env.APP_ENV === 'production' || (env.APP_ENV !== 'staging' &&
    (env.SESSION_SECURE === '1' || /^https:/i.test(env.APP_URL || '')));
}

/** Reports setting names only, never credentials or environment values. */
export function checkEnv(env: Env): EnvReport {
  const missing: string[] = [];
  const unsafe: string[] = [];
  const warnings: string[] = [];
  const production = isProduction(env);
  const hosted = production || env.APP_ENV === 'staging';
  const require = (key: keyof Env) => {
    if (!env[key]) missing.push(key);
  };
  for (const key of ['AUTH_SECRET', 'INTERNAL_SECRET', 'IP_SALT', 'APP_URL', 'WEB_ORIGIN', 'MEDIA_DRIVER'] as const) require(key);
  if (env.MEDIA_DRIVER !== 'd1' && env.MEDIA_DRIVER !== 'gateway') unsafe.push('MEDIA_DRIVER (unsupported driver)');
  for (const key of ['AUTH_SECRET', 'INTERNAL_SECRET', 'IP_SALT'] as const) {
    if (env[key] && weak(env[key])) unsafe.push(`${key} (weak or development value)`);
  }
  if (env.MEDIA_DRIVER === 'gateway') {
    for (const key of ['GATEWAY_SECRET', 'GATEWAY_PUBLIC_URL', 'MEDIA_BASE_URL'] as const) require(key);
    if (env.GATEWAY_SECRET && weak(env.GATEWAY_SECRET)) unsafe.push('GATEWAY_SECRET (weak or development value)');
  }
  if (env.APP_ENV && !['development', 'staging', 'production'].includes(env.APP_ENV)) unsafe.push('APP_ENV (unsupported environment)');
  if (hosted) {
    if (production && env.APP_ENV !== 'production') unsafe.push('APP_ENV (explicit production profile required)');
    if (env.SESSION_SECURE !== '1') unsafe.push('SESSION_SECURE (must be 1 on hosted environments)');
    for (const key of ['APP_URL', 'WEB_ORIGIN'] as const) {
      if (!isPublicHttps(env[key], true)) unsafe.push(`${key} (must be a public HTTPS origin)`);
    }
    if (env.APP_URL?.replace(/\/$/, '') !== env.WEB_ORIGIN?.replace(/\/$/, '')) unsafe.push('APP_URL / WEB_ORIGIN (origin mismatch)');
    for (const key of ['MEDIA_BASE_URL', ...(env.MEDIA_DRIVER === 'gateway' ? ['GATEWAY_PUBLIC_URL'] as const : [])] as const) {
      if (!isPublicHttps(env[key])) unsafe.push(`${key} (must be public HTTPS)`);
    }
    if (env.PAYSTACK_MOCK !== '0') unsafe.push('PAYSTACK_MOCK (must explicitly be 0 on hosted environments)');
    for (const key of ['PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_WEBHOOK_URL'] as const) require(key);
    const mode = production ? 'live' : 'test';
    if (env.PAYSTACK_SECRET_KEY && !env.PAYSTACK_SECRET_KEY.startsWith(`sk_${mode}_`)) unsafe.push(`PAYSTACK_SECRET_KEY (expected ${mode} key)`);
    if (env.PAYSTACK_PUBLIC_KEY && !env.PAYSTACK_PUBLIC_KEY.startsWith(`pk_${mode}_`)) unsafe.push(`PAYSTACK_PUBLIC_KEY (expected ${mode} key)`);
    if (!isPublicHttps(env.PAYSTACK_WEBHOOK_URL) || !env.PAYSTACK_WEBHOOK_URL.endsWith('/api/webhooks/paystack')) unsafe.push('PAYSTACK_WEBHOOK_URL (invalid HTTPS callback)');
    if (!env.RESEND_API_KEY && !env.MAIL_ENDPOINT) missing.push('RESEND_API_KEY or MAIL_ENDPOINT');
    if (env.MAIL_ENDPOINT && !isPublicHttps(env.MAIL_ENDPOINT)) unsafe.push('MAIL_ENDPOINT (must be public HTTPS)');
    require('MAIL_FROM');
    require('MAIL_OUTBOX_KEY');
    if (env.MAIL_OUTBOX_KEY && weak(env.MAIL_OUTBOX_KEY)) unsafe.push('MAIL_OUTBOX_KEY (weak or development value)');
    if (production && env.REQUIRE_ADMIN_2FA !== '1') unsafe.push('REQUIRE_ADMIN_2FA (must be 1 in production)');
  }
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) warnings.push('SEED_ADMIN_* unset (expected after initial administrator bootstrap)');
  return { ok: !missing.length && !unsafe.length, missing, unsafe, warnings, production };
}

let reported = false;
export function reportEnv(env: Env): EnvReport {
  const r = checkEnv(env);
  if (!reported) {
    reported = true;
    if (!r.ok) console.error('[config] unsafe configuration', { missing: r.missing, unsafe: r.unsafe });
    for (const warning of r.warnings) console.warn('[config]', warning);
  }
  return r;
}
