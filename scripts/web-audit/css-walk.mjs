/**
 * Tiny CSS scanner shared by the audit scripts.
 *
 * Walks a stylesheet and yields one record per declaration, tracking the
 * at-rule context it sits in and whether the rule is top level. Handles
 * minified CSS (no trailing `;` before `}`, everything on one line) as well as
 * comments and strings.
 *
 * It is deliberately simple: it understands nesting depth and at-rule context,
 * not the full grammar. Good enough to answer "which declaration wins?" and
 * "is this responsive override dead?", which is what this audit needed.
 */

/**
 * @param {string} src stylesheet text
 * @param {string} [file] filename used in the records
 * @returns {{file:string,line:number,selector:string,selectors:string[],prop:string,value:string,media:string[],atRules:string[],top:boolean}[]}
 */
export function walkDeclarations(src, file = '') {
  const records = [];
  const stack = [];
  let i = 0;
  let buf = '';

  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  const emit = (idx) => {
    const text = buf.trim().replace(/\s+/g, ' ');
    buf = '';
    if (!text) return;
    if (text.startsWith('--')) return; // custom property, not a rule to compare
    const selector = stack[stack.length - 1] || '';
    if (!selector || selector.startsWith('@') || selector.includes('%')) return;
    // keyframe steps and font-face descriptors are not selectors
    const ctxAll = stack.slice(0, -1);
    if (ctxAll.some((s2) => s2.startsWith('@keyframes') || s2.startsWith('@font-face'))) return;
    const m = text.match(/^([-a-zA-Z]+)\s*:\s*(.+?)\s*(!important)?$/);
    if (!m) return;
    const atRules = stack.slice(0, -1).filter((s) => s.startsWith('@'));
    records.push({
      file,
      line: lineOf(idx),
      selector,
      selectors: selector.split(',').map((s) => s.trim()).filter(Boolean),
      prop: m[1],
      value: m[2] + (m[3] ? ` ${m[3]}` : ''),
      media: atRules.filter((s) => s.startsWith('@media')),
      atRules,
      top: stack.length === 1,
    });
  };

  while (i < src.length) {
    const c = src[i];
    // comments
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // strings (url("…"), content: "…")
    if (c === '"' || c === "'") {
      const q = c;
      buf += c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        buf += src[i] ?? '';
        i++;
      }
      buf += q;
      i++;
      continue;
    }
    if (c === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
      i++;
      continue;
    }
    if (c === '}') {
      emit(i); // minified: the last declaration has no trailing ';'
      stack.pop();
      buf = '';
      i++;
      continue;
    }
    if (c === ';') {
      emit(i);
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  return records;
}
