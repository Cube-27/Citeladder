import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import type { BlogBlock } from '@/lib/marketing-content/blog';
import { POSTS } from '@/lib/marketing-content/blog';

import { headingId, withOccurrenceKeys } from './heading-id';
import { blockIdentity, PostBlock } from './post-blocks';

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
    expect(citation.closest('p')?.textContent).toBe(
      'Read solutionsProvider documentation and the source\u2060[1]',
    );
  });

  it('joins a citation to the word before it only when its source is listed', () => {
    render(
      <PostBlock
        block={{
          type: 'richParagraph',
          content: [
            'Listed ',
            { type: 'citation', sourceId: 'official' },
            ' and unlisted ',
            { type: 'citation', sourceId: 'missing' },
            'sources.',
          ],
        }}
        sources={[
          {
            id: 'official',
            title: 'Official guidance',
            publisher: 'Publisher',
            url: 'https://example.com',
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Source 1: Official guidance' }).closest('p')?.textContent,
    ).toBe('Listed\u2060[1] and unlisted sources.');
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

  it('drops a header row with no text', () => {
    render(
      <PostBlock
        block={{
          type: 'table',
          headers: ['', ' '],
          rows: [['Quotation addition', 'Strongest lift']],
        }}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).queryAllByRole('columnheader')).toEqual([]);
    expect(within(table).getAllByRole('row')).toHaveLength(1);
    expect(within(table).getByRole('cell', { name: 'Strongest lift' })).toBeInTheDocument();
  });

  it('fits short label and figure columns to their content, not prose or long headers', () => {
    render(
      <PostBlock
        block={{
          type: 'table',
          headers: ['Stage', 'Estimated monthly users', 'What happens'],
          rows: [
            ['Crawl', '245 million', 'The crawler fetches every page the sitemap lists.'],
            ['Answer', 'about 11%', 'Short note'],
          ],
        }}
      />,
    );
    const fit = (name: string, role: 'cell' | 'columnheader' = 'cell') =>
      screen.getByRole(role, { name }).hasAttribute('data-fit');
    expect(fit('Crawl')).toBe(true);
    expect(fit('Stage', 'columnheader')).toBe(true);
    expect(fit('245 million')).toBe(true);
    expect(fit('Estimated monthly users', 'columnheader')).toBe(false);
    expect(fit('Short note')).toBe(false);
    expect(fit('What happens', 'columnheader')).toBe(false);
  });

  it('marks figure cells, magnitude words included, as numeric and leaves text cells alone', () => {
    render(
      <PostBlock
        block={{
          type: 'table',
          headers: ['Measure', 'Claude'],
          rows: [
            ['Estimated monthly users', '245 million'],
            ['Audience', 'over 1.1 billion'],
            ['Share of prompts', 'about 11%'],
            ['Direction', 'Strongest lift'],
          ],
        }}
      />,
    );

    const numeric = (text: string) =>
      screen.getByText(text).closest('td')?.hasAttribute('data-numeric');
    expect(numeric('245 million')).toBe(true);
    expect(numeric('over 1.1 billion')).toBe(true);
    expect(numeric('about 11%')).toBe(true);
    expect(numeric('Strongest lift')).toBe(false);
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
    for (const post of POSTS) {
      const keys = withOccurrenceKeys(post.body, blockIdentity).map(({ key }) => key);
      expect(new Set(keys).size, post.slug).toBe(post.body.length);
    }
  });
});

describe('heading outline', () => {
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
    expect(levels).toEqual([2, 3]);
  });
});
