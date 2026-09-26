import { describe, expect, it } from 'vitest';
import { searchArticles } from './search';

const entries = [
  {
    title: 'Sources',
    description: 'Inspect citations',
    group: 'Guides',
    href: '/sources/',
    body: 'Review outline approval in another guide.',
  },
  {
    title: 'Outline approval',
    description: 'Review a content plan',
    group: 'Agent',
    href: '/agent/outputs/',
    body: 'Approve before drafting.',
  },
];

describe('documentation search', () => {
  it('finds body evidence while ranking the matching title first', () => {
    expect(searchArticles(entries, ' OUTLINE approval ').map(({ href }) => href)).toEqual([
      '/agent/outputs/',
      '/sources/',
    ]);
    expect(searchArticles(entries, 'citations approval').map(({ href }) => href)).toEqual([
      '/sources/',
    ]);
  });

  it('does not suggest unrelated guides or fill an empty query', () => {
    expect(searchArticles(entries, 'outline invoices')).toEqual([]);
    expect(searchArticles(entries, '  ')).toEqual([]);
  });
});
