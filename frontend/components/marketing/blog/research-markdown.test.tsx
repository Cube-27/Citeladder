import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

import { ResearchMarkdown, researchHeadings } from './research-markdown';

it('renders a source-backed comparison with working contents and references', () => {
  const markdown = `## Evidence comparison

An observed result [\\[1\\]](#source-1) is not a guarantee.

| Observation | Limit |
|---|---|
| Mention | Not a visit |

### Citation evidence

| Observation | Limit |
|---|---|
| Source link | Not a recommendation |

## Sources

1. <span id="source-1"></span> [Original report](https://example.com/report), historical evidence.
`;
  render(<ResearchMarkdown markdown={markdown} />);
  const heading = screen.getByRole('heading', { name: 'Evidence comparison' });
  expect(heading.id).toBe(researchHeadings(markdown)[0].slug);
  const citation = screen.getByRole('link', { name: '[1]' });
  const source = document.querySelector(citation.getAttribute('href')!);
  expect(source).toHaveTextContent('historical evidence');
  expect(
    within(source as HTMLElement).getByRole('link', { name: 'Original report' }),
  ).toHaveAttribute('href', 'https://example.com/report');
  const region = screen.getByRole('region', { name: 'Evidence comparison' });
  expect(within(region).getByRole('cell', { name: 'Not a visit' })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Citation evidence' })).getByRole('cell', {
      name: 'Not a recommendation',
    }),
  ).toBeVisible();
});
