#!/usr/bin/env node
import { httpsOrigin, assertReadiness } from './lib/release.mjs';

try {
  const origin = httpsOrigin(process.env.PRODUCTION_WORKER_URL);
  if (!origin) throw new Error('PRODUCTION_WORKER_URL must be a public HTTPS origin');
  const response = await fetch(`${origin}/readyz`, { signal: AbortSignal.timeout(15_000), redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error(`Readiness returned HTTP ${response.status}`);
  assertReadiness(await response.json(), process.env.EXPECTED_RELEASE_SHA);
  console.log('Production configuration, database and release readiness passed');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Readiness check failed');
  process.exitCode = 1;
}
