import { describe, expect, it } from 'vite-plus/test';

import { fieldSuggestion, spanSuggestion } from '@/test/page-suggestions-fixture';

import {
  fieldReview,
  groupByPassage,
  pageOutline,
  suggestionHighlights,
  withQuotedReference,
} from './page-workspace';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'aaaaaaaa-0000-4000-8000-000000000002';
const C = 'aaaaaaaa-0000-4000-8000-000000000003';
const D = 'aaaaaaaa-0000-4000-8000-000000000004';

describe('pageOutline', () => {
  it('lists the ATX headings with their line offsets, skipping fenced code', () => {
    const body =
      '# Pricing **plans**\n\nIntro.\n\n```\n# not a heading\n```\n\n## [Teams](/teams) ##\n';
    expect(pageOutline(body)).toEqual([
      { level: 1, text: 'Pricing plans', from: 0 },
      { level: 2, text: 'Teams', from: body.indexOf('## [Teams]') },
    ]);
  });

  it('drops only a closing # sequence that follows a blank', () => {
    const body = '## C# tips #  \n### Plans ## and #\n#### ##\n# \t \n##### Done\t##\t\n';
    expect(pageOutline(body).map(({ level, text }) => [level, text])).toEqual([
      [2, 'C# tips'],
      [3, 'Plans ## and'],
      [4, '##'],
      [5, 'Done'],
    ]);
  });

  it('reads links and images in a heading as their text', () => {
    const body = '# ![Logo](/logo.png) and [Teams](/teams) [not closed\n## [a [b](/b)\n';
    expect(pageOutline(body).map(({ text }) => text)).toEqual([
      'Logo and Teams [not closed',
      '[a b',
    ]);
  });
});

describe('groupByPassage', () => {
  it('groups body suggestions by passage, then fields and the whole page', () => {
    const body = '## Pricing\n\nOur plans start at ten dollars. Teams pay more.\n\nContact sales.';
    const groups = groupByPassage(
      [
        spanSuggestion(A, body, 'start at ten dollars'),
        spanSuggestion(B, body, 'Teams pay more'),
        spanSuggestion(C, body, 'Contact sales'),
        fieldSuggestion(D, 'meta_description'),
        {
          ...fieldSuggestion('aaaaaaaa-0000-4000-8000-000000000005', 'title'),
          anchor: { kind: 'page' },
        },
      ],
      body,
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ['Our plans start at ten dollars. Teams pay more.', [A, B]],
      ['Contact sales.', [C]],
      ['Meta description', [D]],
      ['The whole page', ['aaaaaaaa-0000-4000-8000-000000000005']],
    ]);
  });
});

describe('suggestionHighlights', () => {
  it('highlights open and applied body suggestions, proposing text only for a ready one', () => {
    const body = 'Ships in two days. Costs less.';
    const highlights = suggestionHighlights(
      [
        spanSuggestion(A, body, 'two days', { replacement: '48 hours' }),
        spanSuggestion(B, body, 'Costs less', { readiness: 'needs_input', replacement: null }),
        spanSuggestion(C, body, 'Ships', { status: 'applied' }),
        spanSuggestion(D, body, 'in', { status: 'dismissed' }),
        fieldSuggestion('aaaaaaaa-0000-4000-8000-000000000005', 'title'),
      ],
      (suggestion) => `Label ${suggestion.id.slice(-1)}`,
    );
    expect(highlights).toEqual([
      { id: A, from: 9, to: 17, tone: 'ready', label: 'Label 1', proposal: '48 hours' },
      { id: B, from: 19, to: 29, tone: 'needs_input', label: 'Label 2', proposal: null },
      { id: C, from: 0, to: 5, tone: 'applied', label: 'Label 3', proposal: null },
    ]);
  });
});

describe('fieldReview', () => {
  it('offers the ready suggestion on a field and says when the field was edited', () => {
    const advice = fieldSuggestion(A, 'title', { readiness: 'advice', replacement: null });
    const ready = fieldSuggestion(B, 'title', { replacement: 'Pricing plans | Acme' });
    const applied = fieldSuggestion(C, 'meta_description', { status: 'applied' });
    const all = [advice, ready, applied];
    expect(fieldReview(all, 'title')).toEqual({ open: ready, edited: false });
    expect(fieldReview(all, 'meta_description')).toEqual({ open: null, edited: true });
    expect(fieldReview([advice], 'title').open).toBe(advice);
  });
});

describe('withQuotedReference', () => {
  it('quotes the passage over a starting request in an empty composer', () => {
    expect(
      withQuotedReference('  ', { quote: 'First line.\n\nSecond line.', request: 'Improve it.' }),
    ).toBe('> First line.\n>\n> Second line.\n\nImprove it.');
  });

  it('appends the quote after what the person already wrote', () => {
    expect(
      withQuotedReference('Make it warmer.\n', { quote: 'Our plans', request: 'Ignored.' }),
    ).toBe('Make it warmer.\n\n> Our plans');
  });
});
