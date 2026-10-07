import { describe, it, expect } from 'vitest';
import { searchTerms, termVariants, termClauses, relevanceSql, suggestionStem, likeLiteral } from '../lib/search';

/**
 * Search matching. The point of these tests is the three things buyers actually
 * hit: word order, plurals, and "the right result is not first".
 */
describe('search terms', () => {
  it('splits, lowercases and drops stopwords and single letters', () => {
    expect(searchTerms('Ankara Gown')).toEqual(['ankara', 'gown']);
    expect(searchTerms('the gown of a lady')).toEqual(['gown', 'lady']);
    expect(searchTerms('  iPhone  13  pro ')).toEqual(['iphone', '13', 'pro']);
    expect(searchTerms('a b c')).toEqual([]);
  });

  it('de-duplicates and caps runaway queries', () => {
    expect(searchTerms('shoes shoes shoes')).toEqual(['shoes']);
    expect(searchTerms('one two three four five six seven eight').length).toBe(6);
  });

  it('strips punctuation a buyer typed', () => {
    expect(searchTerms('gown, size 12!')).toEqual(['gown', 'size', '12']);
  });
});

describe('plural and singular forms', () => {
  it('offers the plural of a singular word', () => {
    expect(termVariants('gown')).toContain('gowns');
    expect(termVariants('dress')).toContain('dresses');
    expect(termVariants('phone')).toContain('phones');
  });

  it('offers the singular of a plural word', () => {
    expect(termVariants('gowns')).toContain('gown');
    expect(termVariants('dresses')).toContain('dress');
    expect(termVariants('parties')).toContain('party');
    expect(termVariants('boxes')).toContain('box');
  });

  it('leaves short words alone and does not mangle -ss words', () => {
    expect(termVariants('tv')).toEqual(['tv']);
    // glass → glasses is right; it must not be "de-pluralised" to glas.
    expect(termVariants('glass')).toEqual(['glass', 'glasses']);
    expect(termVariants('glasses')).toContain('glass');
  });

  it('always includes the word as typed, first', () => {
    for (const w of ['gown', 'gowns', 'shoe', 'shoes', 'bus']) {
      expect(termVariants(w)[0]).toBe(w);
    }
  });
});

describe('matching clause', () => {
  it('requires every term (AND) and searches every variant (OR)', () => {
    const c = termClauses(['ankara', 'gown'], ['l.name']);
    // One group per term, joined by AND.
    const groups = c.sql.split(' AND ');
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(g.startsWith('(')).toBe(true);
    // Two terms × (2 variants for ankara + 2 for gown) across one column.
    expect(c.params.length).toBe(c.sql.split('?').length - 1);
    expect(c.params).toContain('%ankara%');
    expect(c.params).toContain('%gown%');
  });

  it('spreads one term across every column given', () => {
    const c = termClauses(['gown'], ['l.name', 'l.description', 'b.name']);
    expect(c.sql.split('?').length - 1).toBe(6); // 2 variants × 3 columns
  });

  it('produces an empty clause for no terms', () => {
    expect(termClauses([], ['l.name']).sql).toBe('');
    expect(termClauses([], ['l.name']).params).toEqual([]);
  });
});

describe('relevance', () => {
  it('scores an exact name above a prefix above a substring above a description', () => {
    const { sql, params } = relevanceSql('l.name', 'l.description', ['gown']);
    const exact = sql.indexOf('= ?');
    const prefix = sql.indexOf('LIKE ?');
    expect(exact).toBeLessThan(prefix); // exact-name CASE comes first
    // Six binds per term: exact, prefix, word-start, contains, position×2, description.
    expect(params).toEqual(['gown', 'gown%', '% gown%', '%gown%', 'gown', 'gown', '%gown%']);
  });

  it('adds a term for each word', () => {
    expect(relevanceSql('l.name', null, ['a', 'b']).params).toHaveLength(12);
  });

  it('survives being asked for no description column', () => {
    const { sql, params } = relevanceSql('b.name', null, ['ankara']);
    expect(sql.startsWith('(')).toBe(true);
    expect(params).toHaveLength(6);
  });
});

describe('suggestion stem', () => {
  it('takes the first four characters of the first real term', () => {
    expect(suggestionStem('Ankara')).toBe('anka');
    expect(suggestionStem('the gowns')).toBe('gown');
  });

  it('escapes LIKE wildcards so a literal % cannot widen the query', () => {
    // Punctuation is stripped from terms, so the guard has to live in
    // likeLiteral, which is what the SQL binds go through.
    expect(likeLiteral('100%')).toBe('100\\%');
    expect(likeLiteral('a_b')).toBe('a\\_b');
    expect(likeLiteral('plain')).toBe('plain');
  });
});
