import chromium from '@sparticuz/chromium';
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

/** npm-packed Chromium avoids a second unpinned browser-CDN download. */
export default async function setup() {
  if (process.env.E2E_BROWSER_PATH) return;
  await chromium.executablePath();
  if (process.platform === 'linux') {
    // Minimal Debian sandboxes may lack NSS/NSPR. The pinned package includes
    // its own compatible libraries; do not mutate global OS dependencies.
    const require = createRequire(path.resolve('package.json'));
    const archive = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')), '../bin/al2023.tar.br');
    const support = path.join(os.tmpdir(), 'cybershop-browser-libs');
    mkdirSync(support, { recursive: true });
    execFileSync('tar', ['-x', '-C', support], { input: brotliDecompressSync(readFileSync(archive)) });
  }
}
