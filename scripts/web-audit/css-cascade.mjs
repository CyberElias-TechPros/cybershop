#!/usr/bin/env node
/**
 * css-cascade.mjs — print every declaration of one property for one selector,
 * in source order, with the at-rule context that wraps it.
 *
 * The last line is the winner (a media query adds no specificity, so an
 * override declared *before* the base rule silently loses — the bug class that
 * made this app's header stop being sticky and its phone-sized hero stage keep
 * a 560px layout height).
 *
 * Usage:
 *   node scripts/web-audit/css-cascade.mjs <file.css> <selector> [property]
 *   node scripts/web-audit/css-cascade.mjs web/app/cine.css .site-header position
 *
 * Works on the sources and on the compiled sheet. To check what the browser
 * really sees, concatenate the stylesheets in <link> order first:
 *
 *   H=http://localhost:3000
 *   curl -s $H | grep -o '/_next/static/css/[^"?]*' | sort -u |
 *     while read -r c; do curl -s "$H$c"; echo; done > /tmp/app.css
 *   node scripts/web-audit/css-cascade.mjs /tmp/app.css .site-header z-index
 */
import fs from 'node:fs';
import { walkDeclarations } from './css-walk.mjs';

const [file, want, prop] = process.argv.slice(2);
if (!file || !want) {
  console.error('usage: css-cascade.mjs <file.css> <selector> [property]');
  process.exit(2);
}

const out = [];
for (const d of walkDeclarations(fs.readFileSync(file, 'utf8'), file)) {
  if (!d.selectors.includes(want)) continue;
  if (prop && d.prop !== prop) continue;
  out.push(`L${d.line}  [${d.media.length ? d.media.join(' & ') : 'top'}]  ${d.selector} { ${d.prop}: ${d.value} }`);
}

console.log(out.length ? out.join('\n') : `(no declaration of ${want}${prop ? ` / ${prop}` : ''} found)`);
console.log(`\n→ winner at equal specificity: ${out.length ? out[out.length - 1] : 'n/a'}`);
