import type { Env } from '../config';
import { paystackMock } from '../config';

/**
 * Configuration self-check.
 *
 * The brief for this app is "production ready, just add the keys" — so the one
 * thing that must never happen is a deployment that boots with a placeholder
 * secret and quietly half-works (sessions that anyone can forge, payments in
 * mock mode, media that 404s). This module turns that class of mistake into a
 * loud, specific message at boot and on /healthz.
 *
 * Deliberately coarse: it reports *which* setting is wrong, never its value.
 */

export interface EnvReport {
  ok: boolean;
  /** A required setting is missing entirely. */
  missing: string[];
  /** Present, but a known-unsafe value (a committed placeholder, http in prod). */
  unsafe: string[];
  /** Works, but not how you want to run a live marketplace. */
  warnings: string[];
  production: boolean;
}

const WEAK_SECRETS = new Set([
  'dev-only-change-me-0123456789abcdef',
  'dev-only-proxy-secret-0123456789abcdef',
  'dev-only-gateway-secret-0123456789abcdef',
  'change-me',
  'changeme',
  'secret',
  'test',
  'test-internal-secret',
  'test-auth-secret-0123456789abcdef',
  'test-gateway-secret-0123456789abcdef',
]);

function isWeakSecret(v: string | undefined): boolean {
  if (!v) return true;
  return v.length < 24 || WEAK_SECRETS.has(v) || v.startsWith('dev-only-') || v.startsWith('test-');
}

export function checkEnv(env: Env): EnvReport {
  const missing: string[] = [];
  const unsafe: string[] = [];
  const warnings: string[] = [];
  // SESSION_SECURE=1 is the production switch: it is what puts `Secure` on the
  // session cookie, so anything that ships without it is not a live deployment.
  const production = env.SESSION_SECURE === '1';

  const require = (name: keyof Env, label = name as string) => {
    const v = env[name];
    if (v === undefined || v === null || v === '') missing.push(label);
  };

  require('AUTH_SECRET');
  require('INTERNAL_SECRET');
  require('GATEWAY_SECRET');
  require('APP_URL');
  require('WEB_ORIGIN');
  require('IP_SALT');
  require('MEDIA_DRIVER');

  if (env.MEDIA_DRIVER === 'gateway') {
    require('GATEWAY_PUBLIC_URL');
    require('MEDIA_BASE_URL');
  }

  if (!isWeakSecret(env.AUTH_SECRET as string | undefined)) {
    /* fine */
  } else if (env.AUTH_SECRET) {
    unsafe.push('AUTH_SECRET (too short or a committed placeholder)');
  }
  if (!isWeakSecret(env.INTERNAL_SECRET as string | undefined)) {
    /* fine */
  } else if (env.INTERNAL_SECRET) {
    unsafe.push('INTERNAL_SECRET (too short or a committed placeholder)');
  }
  if (!isWeakSecret(env.GATEWAY_SECRET as string | undefined)) {
    /* fine */
  } else if (env.GATEWAY_SECRET && env.MEDIA_DRIVER === 'gateway') {
    unsafe.push('GATEWAY_SECRET (too short or a committed placeholder)');
  }
  if (!isWeakSecret(env.IP_SALT as string | undefined)) {
    /* fine */
  } else if (env.IP_SALT) {
    unsafe.push('IP_SALT (too short or a committed placeholder)');
  }

    if (production) {
      for (const name of ['APP_URL', 'WEB_ORIGIN'] as (keyof Env)[]) {
      const v = env[name] as string | undefined;
      if (v && !v.startsWith('https://')) unsafe.push(`${name as string} (must be https:// in production)`);
    }
    // APP_URL is the origin baked into emails, the sitemap and every WhatsApp
    // deep link. If it drifts from the site origin, links in the wild 404.
    if (env.APP_URL && env.WEB_ORIGIN && env.APP_URL.replace(/\/$/, '') !== env.WEB_ORIGIN.replace(/\/$/, '')) {
      warnings.push(`APP_URL (${env.APP_URL}) and WEB_ORIGIN (${env.WEB_ORIGIN}) differ — emails, the sitemap and shared links will point at APP_URL`);
    }
    if (env.MEDIA_DRIVER === 'gateway') {
      for (const name of ['MEDIA_BASE_URL', 'GATEWAY_PUBLIC_URL'] as (keyof Env)[]) {
        const v = env[name] as string | undefined;
        if (v && !v.startsWith('https://')) unsafe.push(`${name as string} (must be https:// in production)`);
      }
    }

    // Taking money is the point of the app — mock mode in production means
    // every checkout "succeeds" without a naira moving.
    if (paystackMock(env)) unsafe.push('PAYSTACK_MOCK=1 (no real payments will be taken)');
    else {
      require('PAYSTACK_SECRET_KEY');
      require('PAYSTACK_PUBLIC_KEY');
      const sk = env.PAYSTACK_SECRET_KEY;
      if (sk && !/^sk_(live|test)_/.test(sk)) unsafe.push('PAYSTACK_SECRET_KEY (expected sk_live_… or sk_test_…)');
      if (sk?.startsWith('sk_test_')) warnings.push('PAYSTACK_SECRET_KEY is a test key — switch to sk_live_… to take real payments');
      const hook = env.PAYSTACK_WEBHOOK_URL;
      if (hook && !hook.startsWith('https://')) unsafe.push('PAYSTACK_WEBHOOK_URL (must be https:// — Paystack will not POST to http)');
      if (!hook) warnings.push('PAYSTACK_WEBHOOK_URL is unset — set it to <worker>/api/webhooks/paystack in the Paystack dashboard');
    }

    if (!env.MAIL_ENDPOINT && !env.RESEND_API_KEY) {
      warnings.push('No mail provider configured — verification, password reset and lead emails will not be delivered');
    }
    if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
      warnings.push('SEED_ADMIN_* unset — fine once the first admin exists; required to create it');
    }
  } else if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    warnings.push('SEED_ADMIN_* unset — no admin account will be created on first boot');
  }

  return { ok: missing.length === 0 && unsafe.length === 0, missing, unsafe, warnings, production };
}

let reported = false;

/**
 * Log the report once per Worker instance. Never throws: a config warning must
 * not take a running deployment down — but in production it is logged at error
 * level so it shows up in `wrangler tail` and in alerts.
 */
export function reportEnv(env: Env): EnvReport {
  const r = checkEnv(env);
  if (reported) return r;
  reported = true;
  if (!r.ok) {
    const parts: string[] = [];
    if (r.missing.length) parts.push(`missing: ${r.missing.join(', ')}`);
    if (r.unsafe.length) parts.push(`unsafe: ${r.unsafe.join('; ')}`);
    console.error(`[config] ${r.production ? 'PRODUCTION' : 'development'} configuration is not safe — ${parts.join(' | ')}`);
  }
  for (const w of r.warnings) console.warn(`[config] ${w}`);
  return r;
}
