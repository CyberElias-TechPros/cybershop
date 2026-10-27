import { beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every suite owns its config, port, credentials and local D1 directory. Never
// read/write .dev.vars and never kill listeners belonging to another process.
const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRANGLER = path.join(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js');
let proc: ChildProcess | null = null;
let stateDir: string | null = null;
let workerLog = '';
export let BASE_URL = '';
const internalSecret = 'test-internal-secret';
const seederEmail = 'admin@test.ng';
const seederPassword = 'AdminPass123';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port allocated');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (proc?.exitCode !== null) throw new Error(`Test Worker exited\n${workerLog.slice(-3000)}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* Server may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for test Worker\n${workerLog.slice(-3000)}`);
}

type IntegrationOptions = { main?: string; vars?: Record<string, string>; beforeMigration?: { filename: string; sql: string } };

export async function startWorker(options: IntegrationOptions = {}): Promise<void> {
  const root = path.join(WORKER_DIR, '.vitest-state');
  mkdirSync(root, { recursive: true });
  stateDir = mkdtempSync(path.join(root, 'suite-'));
  const port = await freePort();
  BASE_URL = `http://127.0.0.1:${port}`;
  const config = path.join(stateDir, 'wrangler.json');
  const sourceMigrations = path.join(WORKER_DIR, 'migrations');
  const migrationFiles = readdirSync(sourceMigrations).filter((f) => f.endsWith('.sql')).sort();
  const migrationsDir = options.beforeMigration ? path.join(stateDir, 'migrations') : sourceMigrations;
  if (options.beforeMigration) {
    if (!migrationFiles.includes(options.beforeMigration.filename)) throw new Error('Unknown fixture migration boundary');
    mkdirSync(migrationsDir);
    for (const file of migrationFiles.filter((f) => f < options.beforeMigration!.filename)) copyFileSync(path.join(sourceMigrations,file),path.join(migrationsDir,file));
  }
  writeFileSync(config, JSON.stringify({
    name: 'cybershop-integration-test',
    main: path.join(WORKER_DIR, options.main ?? 'src/index.ts'),
    compatibility_date: '2025-06-01', compatibility_flags: ['nodejs_compat'],
    d1_databases: [{ binding: 'DB', database_name: 'cybershop-test',
      database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: migrationsDir }],
    vars: {
      APP_ENV: 'development', AUTH_SECRET: 'test-auth-secret-0123456789abcdef',
      INTERNAL_SECRET: internalSecret, GATEWAY_SECRET: 'test-gateway-secret-0123456789abcdef',
      APP_URL: 'http://localhost:3000', WEB_ORIGIN: 'http://localhost:3000', SESSION_SECURE: '0',
      IP_SALT: 'test-ip-salt', MEDIA_DRIVER: 'd1', MEDIA_BASE_URL: 'http://localhost:3000',
      GATEWAY_PUBLIC_URL: 'http://localhost:8081', PAYSTACK_MOCK: '1',
      PAYSTACK_PUBLIC_KEY: 'pk_test_ci', PAYSTACK_SECRET_KEY: 'sk_test_ci',
      PAYSTACK_WEBHOOK_URL: `${BASE_URL}/api/webhooks/paystack`,
      SEED_ADMIN_EMAIL: seederEmail, SEED_ADMIN_PASSWORD: seederPassword,
      ...options.vars,
    },
  }));
  const persist = path.join(stateDir, 'data');
  workerLog = '';
  try {
    execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'cybershop-test',
      '--local', '--config', config, '--persist-to', persist], { cwd: stateDir, stdio: 'pipe' });
    if (options.beforeMigration) {
      const fixture = path.join(stateDir,'legacy.sql');
      writeFileSync(fixture,options.beforeMigration.sql);
      execFileSync(process.execPath,[WRANGLER,'d1','execute','cybershop-test','--local','--config',config,'--persist-to',persist,'--file',fixture],{cwd:stateDir,stdio:'pipe'});
      for (const file of migrationFiles.filter((f) => f >= options.beforeMigration!.filename)) copyFileSync(path.join(sourceMigrations,file),path.join(migrationsDir,file));
      execFileSync(process.execPath,[WRANGLER,'d1','migrations','apply','cybershop-test','--local','--config',config,'--persist-to',persist],{cwd:stateDir,stdio:'pipe'});
    }
    proc = spawn(process.execPath, [WRANGLER, 'dev', '--config', config, '--port', String(port),
      '--ip', '127.0.0.1', '--persist-to', persist], {
      cwd: stateDir, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    proc.stdout?.on('data', (d: Buffer) => { workerLog = (workerLog + d.toString()).slice(-10000); });
    proc.stderr?.on('data', (d: Buffer) => { workerLog = (workerLog + d.toString()).slice(-10000); });
    await waitFor(`${BASE_URL}/healthz`);
  } catch (error) {
    await stopWorker();
    throw error;
  }
}

export async function stopWorker(): Promise<void> {
  const owned = proc;
  proc = null;
  if (owned?.pid) {
    // Kill only the process group we started (wrangler + workerd descendants).
    try { process.kill(-owned.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    if (owned.exitCode === null && owned.signalCode === null) {
      await new Promise<void>((resolve) => owned.once('exit', () => resolve()));
    }
  }
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
  stateDir = null;
}

export function setupIntegration(options: IntegrationOptions = {}): void {
  beforeAll(() => startWorker(options), 180000);
  afterAll(stopWorker, 30000);
}

let ipCounter = 0;

/** Call the API. Adds the internal secret + a unique source IP unless overridden. */
export async function api(
  pathAndQuery: string,
  opts: { method?: string; body?: unknown; form?: FormData; cookie?: string; ip?: string; authed?: boolean } = {}
): Promise<{ status: number; json: any; cookie?: string; text?: string }> {
  const h: Record<string, string> = {};
  if (opts.authed !== false) h['x-internal-secret'] = internalSecret;
  if (opts.body !== undefined) h['content-type'] = 'application/json';
  if (opts.cookie) h['cookie'] = opts.cookie;
  h['x-forwarded-for'] = opts.ip || `10.9.${(ipCounter++ % 250)}.${10 + (ipCounter % 240)}`;
  const res = await fetch(`${BASE_URL}${pathAndQuery}`, {
    method: opts.method || 'GET',
    headers: h,
    body: opts.form ? opts.form : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : undefined;
  return { status: res.status, json, cookie, text };
}

export function adminLoginBody() {
  return { email: seederEmail, password: seederPassword };
}

/** Synthetic gateway response for Worker-only contract tests, never production. */
export function syntheticMediaReceipt(body: Record<string, any>): string {
  let token: any = {};
  try { token = JSON.parse(Buffer.from(String(body.token).split('.')[0], 'base64url').toString()); } catch { /* testing malformed tokens */ }
  const data = { v: 1, t: token.t, b: token.b, key: body.storage_key, mime: body.mime, size: body.size,
    width: body.width ?? 10, height: body.height ?? 10, sha256: 'a'.repeat(64), expires_at: token.e };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return encoded+'.'+createHmac('sha256','test-gateway-secret-0123456789abcdef').update(`media-receipt.v1:${encoded}`).digest('hex');
}
