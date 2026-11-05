import { describe, expect, it } from 'vitest';
import { groupResults, highlight, searchArticles } from './search';

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

  it('groups ranked results by docs group, best group first', () => {
    const results = searchArticles(entries, 'approval');
    expect(
      groupResults(results).map(({ label, items }) => [label, items.map(({ href }) => href)]),
    ).toEqual([
      ['Agent', ['/agent/outputs/']],
      ['Guides', ['/sources/']],
    ]);
  });

  it('marks every query term in result text, whatever its case', () => {
    expect(highlight('Review outline approval', ' OUTLINE review ')).toEqual([
      { text: 'Review', match: true },
      { text: ' ', match: false },
      { text: 'outline', match: true },
      { text: ' approval', match: false },
    ]);
    expect(highlight('Costs (a+b)', 'a+b')).toEqual([
      { text: 'Costs (', match: false },
      { text: 'a+b', match: true },
      { text: ')', match: false },
    ]);
  });
});
