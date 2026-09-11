import { beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Integration test harness: applies migrations to a throwaway local-D1 state
 * directory, boots an isolated `wrangler dev` on its own port, and tears it
 * down after the suite. Tests drive it with plain fetch() — exercising the real
 * runtime, D1, migrations and middleware (no mocking of the request path).
 */

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_DIR = path.join(WORKER_DIR, '.vitest-state');

let proc: ChildProcess | null = null;
let workerLog = '';
let internalSecret = 'test-internal-secret';
let seederEmail = 'admin@test.ng';
let seederPassword = 'AdminPass123';

/** Kill any process currently listening on `port` (leftovers from crashed runs). */
function killPortListeners(port: number): void {
  let out = '';
  try {
    out = execFileSync('ss', ['-tlnp'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch {
    return; // ss unavailable — nothing we can do
  }
  const pids = new Set<string>();
  for (const line of out.split('\n')) {
    if (!line.includes(`:${port} `)) continue;
    for (const m of line.matchAll(/pid=(\d+)/g)) pids.add(m[1]);
  }
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

async function waitForPortFree(port: number, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (!isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function isPortOpen(port: number): Promise<boolean> {
  try {
    const s = await fetch(`http://127.0.0.1:${port}/__port_probe__`);
    s.body?.cancel();
    return true; // got an HTTP response → something is listening
  } catch {
    return false; // connection refused → free
  }
}

async function waitFor(url: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}\n--- worker log tail ---\n${workerLog.slice(-3000)}`);
}

export async function startWorker(): Promise<void> {
  // 0. make sure the port is actually free (a previous run may have leaked the
  //    workerd child even after its wrangler parent was killed)
  killPortListeners(PORT);
  await waitForPortFree(PORT);
  // 1. migrate the isolated state (no worker running → no SQLite lock fights)
  rmSync(STATE_DIR, { recursive: true, force: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'cybershop', '--local', '--persist-to', STATE_DIR], {
    cwd: WORKER_DIR,
    stdio: 'pipe',
  });
  // 2. boot the worker against the migrated state (detached → we can kill the
  //    whole process group, since wrangler spawns workerd as a grandchild)
  proc = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', STATE_DIR], {
    cwd: WORKER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: true,
  });
  workerLog = '';
  proc.stdout?.on('data', (d: Buffer) => (workerLog += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (workerLog += d.toString()));
  const exitedEarly = new Promise<number | null>((resolve) => {
    proc?.once('exit', (code) => resolve(code));
  });
  try {
    await Promise.race([waitFor(`${BASE}/healthz`), exitedEarly.then((code) => {
      throw new Error(`Worker exited during startup (code ${code})\n--- log tail ---\n${workerLog.slice(-3000)}`);
    })]);
  } catch (e) {
    await stopWorker();
    throw e;
  }
}

export async function stopWorker(): Promise<void> {
  if (proc && proc.pid) {
    // kill the whole process group (wrangler + workerd grandchildren)
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
    proc = null;
  }
  // belt and braces: anything still holding the port (e.g. a respawning
  // workerd) gets reaped before the state dir goes away
  for (let i = 0; i < 4; i++) {
    killPortListeners(PORT);
    await new Promise((r) => setTimeout(r, 300));
  }
  await waitForPortFree(PORT);
  rmSync(STATE_DIR, { recursive: true, force: true });
}

export function setupIntegration(): void {
  beforeAll(async () => {
    const devVars = path.join(WORKER_DIR, '.dev.vars');
    if (existsSync(devVars)) {
      for (const l of readFileSync(devVars, 'utf8').split('\n')) {
        if (l.startsWith('INTERNAL_SECRET=')) internalSecret = l.split('=')[1]?.trim() || internalSecret;
        if (l.startsWith('SEED_ADMIN_EMAIL=')) seederEmail = l.split('=')[1]?.trim() || seederEmail;
        if (l.startsWith('SEED_ADMIN_PASSWORD=')) seederPassword = l.split('=')[1]?.trim() || seederPassword;
      }
    }
    await startWorker();
  }, 180000);
  afterAll(async () => {
    await stopWorker();
  }, 30000);
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
  const res = await fetch(`${BASE}${pathAndQuery}`, {
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

export const BASE_URL = BASE;
