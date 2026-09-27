/**
 * Where a Python-compatibility helper deliberately departs from the builtin.
 * The builtin parity itself is proven by the golden masters.
 */
import { describe, expect, it } from 'vitest';

import { pyIntOrZero } from '../src/python/text.ts';

describe('pyIntOrZero', () => {
  it('parses a count exactly up to the largest exact JSON number', () => {
    expect(pyIntOrZero('9_007_199_254_740_991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(pyIntOrZero(-Number.MAX_SAFE_INTEGER)).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it('refuses a count it could only serve rounded', () => {
    expect(() => pyIntOrZero('9007199254740993')).toThrow(RangeError);
    // Decoding already rounded this JSON number; it is refused, not served.
    expect(() => pyIntOrZero(2 ** 53)).toThrow(RangeError);
  });
});
