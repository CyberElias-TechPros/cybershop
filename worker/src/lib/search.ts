/**
 * Search matching.
 *
 * `LIKE '%shoes%'` answers exactly one question well: "does this string contain
 * these characters in this order". Buyers ask harder ones. "ankara gown" should
 * find "Gown, Ankara print"; "gowns" should find "gown"; and a listing whose
 * name *is* the query should outrank one that merely mentions it in a long
 * description.
 *
 * D1 is SQLite, and SQLite has FTS5 — but whether a given D1 build keeps it,
 * and what it costs to maintain a shadow index, is not a bet worth making for a
 * marketplace whose catalogue is tens of thousands of rows, not millions. So
 * this stays on LIKE and fixes the three things that actually annoy people:
 *
 *   1. every word must match, in any order   → "ankara gown" finds it
 *   2. a light plural/singular variant       → "gowns" finds "gown"
 *   3. results are ranked by *where* they match, then by freshness
 *
 * The whole module is pure string/SQL-fragment work, so it is unit-testable
 * without a database.
 */

/** Words too common to be worth requiring. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or',
  'that', 'the', 'this', 'to', 'with', 'my', 'your', 'me', 'i', 'we', 'you',
]);

/**
 * Break a query into searchable terms: lowercase, strip punctuation, drop
 * stopwords and single characters. Capped at six terms so a paste-the-essay
 * query cannot turn into a 40-clause scan.
 */
export function searchTerms(q: string): string[] {
  const raw = String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  // De-duplicate, preserve order.
  return [...new Set(raw)].slice(0, 6);
}

/**
 * The forms of a word worth trying. Deliberately conservative: English plural
 * rules only (this is a Nigerian marketplace and the catalogue is English).
 * Returned longest-first so an exact form is preferred when both are stored.
 */
export function termVariants(term: string): string[] {
  const out = new Set<string>([term]);
  if (term.length > 3) {
    if (/(ss|sh|ch|x|z)$/.test(term)) out.add(`${term}es`);
    else if (/[^aeiou]y$/.test(term)) out.add(`${term.slice(0, -1)}ies`);
    else out.add(`${term}s`);
    // And the other direction: strip a plural to find the singular.
    if (/ies$/.test(term)) out.add(`${term.slice(0, -3)}y`);
    else if (/(ss|sh|ch|x|z)es$/.test(term)) out.add(term.slice(0, -2));
    else if (/s$/.test(term) && !/ss$/.test(term)) out.add(term.slice(0, -1));
  }
  return [...out];
}

export interface TermClause {
  /** A parenthesised SQL fragment that is true when this term matches. */
  sql: string;
  /** Binds for the fragment, in order. */
  params: string[];
}

/**
 * Build `AND`-joined clauses, one per term, each of which is true when the term
 * appears in *any* of `columns` in any of its variant forms.
 *
 * Requiring every term is what makes word order irrelevant and cuts the noise:
 * a six-word query no longer returns everything containing "the".
 */
export function termClauses(terms: string[], columns: string[]): TermClause {
  const params: string[] = [];
  const parts: string[] = [];
  for (const term of terms) {
    const variants = termVariants(term);
    const ors: string[] = [];
    for (const v of variants) {
      for (const col of columns) {
        ors.push(`LOWER(${col}) LIKE ?`);
        params.push(`%${v}%`);
      }
    }
    // One term → OR across its forms and the columns it may live in.
    parts.push(ors.length > 1 ? `(${ors.join(' OR ')})` : ors[0] ?? '1=1');
  }
  return { sql: parts.length ? parts.join(' AND ') : '', params };
}

/**
 * Relevance score, highest first.
 *
 * The numbers are arbitrary but the *ordering* is the point: an exact name beats
 * a name that starts with the query, which beats a name that contains it, which
 * beats a description mention. Two listings that both merely mention it fall
 * back to featured, then recency.
 */
export function relevanceSql(
  nameCol: string,
  descCol: string | null,
  terms: string[]
): { sql: string; params: string[] } {
  const params: string[] = [];
  const cases: string[] = [];
  for (const term of terms) {
    const exact = term.toLowerCase();
    cases.push(`CASE WHEN LOWER(${nameCol}) = ? THEN 100 ELSE 0 END`);
    params.push(exact);
    cases.push(`CASE WHEN LOWER(${nameCol}) LIKE ? THEN 60 ELSE 0 END`);
    params.push(`${exact}%`);
    // A word boundary beats a match buried mid-word.
    cases.push(`CASE WHEN LOWER(${nameCol}) LIKE ? THEN 45 ELSE 0 END`);
    params.push(`% ${exact}%`);
    cases.push(`CASE WHEN LOWER(${nameCol}) LIKE ? THEN 30 ELSE 0 END`);
    params.push(`%${exact}%`);
    // Position: "Ankara Gown" should beat "Gift box with a gown inside", and
    // the only thing separating them is where in the name the word lands. Up to
    // 20 extra points, fading the later the match appears.
    cases.push(`CASE WHEN INSTR(LOWER(${nameCol}), ?) > 0 THEN MAX(0, 20 - INSTR(LOWER(${nameCol}), ?)) ELSE 0 END`);
    params.push(exact, exact);
    if (descCol) {
      cases.push(`CASE WHEN LOWER(${descCol}) LIKE ? THEN 10 ELSE 0 END`);
      params.push(`%${exact}%`);
    }
  }
  return { sql: cases.length ? `(${cases.join(' + ')})` : '0', params };
}

/** Escape the `%` and `_` a user might type so they are matched literally. */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Suggest a spelling when a query returns nothing: the first four characters
 * are the stem buyers usually get right, and the tail is where they go wrong.
 */
export function suggestionStem(q: string): string {
  const term = searchTerms(q)[0] ?? String(q || '').trim().toLowerCase();
  return likeLiteral(term.slice(0, 4));
}
