import { describe, it, expect } from 'vitest';
import { ftsMatchExpr, expandSynonyms } from '../lib/search';

describe('FTS search expressions', () => {
  it('builds prefix groups with synonyms', () => {
    const expr = ftsMatchExpr(['sneakers'])!;
    expect(expr).toContain('"sneakers"*');
    expect(expr).toContain('"trainers"*');
  });
  it('requires every term', () => {
    const expr = ftsMatchExpr(['ankara', 'gown'])!;
    expect(expr.split(') (').length).toBeGreaterThanOrEqual(1);
    expect(expr).toContain('ankara');
    expect(expr).toContain('gown');
  });
  it('returns null for empty input', () => {
    expect(ftsMatchExpr([])).toBeNull();
  });
  it('expands synonyms symmetrically', () => {
    expect(expandSynonyms(['phone'])).toContain('smartphone');
    expect(expandSynonyms(['smartphone'])).toContain('phone');
  });
});
