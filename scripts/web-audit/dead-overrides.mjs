#!/usr/bin/env node
/**
 * dead-overrides.mjs — find responsive overrides that can never win.
 *
 * Reports every declaration inside an @media block whose (selector, property)
 * pair is re-declared *later* by a top-level rule. Because a media query adds
 * no specificity, source order decides: those overrides are dead code and the
 * element keeps its desktop value on phones.
 *
 * Usage (sources):
 *   node scripts/web-audit/dead-overrides.mjs web/app/globals.css web/app/cine.css
 *
 * Usage (what the browser actually sees — concatenate in <link> order):
 *   H=http://localhost:3000
 *   curl -s $H | grep -o '/_next/static/css/[^"?]*' | sort -u |
 *     while read -r c; do curl -s "$H$c"; echo; done > /tmp/app.css
 *   node scripts/web-audit/dead-overrides.mjs /tmp/app.css
 *
 * Exit code 1 when a *real* conflict is found (identical values are reported as
 * harmless — they usually just mean a rule is in the wrong place). CI-able.
 */
import fs from 'node:fs';
import { walkDeclarations } from './css-walk.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: dead-overrides.mjs <file.css> [...more.css]');
  process.exit(2);
}

const decls = [];
for (const file of files) {
  decls.push(...walkDeclarations(fs.readFileSync(file, 'utf8'), file));
}

// last top-level declaration per (selector, property)
const lastTop = new Map();
decls.forEach((d, idx) => {
  if (d.top) {
    for (const s of d.selectors) lastTop.set(`${s}|${d.prop}`, idx);
  }
});

const dead = [];
decls.forEach((d, idx) => {
  if (d.media.length === 0) return;
  for (const s of d.selectors) {
    const t = lastTop.get(`${s}|${d.prop}`);
    if (t !== undefined && t > idx) dead.push({ d, s, winner: decls[t] });
  }
});

console.log(`${dead.length} media override(s) beaten by a later top-level rule:`);
let real = 0;
for (const { d, s, winner } of dead) {
  const same = winner.value === d.value;
  if (!same) real++;
  console.log(
    `  ${d.file}:${d.line}  ${d.media.join(' & ')} → ${s} { ${d.prop}: ${d.value} }` +
      `  ✗ lost to ${winner.file}:${winner.line} "${winner.value}"${same ? '  (same value — harmless)' : ''}`
  );
}
process.exit(real > 0 ? 1 : 0);
