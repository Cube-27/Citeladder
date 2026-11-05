import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import type { BlogBlock } from '@/lib/marketing-content/blog';
import { POSTS } from '@/lib/marketing-content/blog';

import { headingId, withOccurrenceKeys } from './heading-id';
import { blockIdentity, PostBlock } from './post-blocks';

/**
 * The rich block renderers behind a guide body. The plain blocks (heading,
 * paragraph, list) are covered through the page test; these cases pin the
 * structural ones, whose payloads used to be untyped and could silently render
 * an empty frame.
 */

describe('PostBlock', () => {
  it('renders typed internal links and citations that point at the listed source', () => {
    render(
      <PostBlock
        block={{
          type: 'richParagraph',
          content: [
            'Read ',
            { type: 'link', text: 'solutions', href: '/solutions' },
            { type: 'link', text: 'Provider documentation', href: 'https://example.com/product' },
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
    const external = screen.getByRole('link', { name: 'Provider documentation' });
    expect(external).toHaveAttribute('href', 'https://example.com/product');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer');
    const citation = screen.getByRole('link', { name: 'Source 1: Official guidance' });
    expect(citation).toHaveAttribute('href', '#source-1');
    expect(citation).toHaveTextContent('[1]');
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
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Add statistics High: Ground claims in numbers.',
      'Lead with the answer: Put the definition first.',
    ]);
  });

  it('renders a flow diagram as its numbered steps under the diagram title', () => {
    render(
      <PostBlock
        block={{
          type: 'diagram',
          variant: 'flow',
          title: 'The pipeline',
          data: { steps: [{ step: '01', title: 'Crawl', desc: 'Fetch the owned site.' }] },
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'The pipeline' })).toBeInTheDocument();
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['Crawl: Fetch the owned site.']);
  });

  it('renders each post tone as the matching system callout, the accent as a neutral note', () => {
    const tones = (['accent', 'warning', 'info'] as const).map((tone) => {
      const { container, unmount } = render(
        <PostBlock
          block={{ type: 'callout', tone, title: `A ${tone} note`, text: 'Body copy.' }}
        />,
      );
      expect(container).toHaveTextContent(`A ${tone} note`);
      expect(container).toHaveTextContent('Body copy.');
      const rendered = container
        .querySelector('[data-callout-tone]')
        ?.getAttribute('data-callout-tone');
      unmount();
      return rendered;
    });
    expect(tones).toEqual(['neutral', 'warning', 'info']);
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

  it('keeps a diagram h3 even when the block carries no visible title', () => {
    const levels = renderedLevels([
      { type: 'heading', text: 'A section' },
      {
        type: 'diagram',
        variant: 'flow',
        data: { steps: [{ step: '1', title: 'Connect', desc: 'Link the sources.' }] },
      },
    ]);
    // The unconditional h3 keeps the diagram's steps one level under their section.
    expect(levels).toEqual([2, 3]);
  });
});
