import { readFileSync } from 'node:fs';

/** Strip JSONC comments without corrupting https:// strings. Unsupported syntax fails closed. */
export function readJsonc(file) {
  const text = readFileSync(file, 'utf8');
  let clean = '', quoted = false, escaped = false, line = false, block = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (line) { if (c === '\n') { line = false; clean += c; } continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } else if (c === '\n') clean += c; continue; }
    if (quoted) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; clean += c; }
    else if (c === '/' && next === '/') { line = true; clean += ' '; i++; }
    else if (c === '/' && next === '*') { block = true; clean += ' '; i++; }
    else clean += c;
  }
  if (block || quoted) throw new Error('Unterminated configuration string/comment');
  return JSON.parse(clean);
}

export function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        /[<>\s]/.test(value) || /localhost|your-subdomain|example\.(com|org)|^127\.|^0\.0\.0\.0$|^\[::1\]$/i.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export function checkProductionConfig(config, workerUrl, secretNames) {
  const errors = [];
  const production = config.env?.production;
  const vars = production?.vars || {};
  const exact = { APP_ENV: 'production', SESSION_SECURE: '1', PAYSTACK_MOCK: '0', REQUIRE_ADMIN_2FA: '1', BUYER_DEPOSITS_ENABLED: '0' };
  for (const [key, value] of Object.entries(exact)) if (vars[key] !== value) errors.push(`${key} must explicitly be ${value}`);
  const app = httpsOrigin(vars.APP_URL), origin = httpsOrigin(vars.WEB_ORIGIN);
  if (!app || app !== origin) errors.push('APP_URL and WEB_ORIGIN must be the same public HTTPS origin');
  if (!httpsOrigin(vars.MEDIA_BASE_URL)) errors.push('MEDIA_BASE_URL must be a public HTTPS origin');
  if (!['d1', 'gateway'].includes(vars.MEDIA_DRIVER)) errors.push('MEDIA_DRIVER is invalid');
  if (vars.MEDIA_DRIVER === 'gateway' && !httpsOrigin(vars.GATEWAY_PUBLIC_URL)) errors.push('Gateway origin is invalid');
  const worker = httpsOrigin(workerUrl);
  if (!worker) errors.push('PRODUCTION_WORKER_URL must be an explicit public HTTPS origin');
  if (worker && vars.PAYSTACK_WEBHOOK_URL !== `${worker}/api/webhooks/paystack`) errors.push('Paystack webhook must match PRODUCTION_WORKER_URL');
  const db = production?.d1_databases?.find((binding) => binding.binding === 'DB');
  if (!db || db.database_name !== 'cybershop' || !/^[0-9a-f-]{36}$/i.test(db.database_id || '') || /^0{8}-/.test(db.database_id)) errors.push('Production DB binding must explicitly identify the intended cybershop database');
  if (!production?.triggers?.crons?.includes('17 * * * *')) errors.push('Production hourly cron must be explicitly configured');
  if (!production?.triggers?.crons?.includes('*/2 * * * *')) errors.push('Production mail dispatch cron must be explicitly configured');
  if (secretNames) {
    const names = new Set(secretNames);
    for (const key of ['AUTH_SECRET', 'INTERNAL_SECRET', 'IP_SALT', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY', 'MAIL_FROM', 'MAIL_OUTBOX_KEY']) {
      if (!names.has(key)) errors.push(`Production secret missing: ${key}`);
    }
    if (!names.has('RESEND_API_KEY') && !names.has('MAIL_ENDPOINT')) errors.push('Production mail provider secret is missing');
    if (vars.MEDIA_DRIVER === 'gateway' && !names.has('GATEWAY_SECRET')) errors.push('Production GATEWAY_SECRET is missing');
  }
  return errors;
}

export function assertReadiness(body, expectedRelease) {
  if (body?.ok !== true || body?.service !== 'cybershop-api' || body?.config?.ok !== true ||
      body?.config?.production !== true || body?.database !== true || (expectedRelease && body?.release !== expectedRelease)) {
    // Deliberately do not dump response bodies into CI logs.
    throw new Error('Production readiness failed (configuration, environment, database or release mismatch)');
  }
}
