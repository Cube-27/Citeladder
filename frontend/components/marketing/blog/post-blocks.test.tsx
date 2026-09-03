import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BlogBlock } from '@/lib/marketing-content/blog';
import { POSTS } from '@/lib/marketing-content/blog';

import { blockIdentity, headingId, PostBlock, withOccurrenceKeys } from './post-blocks';

/**
 * The rich block renderers behind a guide body. The plain blocks (heading,
 * paragraph, list) are covered through the page test; these cases pin the
 * structural ones, whose payloads used to be untyped and could silently render
 * an empty frame.
 */

describe('PostBlock', () => {
  it('renders a table with column headers and its caption', () => {
    render(
      <PostBlock
        block={{
          type: 'table',
          caption: 'Directional priority',
          headers: ['Strategy', 'Direction'],
          rows: [
            ['Quotation addition', 'Strongest lift'],
            ['Keyword repetition', 'Neutral to negative'],
          ],
        }}
      />,
    );

    const table = screen.getByRole('table');
    const columns = within(table).getAllByRole('columnheader');
    expect(columns.map((column) => column.textContent)).toEqual(['Strategy', 'Direction']);
    for (const column of columns) expect(column).toHaveAttribute('scope', 'col');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Directional priority')).toBeInTheDocument();
  });

  it('emphasises only the percentages a heatmap table calls out', () => {
    render(
      <PostBlock
        block={{
          type: 'table',
          heatmap: true,
          headers: ['Tactic', 'Lift'],
          rows: [
            ['Strong', '+40%'],
            ['Weak', '+12%'],
            ['Regression', '-8%'],
          ],
        }}
      />,
    );

    expect(screen.getByText('+40%').className).toContain('text-accent-text');
    expect(screen.getByText('+12%').className).not.toContain('text-accent-text');
    expect(screen.getByText('-8%').className).not.toContain('text-accent-text');
  });

  it('renders every checklist item with its badge', () => {
    render(
      <PostBlock
        block={{
          type: 'checklist',
          title: 'Writing checklist',
          items: [
            { title: 'Add statistics', description: 'Ground claims in numbers.', badge: 'High' },
            { title: 'Lead with the answer', description: 'Put the definition first.' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Writing checklist' })).toBeInTheDocument();
    expect(screen.getByText('Add statistics')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Put the definition first.')).toBeInTheDocument();
  });

  it.each([
    [
      'architecture',
      {
        type: 'diagram',
        variant: 'architecture',
        title: 'Ingestion',
        data: {
          sources: [{ title: 'Site health', badge: 'DOM', description: 'Semantic HTML.' }],
          destination: { title: 'Evidence base', description: 'Versioned store.' },
        },
      },
      ['Site health', 'DOM', 'Evidence base'],
    ],
    [
      'split',
      {
        type: 'diagram',
        variant: 'split',
        data: {
          leftTitle: 'Legacy audit',
          leftBadge: 'Heuristics',
          leftItems: ['Keyword density'],
          rightTitle: 'Answer audit',
          rightBadge: 'Evidence',
          rightItems: ['Citation coverage'],
        },
      },
      ['Legacy audit', 'Keyword density', 'Answer audit', 'Citation coverage'],
    ],
    [
      'flow',
      {
        type: 'diagram',
        variant: 'flow',
        data: { steps: [{ step: '01', title: 'Crawl', desc: 'Fetch the owned site.' }] },
      },
      ['01', 'Crawl', 'Fetch the owned site.'],
    ],
    [
      'taxonomy',
      {
        type: 'diagram',
        variant: 'taxonomy',
        data: {
          root: 'Topic: solar',
          nodes: [
            { category: 'solar panel cost', intent: 'Commercial', details: 'Pricing tables.' },
          ],
        },
      },
      ['Topic: solar', 'solar panel cost', 'Commercial', 'Pricing tables.'],
    ],
  ] as const)('renders the %s diagram with its payload', (_variant, block, expected) => {
    render(<PostBlock block={block as BlogBlock} />);
    for (const text of expected) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders a callout for each tone without leaking a raw palette colour', () => {
    for (const tone of ['accent', 'warning', 'info'] as const) {
      const { container, unmount } = render(
        <PostBlock
          block={{ type: 'callout', tone, title: `A ${tone} note`, text: 'Body copy.' }}
        />,
      );
      expect(screen.getByRole('heading', { name: `A ${tone} note` })).toBeInTheDocument();
      expect(screen.getByText('Body copy.')).toBeInTheDocument();
      expect(container.innerHTML).not.toMatch(/amber-\d|sky-\d/);
      unmount();
    }
  });

  it('gives an ordered list a different element from a bulleted one', () => {
    const { container: bulleted, unmount } = render(
      <PostBlock block={{ type: 'list', items: ['one', 'two'] }} />,
    );
    expect(bulleted.querySelector('ul')).not.toBeNull();
    unmount();

    const { container: numbered } = render(
      <PostBlock block={{ type: 'list', ordered: true, items: ['one', 'two'] }} />,
    );
    expect(numbered.querySelector('ol')).not.toBeNull();
  });
});

describe('block keys and anchors', () => {
  it('slugs a heading into an anchor id', () => {
    expect(headingId('What an AEO audit is for')).toBe('s-what-an-aeo-audit-is-for');
    expect(headingId('“Trailing punctuation.”')).toBe('s-trailing-punctuation');
  });

  it('keeps repeated values apart', () => {
    expect(withOccurrenceKeys(['a', 'a', 'b'], (value) => value).map(({ key }) => key)).toEqual([
      'a:0',
      'a:1',
      'b:0',
    ]);
  });

  it('identifies every block shape a published post uses', () => {
    // A block whose identity threw or collapsed to the same string for two
    // different shapes would produce duplicate React keys across a body.
    for (const post of POSTS) {
      const keys = withOccurrenceKeys(post.body, blockIdentity).map(({ key }) => key);
      expect(new Set(keys).size, post.slug).toBe(post.body.length);
    }
  });
});
