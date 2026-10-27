import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = path.resolve(web, '../worker');
const wrangler = path.join(worker, 'node_modules/wrangler/bin/wrangler.js');
const next = path.join(web, 'node_modules/next/dist/bin/next');
const children = new Set();
let state;
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const owned = [...children];
  for (const child of owned) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Owned group exited. */ } }
  await Promise.all(owned.map((child) => child.exitCode !== null || child.signalCode !== null ? undefined : new Promise((resolve) => {
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} resolve(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  })));
  if (state) rmSync(state, { recursive: true, force: true });
  process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void shutdown());
function launch(args, cwd, env = process.env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', detached: true });
  children.add(child);
  child.once('error', () => void shutdown(1));
  child.once('exit', (code) => { children.delete(child); if (code && !stopping) void shutdown(code); });
  return child;
}
async function waitFor(url, child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned E2E service exited');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('E2E service startup timed out');
}
async function assertFree(port) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
try {
  await assertFree(3011);
  await assertFree(8791);
  mkdirSync(path.join(web, '.e2e-state'), { recursive: true });
  state = mkdtempSync(path.join(web, '.e2e-state/run-'));
  const config = path.join(state, 'wrangler.json');
  const persist = path.join(state, 'data');
  writeFileSync(config, JSON.stringify({
    name: 'cybershop-browser-test', main: path.join(worker, 'src/index.ts'),
    compatibility_date: '2025-06-01', compatibility_flags: ['nodejs_compat'],
    d1_databases: [{ binding: 'DB', database_name: 'cybershop-browser-test', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: path.join(worker, 'migrations') }],
    vars: {
      APP_ENV: 'development', AUTH_SECRET: 'browser-auth-0123456789abcdef', INTERNAL_SECRET: 'browser-internal-0123456789abcdef',
      GATEWAY_SECRET: 'browser-gateway-0123456789abcdef', IP_SALT: 'browser-ip-salt-0123456789abcdef',
      APP_URL: 'http://127.0.0.1:3011', WEB_ORIGIN: 'http://127.0.0.1:3011', SESSION_SECURE: '0',
      MEDIA_DRIVER: 'd1', MEDIA_BASE_URL: 'http://127.0.0.1:3011', GATEWAY_PUBLIC_URL: 'http://127.0.0.1:8081',
      PAYSTACK_MOCK: '1', PAYSTACK_PUBLIC_KEY: 'pk_test_browser_synthetic', PAYSTACK_SECRET_KEY: 'sk_test_browser_synthetic',
      PAYSTACK_WEBHOOK_URL: 'http://127.0.0.1:8791/api/webhooks/paystack',
      SEED_ADMIN_EMAIL: 'admin@browser.test', SEED_ADMIN_PASSWORD: 'BrowserAdmin123',
    },
  }));
  const migration = launch([wrangler, 'd1', 'migrations', 'apply', 'cybershop-browser-test', '--local', '--config', config, '--persist-to', persist], state);
  await new Promise((resolve, reject) => migration.once('exit', (code) => code === 0 ? resolve() : reject(new Error('E2E migration failed'))));
  const backend = launch([wrangler, 'dev', '--config', config, '--persist-to', persist, '--ip', '0.0.0.0', '--port', '8791'], state);
  await waitFor('http://127.0.0.1:8791/healthz', backend);
  const env = { ...process.env, WORKER_URL: 'http://127.0.0.1:8791', WORKER_INTERNAL_SECRET: 'browser-internal-0123456789abcdef', SITE_URL: 'http://127.0.0.1:3011', NEXT_TELEMETRY_DISABLED: '1' };
  const build = launch([next, 'build'], web, env);
  await new Promise((resolve, reject) => build.once('exit', (code) => code === 0 ? resolve() : reject(new Error('E2E build failed'))));
  launch([next, 'start', '-H', '0.0.0.0', '-p', '3011'], web, env);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E startup failed');
  await shutdown(1);
}
