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
  it('renders typed internal links and directly followable source citations', () => {
    render(
      <PostBlock
        block={{
          type: 'richParagraph',
          content: [
            'Read ',
            { type: 'link', text: 'solutions', href: '/solutions' },
            ' and the source ',
            { type: 'citation', sourceId: 'official' },
          ],
        }}
        sources={[
          {
            id: 'official',
            title: 'Official guidance',
            publisher: 'Publisher',
            url: 'https://example.com/guidance',
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'solutions' })).toHaveAttribute('href', '/solutions');
    expect(screen.getByRole('link', { name: /Source 1: Official guidance/ })).toHaveAttribute(
      'href',
      'https://example.com/guidance',
    );
  });

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

  it('emphasises only the bare percentages at or above the heatmap threshold', () => {
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
            ['Not a percentage', '40'],
          ],
        }}
      />,
    );

    // The rule, not the paint: a bare percentage at or above the threshold is
    // the only cell marked, so this survives a change of visual treatment.
    const emphasis = (text: string) => screen.getByText(text).getAttribute('data-emphasised');
    expect(emphasis('+40%')).toBe('true');
    expect(emphasis('+12%')).toBeNull();
    expect(emphasis('-8%')).toBeNull();
    expect(emphasis('40')).toBeNull();
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

describe('heading outline', () => {
  /**
   * Every published post's rendered heading levels, in document order.
   * Assertions below read this rather than each block in isolation, because a
   * skip is a relationship between two blocks, not a property of either.
   */
  function renderedLevels(body: readonly BlogBlock[]): number[] {
    const { container } = render(
      <>
        {body.map((block, index) => (
          <PostBlock key={index} block={block} />
        ))}
      </>,
    );
    return [...container.querySelectorAll('h2, h3, h4, h5, h6')].map((node) =>
      Number(node.tagName.slice(1)),
    );
  }

  it.each(POSTS.map((post) => [post.slug, post] as const))(
    'never skips a level in %s',
    (slug, post) => {
      const levels = renderedLevels(post.body);
      // The post title is the h1, so the body starts at h2.
      const outline = [1, ...levels];
      const skips = outline.flatMap((level, index) =>
        index > 0 && level > outline[index - 1]! + 1 ? [`${outline[index - 1]} -> ${level}`] : [],
      );
      expect(skips, slug).toEqual([]);
    },
  );

  it('gives a titled callout an h3, so it never skips under a section h2', () => {
    const levels = renderedLevels([
      { type: 'heading', text: 'A section' },
      { type: 'callout', tone: 'accent', title: 'A note', text: 'Body copy.' },
    ]);
    expect(levels).toEqual([2, 3]);
  });

  it('keeps a diagram h3 even when the block carries no visible title', () => {
    const levels = renderedLevels([
      { type: 'heading', text: 'A section' },
      {
        type: 'diagram',
        variant: 'flow',
        data: { steps: [{ step: '1', title: 'Connect', desc: 'Link the sources.' }] },
      },
    ]);
    // Without the unconditional h3 the diagram's h4s hang under the h2.
    expect(levels).toEqual([2, 3, 4]);
  });
});
