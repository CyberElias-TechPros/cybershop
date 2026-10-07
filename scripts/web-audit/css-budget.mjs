#!/usr/bin/env node
/**
 * Per-route CSS budget.
 *
 * Everything in app/layout.tsx — globals.css + cine.css + design-system.css —
 * is loaded by every route, including the vendor dashboard and the admin
 * console, which use almost none of it. That is the cost this script watches.
 *
 * It is a budget, not a lint: it will not tell you which rule to delete, only
 * that a route has crossed the line. Run it after a build.
 *
 *   node scripts/web-audit/css-budget.mjs web          # default 32 KB gzip
 *   CSS_BUDGET_KB=28 node scripts/web-audit/css-budget.mjs web
 *
 * Budget is on gzipped bytes, because that is what a visitor actually
 * downloads. Raw bytes flatter a file that is mostly repeated selectors.
 *
 * Note on splitting: importing a stylesheet from a nested layout or page does
 * NOT currently work in this app — Next emits the chunk and lists it in
 * app-build-manifest.json, but never emits the <link>, so the styles silently
 * do not apply. Verified on both a static route (/safety) and a dynamic one
 * (/admin). Until that changes, the only lever on this number is deleting or
 * shrinking rules, not moving them.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.argv[2] ?? 'web';
const manifestPath = join(root, '.next/app-build-manifest.json');
const budgetKb = Number(process.env.CSS_BUDGET_KB ?? 32);

if (!existsSync(manifestPath)) {
  console.error(`✗ ${manifestPath} not found — run \`npm run build\` first.`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`✗ could not read ${manifestPath}: ${e.message}`);
  process.exit(1);
}

const gzipSize = (file) => {
  try {
    return gzipSync(readFileSync(join(root, '.next', file)), { level: 9 }).length;
  } catch {
    return null;
  }
};

const routes = [];
for (const [route, files] of Object.entries(manifest.pages ?? {})) {
  const css = [...new Set((files ?? []).filter((f) => f.endsWith('.css')))];
  let total = 0;
  let missing = false;
  for (const f of css) {
    const n = gzipSize(f);
    if (n === null) missing = true;
    else total += n;
  }
  routes.push({ route, total, files: css, missing });
}

routes.sort((a, b) => b.total - a.total);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const budgetBytes = budgetKb * 1024;

const offenders = routes.filter((r) => r.total > budgetBytes);
const shared = routes[0]?.total ?? 0;

console.log(`CSS budget: ${budgetKb} KB gzip per route`);
console.log(`Routes measured: ${routes.length}`);
console.log(`Every route currently ships: ${kb(shared)} gzip\n`);

if (routes.length) {
  console.log('Heaviest routes:');
  for (const r of routes.slice(0, 5)) {
    const mark = r.total > budgetBytes ? '✗' : '✓';
    console.log(`  ${mark} ${kb(r.total).padStart(9)}  ${r.route}  (${r.files.length} file${r.files.length === 1 ? '' : 's'})`);
  }
}

const missingFiles = routes.filter((r) => r.missing);
if (missingFiles.length) {
  console.log(`\n⚠ ${missingFiles.length} route(s) reference CSS that is not on disk — was the build clean?`);
}

if (offenders.length) {
  console.error(`\n✗ ${offenders.length} route(s) over the ${budgetKb} KB budget:`);
  for (const r of offenders.slice(0, 20)) {
    console.error(`    ${kb(r.total).padStart(9)}  ${r.route}  (+${kb(r.total - budgetBytes)} over)`);
  }
  console.error(
    '\nThe dashboard and admin console load all of this and use little of it.\n' +
      'Reduce it (delete unused rules, tighten selectors) or raise CSS_BUDGET_KB\n' +
      'deliberately — but note the new number is now the floor, not the ceiling.',
  );
  process.exit(1);
}

console.log(`\n✓ every route is within the ${budgetKb} KB CSS budget`);
