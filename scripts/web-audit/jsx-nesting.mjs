#!/usr/bin/env node
/**
 * Interactive-nesting audit.
 *
 * A `<button>` inside an `<a>` (or an `<a>` inside an `<a>`) is invalid HTML,
 * and the consequence is not cosmetic: screen readers expose one control or
 * the other depending on the browser, and VoiceOver on iOS frequently cannot
 * activate the inner one at all. The fix everywhere in this codebase is the
 * stretched-link pattern — the card is a `<div>`/`<article>`, the anchor covers
 * it with an `::after`, and any real button is a sibling sitting above it with
 * a z-index. That pattern is easy to undo by accident in a later edit, so it
 * is checked here rather than remembered.
 *
 * Run: node scripts/web-audit/jsx-nesting.mjs      (exit 1 on a violation)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'web'));

/** Comments are stripped first: JSDoc prose that mentions `<a>` must not read as markup. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Tags that may not contain another interactive element. */
const GROUPS = [
  { outer: ['a', 'Link'], inner: ['a', 'Link', 'button'] },
  { outer: ['button'], inner: ['button', 'a', 'Link'] },
];

const violations = [];

for (const file of walk(ROOT)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const { outer, inner } of GROUPS) {
    for (const tag of outer) {
      const openClose = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
      for (const m of src.matchAll(openClose)) {
        for (const child of inner) {
          const hit = new RegExp(`<${child}\\b`).exec(m[1]);
          if (!hit) continue;
          const line = src.slice(0, m.index).split('\n').length;
          violations.push({
            file: path.relative(process.cwd(), file),
            line,
            detail: `<${child}> inside <${tag}>`,
          });
          break;
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`✓ interactive nesting clean (${walk(ROOT).length} files scanned)`);
  process.exit(0);
}

console.error(`✗ ${violations.length} interactive-nesting violation(s):\n`);
for (const v of violations) console.error(`  ${v.file}:${v.line} — ${v.detail}`);
console.error(
  '\nA control inside a control is invalid HTML and breaks VoiceOver. Use the\n' +
    'stretched-link pattern instead: card is a div, the anchor covers it with\n' +
    '::after { inset: 0 }, and the button is a sibling at a higher z-index\n' +
    '(see components/ItemCard.tsx and the .card-stretch rules in globals.css).'
);
process.exit(1);
