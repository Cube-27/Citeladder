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
  const region = screen.getByRole('region', { name: 'Evidence comparison' });
  expect(within(region).getByRole('cell', { name: 'Not a visit' })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Citation evidence' })).getByRole('cell', {
      name: 'Not a recommendation',
    }),
  ).toBeVisible();
});

it('renders a fence as a CodeBlock with its language and copy button', () => {
  const { container } = render(<ProseMarkdown markdown={'```bash\ndocker compose up\n```\n'} />);
  expect(container.querySelector('.cl-code-lang')).toHaveTextContent('bash');
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
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
