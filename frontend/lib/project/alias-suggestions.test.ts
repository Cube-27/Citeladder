import { describe, expect, it } from 'vite-plus/test';

import { suggestAliases } from './alias-suggestions';

describe('suggestAliases', () => {
  it('spells a run-together brand with "&" and "and", from its name and domain', () => {
    expect(
      suggestAliases({
        brandName: 'bestandless',
        aliases: ['Best and Less'],
        domains: ['https://www.bestandless.com.au', 'bestandless.co.nz'],
      }),
    ).toEqual(['Best&Less', 'Best & Less']);
  });

  it('suggests the run-together form of a spaced name, and never splits short parts', () => {
    expect(suggestAliases({ brandName: 'Ace Hardware', aliases: [], domains: [] })).toEqual([
      'acehardware',
    ]);
    expect(suggestAliases({ brandName: 'Brandon', aliases: [], domains: [] })).toEqual([]);
  });
});
