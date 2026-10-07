/** Small RFC-ish CSV reader. Handles quotes, commas, and CRLF. No formula execution. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { q = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

/**
 * Escape one CSV cell.
 *
 * The leading-character guard is not paranoia: Excel, Sheets and LibreOffice
 * all treat a cell starting with `=`, `+`, `-` or `@` as a formula, and this
 * file gets opened in Excel by real shop owners. Vendor-supplied item names are
 * untrusted input, so "=HYPERLINK(...)" in an item name would execute on open.
 */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Build an RFC 4180 CSV body. CRLF, and a UTF-8 BOM is added by the caller. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => (r as unknown[]).map(csvCell).join(',')).join('\r\n');
}

/** A download response: UTF-8 BOM so Excel reads "₦" and accented names right. */
export function csvResponse(filename: string, rows: unknown[][]): Response {
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
