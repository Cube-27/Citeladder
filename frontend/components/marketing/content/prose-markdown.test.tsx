import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

import { MarkdownFaq, ProseMarkdown, researchHeadings } from './prose-markdown';

it('renders a source-backed comparison with Toc anchors, citations and named tables', () => {
  const markdown = `## Evidence comparison

An observed result [\\[1\\]](#source-1) is not a guarantee.

| Observation | Limit |
|---|---|
| Mention | Not a visit |

### Citation evidence

| Observation | Limit |
|---|---|
| Source link | Not a recommendation |
`;
  render(<ProseMarkdown markdown={markdown} />);
  expect(researchHeadings(markdown)).toEqual([
    { id: 's-evidence-comparison', label: 'Evidence comparison', level: 2 },
  ]);
  expect(screen.getByRole('heading', { name: 'Evidence comparison' })).toHaveAttribute(
    'id',
    's-evidence-comparison',
  );
  const citation = screen.getByRole('link', { name: 'Source 1' });
  expect(citation).toHaveAttribute('href', '#source-1');
  expect(citation).toHaveTextContent('[1]');
  expect(citation.closest('p')?.textContent).toBe(
    'An observed result\u2060[1] is not a guarantee.',
  );
  const region = screen.getByRole('region', { name: 'Evidence comparison' });
  expect(within(region).getByRole('cell', { name: 'Not a visit' })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Citation evidence' })).getByRole('cell', {
      name: 'Not a recommendation',
    }),
  ).toBeVisible();
});

it('drops a Markdown header row with no text and keeps a filled one', () => {
  render(
    <ProseMarkdown
      markdown={`## Blank header

| | |
|---|---|
| Mention | Not a visit |

## Named header

| Observation | Limit |
|---|---|
| Source link | Not a recommendation |
`}
    />,
  );
  const blank = screen.getByRole('region', { name: 'Blank header' });
  expect(within(blank).queryAllByRole('columnheader')).toEqual([]);
  expect(within(blank).getAllByRole('row')).toHaveLength(1);
  const named = screen.getByRole('region', { name: 'Named header' });
  expect(
    within(named)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(['Observation', 'Limit']);
});

it('keeps short inline code, dates, hyphenated names and versions on one line', () => {
  const short = 'x'.repeat(32);
  const long = 'y'.repeat(33);
  const tick = '`';
  const { container } = render(
    <ProseMarkdown
      markdown={[
        '## What Applebot-Extended controls',
        '',
        `Run ${tick}${short}${tick} or ${tick}${long}${tick}, published 8 November 2026 for Q3 2026.`,
        '',
        '- Claude-SearchBot reads it, on PostgreSQL 16, Updated Oct 2026',
      ].join('\n')}
    />,
  );
  expect(screen.getByText(short)).toHaveAttribute('data-whole', '');
  expect(screen.getByText(long)).not.toHaveAttribute('data-whole');
  expect([...container.querySelectorAll('.cl-whole')].map((node) => node.textContent)).toEqual([
    'Applebot-Extended',
    '8 November 2026',
    'Q3 2026',
    'Claude-SearchBot',
    'PostgreSQL 16',
    'Oct 2026',
  ]);
  expect(screen.getByRole('heading', { name: 'What Applebot-Extended controls' })).toHaveAttribute(
    'id',
    's-what-applebot-extended-controls',
  );
});

it('gives a repeated heading its own anchor, in the Toc and on the table it names', () => {
  const markdown = `## Sites returned

| Site | Answers |
|---|---|
| a.com | 5 |

### Sites returned

Notes.

## Sites returned

| Site | Answers |
|---|---|
| b.com | 7 |
`;
  render(<ProseMarkdown markdown={markdown} />);
  expect(researchHeadings(markdown).map((item) => item.id)).toEqual([
    's-sites-returned',
    's-sites-returned-3',
  ]);
  expect(screen.getAllByRole('heading').map((heading) => heading.id)).toEqual([
    's-sites-returned',
    's-sites-returned-2',
    's-sites-returned-3',
  ]);
  expect(
    screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby')),
  ).toEqual(['s-sites-returned', 's-sites-returned-3']);
});

it('runs a citation-only source on after the row label and keeps a written source as a line', () => {
  render(
    <ProseMarkdown
      markdown={`## Timeline

| Date | What happened | Source |
|---|---|---|
| 16 Jan 2026 | Principles published for every plan | [\\[1\\]](#source-1) |
| 9 Feb 2026 | Test begins for logged-in adults | OpenAI blog [\\[2\\]](#source-2) |
`}
    />,
  );
  const runOn = screen.getByRole('link', { name: 'Source 1' }).closest('td');
  expect(runOn?.textContent).toBe('16 Jan 2026\u2060[1]');
  expect(
    screen.getByRole('link', { name: 'Source 2' }).closest('.cl-cell-source')?.textContent,
  ).toBe('Source: OpenAI blog\u2060[2]');
});

it('right-aligns figure columns, figure-led notes included, and lets an all-short table flex its first column', () => {
  render(
    <ProseMarkdown
      markdown={`## Files

| Measure | Result | Change | Note |
|---|---|---|---|
| Median file size | 7359 bytes | down 20 | Mostly fine |
| Links | ~48% in February 2026 | up 13 | none found |
| Sections | 95.9% | up 9 | Kept |
`}
    />,
  );
  const align = (name: string) =>
    screen.getByRole('columnheader', { name }).getAttribute('data-align');
  expect(align('Result')).toBe('end');
  expect(align('Change')).toBe('end');
  expect(align('Note')).toBeNull();
  expect(screen.getByRole('cell', { name: 'Links' })).not.toHaveAttribute('data-fit');
  expect(screen.getByRole('cell', { name: 'up 13' })).toHaveAttribute('data-fit');
});

it('renders a fence as a CodeBlock with its language and copy button', () => {
  const { container } = render(<ProseMarkdown markdown={'```bash\ndocker compose up\n```\n'} />);
  expect(container.querySelector('.cl-code-lang')).toHaveTextContent('bash');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  expect(container.querySelector('code')).toHaveTextContent('docker compose up');
});

it('keeps each FAQ question anchored and its answer, links included, in the page', () => {
  render(
    <MarkdownFaq
      items={[{ question: 'Is it free?', answer: 'See [pricing](/pricing) for the plans.' }]}
    />,
  );
  const question = screen.getByText('Is it free?').closest('details');
  expect(question).toHaveAttribute('id', 's-is-it-free');
  expect(within(question!).getByRole('link', { name: 'pricing', hidden: true })).toHaveAttribute(
    'href',
    '/pricing',
  );
});
