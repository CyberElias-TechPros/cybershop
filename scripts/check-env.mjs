#!/usr/bin/env node
/**
 * CyberShop preflight — "is everything ready to go live?"
 *
 * Run before a deploy. It checks the three places configuration lives (the Vercel
 * web env, the Worker's local .dev.vars, and the Worker's production vars in
 * wrangler.jsonc) and prints exactly what is missing — including the copy-paste
 * command to set each missing Worker secret.
 *
 *   node scripts/check-env.mjs            # check everything
 *   node scripts/check-env.mjs --local    # local dev only
 *   node scripts/check-env.mjs --strict   # exit 1 on warnings too (CI)
 *
 * It never prints a secret's value.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const localOnly = args.has('--local');
const strict = args.has('--strict');

const C = {
  red: (s) => `[31m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
  bold: (s) => `[1m${s}[0m`,
};

const errors = [];
const warnings = [];
const missingSecrets = [];

function fail(where, msg) { errors.push(`${where}: ${msg}`); }
function warn(where, msg) { warnings.push(`${where}: ${msg}`); }

/** Read a .dev.vars / .env style file into a map (ignores comments + blanks). */
function readEnvFile(file) {
  const out = new Map();
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    out.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return out;
}

/** Pull the "vars" object out of wrangler.jsonc (tolerate // comments). */
function readWranglerVars(file) {
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const stripComments = raw.replace(/^\s*\/\/.*$/gm, '');
  const grab = (key) => {
    const at = stripComments.indexOf(`"${key}"`);
    if (at < 0) return null;
    // walk forward to the matching brace of that object
    let i = stripComments.indexOf('{', at);
    if (i < 0) return null;
    let depth = 0;
    for (let j = i; j < stripComments.length; j++) {
      if (stripComments[j] === '{') depth++;
      else if (stripComments[j] === '}') {
        depth--;
        if (depth === 0) return JSON.parse(stripComments.slice(i, j + 1));
      }
    }
    return null;
  };
  return { root: grab('vars'), production: grab('production') };
}

// Values that are fine on a laptop and fatal in production.
const DEV_DEFAULTS = /^(dev-only-|test-|changeme|change-me|localhost|http:\/\/)/i;
const PLACEHOLDER = /^(your|xxx|sk_test_xxxxxxxx|pk_test_xxxxxxxx|<)/i;

function looksPlaceholder(v) {
  return !v || PLACEHOLDER.test(v) || v.length < 8;
}
function isDevDefault(v) {
  return DEV_DEFAULTS.test(v);
}

// ---------------------------------------------------------------- 1. web (Vercel)
console.log(C.bold('\n— Web (Vercel) —'));
const webExample = path.join(ROOT, 'web', '.env.local.example');
const webLocal = path.join(ROOT, 'web', '.env.local');
const webProd = readEnvFile(path.join(ROOT, 'web', '.env.production'));
const requiredWeb = ['WORKER_URL', 'WORKER_INTERNAL_SECRET', 'SITE_URL'];
const exampleKeys = [...readEnvFile(webExample).keys()];
const webValues = new Map([...webProd]);
if (existsSync(webLocal)) for (const [k, v] of readEnvFile(webLocal)) if (!webValues.has(k)) webValues.set(k, v);

for (const key of requiredWeb.length ? requiredWeb : exampleKeys) {
  const v = webValues.get(key);
  if (!v) {
    fail('web', `${key} is not set anywhere (Vercel → Settings → Environment Variables)`);
    continue;
  }
  if (looksPlaceholder(v)) fail('web', `${key} is still a placeholder`);
  else if (isDevDefault(v)) warn('web', `${key} is a local development value — set the real one in Vercel → Settings → Environment Variables`);
  else if (!/^https?:\/\//.test(v) && /URL$/.test(key)) fail('web', `${key} must be an absolute URL`);
}
if (webValues.get('SITE_URL')?.startsWith('http://') && !localOnly) {
  warn('web', 'SITE_URL is http:// — production must be https:// (it drives canonical URLs and OG tags)');
}
if (existsSync(webLocal) && !localOnly) {
  console.log(C.dim('  (reading web/.env.local — production reads Vercel env vars, not this file)'));
}
console.log(webValues.size ? `  ${webValues.size} web variable(s) found` : C.red('  no web environment found'));

// ------------------------------------------------------- 2. worker (production)
console.log(C.bold('\n— Worker (Cloudflare) —'));
const w = readWranglerVars(path.join(ROOT, 'worker', 'wrangler.jsonc'));
const prodVars = w.production?.vars ?? {};
const devVars = readEnvFile(path.join(ROOT, 'worker', '.dev.vars'));

/** Every secret that must exist as a `wrangler secret` in production. */
const SECRETS = [
  { key: 'AUTH_SECRET', how: 'openssl rand -hex 32', why: 'signs session tokens' },
  { key: 'INTERNAL_SECRET', how: 'openssl rand -hex 32', why: 'proves a request came from the Next.js proxy' },
  { key: 'GATEWAY_SECRET', how: 'openssl rand -hex 32', why: 'signs media upload tokens (gateway driver)' },
  { key: 'IP_SALT', how: 'openssl rand -hex 32', why: 'hashes visitor IPs so they are never stored raw' },
  { key: 'PAYSTACK_SECRET_KEY', how: 'Paystack → Settings → API Keys (sk_live_…)', why: 'charges cards and verifies payments' },
  { key: 'PAYSTACK_PUBLIC_KEY', how: 'Paystack → Settings → API Keys (pk_live_…)', why: 'Paystack inline checkout' },
];
const OPTIONAL_SECRETS = [
  { key: 'RESEND_API_KEY', how: 'resend.com → API Keys', why: 'transactional email (verification, resets, lead alerts)' },
  { key: 'MAIL_FROM', how: 'a verified sending domain, e.g. "CyberShop <noreply@cybershop.ng>"', why: 'from-address on outgoing mail' },
  { key: 'VERCEL_TOKEN', how: 'vercel.com/account/tokens', why: 'attaches vendor custom domains automatically' },
  { key: 'VERCEL_PROJECT_ID', how: 'Vercel project settings', why: 'custom domains' },
  { key: 'SEED_ADMIN_EMAIL', how: 'your admin email', why: 'creates the first admin on first boot (unset it afterwards)' },
  { key: 'SEED_ADMIN_PASSWORD', how: 'a strong password', why: 'first admin password (unset after the first boot)' },
];

const REQUIRED_PROD_VARS = ['APP_URL', 'WEB_ORIGIN', 'SESSION_SECURE', 'MEDIA_DRIVER', 'PAYSTACK_MOCK'];

if (!localOnly) {
  for (const key of REQUIRED_PROD_VARS) {
    const v = prodVars[key];
    if (v === undefined) fail('worker/production', `env.production.vars.${key} is missing from wrangler.jsonc`);
  }
  if (prodVars.SESSION_SECURE !== '1') fail('worker/production', 'SESSION_SECURE must be "1" — otherwise session cookies are sent over http');
  if (prodVars.PAYSTACK_MOCK === '1') fail('worker/production', 'PAYSTACK_MOCK=1 in production — no customer will ever actually be charged');
  for (const key of ['APP_URL', 'WEB_ORIGIN']) {
    const v = prodVars[key];
    if (v && !v.startsWith('https://')) fail('worker/production', `${key} must be https://`);
    if (v && /shop\.freegameplay\.site|localhost/.test(v)) fail('worker/production', `${key} still points at a placeholder host (${v})`);
  }
  if (prodVars.APP_URL && prodVars.WEB_ORIGIN && prodVars.APP_URL.replace(/\/$/, '') !== prodVars.WEB_ORIGIN.replace(/\/$/, '')) {
    warn('worker/production', 'APP_URL and WEB_ORIGIN differ — emails and the sitemap use APP_URL');
  }
  if (prodVars.MEDIA_DRIVER === 'gateway') {
    for (const key of ['MEDIA_BASE_URL', 'GATEWAY_PUBLIC_URL']) {
      const v = prodVars[key];
      if (v && !v.startsWith('https://')) fail('worker/production', `${key} must be https:// when MEDIA_DRIVER=gateway`);
    }
  }
  const hook = prodVars.PAYSTACK_WEBHOOK_URL || '';
  if (!hook) fail('worker/production', 'PAYSTACK_WEBHOOK_URL is unset');
  else if (/your-subdomain|localhost/.test(hook)) fail('worker/production', `PAYSTACK_WEBHOOK_URL still has a placeholder: ${hook}`);
  else if (!hook.startsWith('https://')) fail('worker/production', 'PAYSTACK_WEBHOOK_URL must be https:// — Paystack will not POST to http');

  console.log('  secrets to set (never stored in git):');
  for (const s of [...SECRETS, ...OPTIONAL_SECRETS]) {
    const isOptional = OPTIONAL_SECRETS.includes(s);
    if (!isOptional) missingSecrets.push(s);
    console.log(`    ${isOptional ? C.dim('(optional)') : '          '} ${s.key.padEnd(22)} ${C.dim(s.why)}`);
  }
}

// ------------------------------------------------------------ 3. local dev vars
console.log(C.bold('\n— Local development —'));
if (!existsSync(path.join(ROOT, 'worker', '.dev.vars'))) {
  warn('worker', 'no .dev.vars — run ./scripts/bootstrap-dev.sh');
} else {
  const need = ['AUTH_SECRET', 'INTERNAL_SECRET', 'GATEWAY_SECRET', 'IP_SALT', 'APP_URL', 'MEDIA_DRIVER'];
  for (const k of need) if (!devVars.get(k)) warn('worker/.dev.vars', `${k} is unset`);
  console.log(`  ${devVars.size} variable(s) in worker/.dev.vars`);
}
if (!existsSync(path.join(ROOT, 'web', '.env.local'))) warn('web', 'no .env.local — run ./scripts/bootstrap-dev.sh');
if (!existsSync(path.join(ROOT, 'worker', 'node_modules'))) warn('worker', 'dependencies not installed — run (cd worker && npm install)');

// --------------------------------------------------------------------- report
console.log(C.bold('\n— Result —'));
if (errors.length === 0 && warnings.length === 0) console.log(C.green('  ✓ everything checks out.'));
for (const e of errors) console.log(C.red(`  ✗ ${e}`));
for (const wmsg of warnings) console.log(C.yellow(`  ! ${wmsg}`));

if (missingSecrets.length && !localOnly) {
  console.log(C.bold('\n— Set the production secrets (run each once) —'));
  console.log(C.dim('  cd worker'));
  for (const s of missingSecrets) {
    console.log(`  npx wrangler secret put ${s.key} --env production   ${C.dim(`# ${s.how}`)}`);
  }
  console.log(C.dim('\n  Then: npx wrangler deploy --env production'));
  console.log(C.dim('  And:  npx wrangler d1 migrations apply cybershop --remote'));
}

const bad = errors.length > 0 || (strict && warnings.length > 0);
console.log('');
process.exit(bad ? 1 : 0);
