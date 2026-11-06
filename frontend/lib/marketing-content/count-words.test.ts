// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import { countWord, countWordCapitalized, projectCount } from './count-words';

describe('trial copy counts', () => {
  it('spells counts up to ten and writes larger ones as digits', () => {
    expect(countWord(7)).toBe('seven');
    expect(countWord(20)).toBe('20');
    expect(countWord(200000)).toBe('200,000');
  });

  it('capitalizes a count that opens a sentence', () => {
    expect(countWordCapitalized(7)).toBe('Seven');
  });

  it('names one project in the singular and more in the plural', () => {
    expect(projectCount(1)).toBe('one project');
    expect(projectCount(2)).toBe('two projects');
  });
});
