import { describe, expect, it } from 'vitest';

import { normalizeSearch, SEARCH_MAX_LENGTH } from '@/lib/visibility/fanout-grouping';

describe('normalizeSearch', () => {
  it('caps a search past the endpoint bound so both sides filter alike', () => {
    // 513 characters: one past what the fanout endpoint accepts. The browser
    // used to filter the table by the whole string while the server was asked
    // about the first 512, so the table and the "matches elsewhere" count
    // described different searches.
    const pasted = 'a'.repeat(SEARCH_MAX_LENGTH) + 'b';
    expect(pasted).toHaveLength(513);

    const needle = normalizeSearch(pasted);

    expect(needle).toHaveLength(SEARCH_MAX_LENGTH);
    expect(needle.endsWith('b')).toBe(false);
  });

  it('trims first, so surrounding space never eats a matchable character', () => {
    expect(normalizeSearch('  best crm  ')).toBe('best crm');
    expect(normalizeSearch(`  ${'a'.repeat(SEARCH_MAX_LENGTH + 8)}  `)).toHaveLength(
      SEARCH_MAX_LENGTH,
    );
  });

  it('reads an absent or blank search as no filter at all', () => {
    expect(normalizeSearch(null)).toBe('');
    expect(normalizeSearch('   ')).toBe('');
  });
});
