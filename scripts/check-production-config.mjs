#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonc, checkProductionConfig } from './lib/release.mjs';

try {
  const config = readJsonc(fileURLToPath(new URL('../worker/wrangler.jsonc', import.meta.url)));
  const index = process.argv.indexOf('--secrets-file');
  let names;
  if (index !== -1) {
    const secrets = JSON.parse(readFileSync(process.argv[index + 1], 'utf8'));
    if (!Array.isArray(secrets) || secrets.some((item) => typeof item?.name !== 'string')) throw new Error('Invalid secret-name inventory');
    names = secrets.map((item) => item.name);
  }
  const errors = checkProductionConfig(config, process.env.PRODUCTION_WORKER_URL, names);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Production configuration passed (${names ? 'secret names checked; values still require runtime readiness' : 'static checks only; secrets not inspected'})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Production configuration check failed');
  process.exitCode = 1;
}
