import { describe, expect, it } from 'vite-plus/test';

import { parseFactCsv } from './facts-csv';

describe('parseFactCsv', () => {
  it('reads columns by header name in any order and flags each unusable row', () => {
    const parsed = parseFactCsv(
      [
        'URL,Fact,Topic',
        'https://acme.test/pricing,Pro costs $59 a month.,Pricing',
        ',Integrates with Slack.,integrations',
        'ftp://acme.test,Founded in 2019.,weather',
        ',,company',
      ].join('\n'),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        line: 1,
        input: {
          topic: 'pricing',
          statement: 'Pro costs $59 a month.',
          source_url: 'https://acme.test/pricing',
        },
        errors: [],
      },
      {
        line: 2,
        input: { topic: 'integrations', statement: 'Integrates with Slack.', source_url: null },
        errors: [],
      },
      {
        line: 3,
        input: { topic: 'weather', statement: 'Founded in 2019.', source_url: 'ftp://acme.test' },
        errors: ['Unknown topic "weather".', 'Source URL must be an http or https address.'],
      },
      {
        line: 4,
        input: { topic: 'company', statement: '', source_url: null },
        errors: ['Statement is required.'],
      },
    ]);
  });

  it('refuses a file without the topic and statement headers', () => {
    expect(parseFactCsv('Pro costs $59 a month.,pricing').errors).toEqual([
      'The first row must name the topic and statement columns.',
    ]);
    expect(parseFactCsv('topic,statement\n').errors).toEqual(['No data rows were found.']);
  });
});
