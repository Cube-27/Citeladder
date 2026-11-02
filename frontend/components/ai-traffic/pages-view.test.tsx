import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it } from 'vite-plus/test';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { TrafficPages } from './pages-view';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PAGES = `/api/v1/projects/${PROJECT}/ai-traffic/pages`;

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const unavailable = {
  state: 'not_connected' as const,
  value: null,
  coverage: null,
  reason: null,
};
const coverage = {
  label: 'Observed crawl coverage',
  state: 'unknown',
  share: null,
  known_pages: 200,
  observed_pages: null,
  inventory_date: null,
  inventory_complete: false,
  sample_mode: false,
};
function pathRow(slug: string) {
  return {
    url_hash: slug,
    canonical_url: `https://example.test/${slug}`,
    display_path: `/${slug}`,
    folder: '/',
    resource_class: 'html',
    crawl: { state: 'zero', value: 0, coverage: 'complete', reason: null },
    referrals: unavailable,
    citations: unavailable,
    findings: unavailable,
    key_events: 0,
    last_crawl: null,
    errors_4xx: 0,
    errors_5xx: 0,
  };
}
function pagesBody(items: unknown[], nextCursor: string | null = null) {
  return {
    window_start: '2026-01-01',
    window_end: '2026-01-28',
    next_cursor: nextCursor,
    observed_crawl_coverage: coverage,
    items,
  };
}
function renderPages() {
  return renderWithProviders(
    <TrafficPages workspaceId={WORKSPACE} projectId={PROJECT} filters={{ range: '30d' }} />,
  );
}

it('keeps inventory, zero, partial values and distinct unavailable reasons readable', async () => {
  mswServer.use(
    http.get(PAGES, () =>
      HttpResponse.json(
        pagesBody([
          {
            ...pathRow('long-page'),
            crawl: unavailable,
            referrals: { state: 'zero', value: 0, coverage: 'complete', reason: null },
            citations: { state: 'value', value: 12, coverage: 'partial', reason: 'limited_window' },
            findings: { state: 'value', value: 1, coverage: null, reason: null },
            errors_4xx: null,
            errors_5xx: null,
          },
          {
            ...pathRow('second'),
            crawl: { state: 'unknown', value: null, coverage: 'partial', reason: 'missing_days' },
            key_events: null,
            errors_5xx: null,
          },
        ]),
      ),
    ),
  );
  const user = userEvent.setup();
  renderPages();
  const row = await screen.findByRole('row', { name: /long-page/ });
  expect(within(row).getAllByRole('cell', { name: '0' })).toHaveLength(2);
  expect(within(row).getByRole('cell', { name: '1' })).toBeVisible();
  const partial = within(row).getByRole('button', {
    name: '12 citations',
  });
  expect(partial).toHaveTextContent('12Partial');
  const missing = within(row).getByRole('button', { name: 'Unavailable requests' });
  expect(missing).toHaveTextContent('–');
  act(() => missing.focus());
  expect(await screen.findByRole('tooltip')).toHaveTextContent('requests: Not connected');
  await user.keyboard('{Escape}');
  expect(within(row).getByRole('button', { name: /4xx and 5xx unavailable/ })).toHaveTextContent(
    '–',
  );
  const second = screen.getByRole('row', { name: /\/second/ });
  expect(
    within(second).getByRole('button', { name: '5xx unavailable' }).closest('td'),
  ).toHaveTextContent('0 / –');
  expect(screen.getByText(/Crawl coverage unknown · 200 known pages/)).toBeVisible();
});

it('keeps the rows and the pager on screen while the next page loads', async () => {
  let releaseSecond!: () => void;
  const secondHeld = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const asked: string[] = [];
  const firstPage = Array.from({ length: 10 }, (_, index) => pathRow(`first-${index + 1}`));
  mswServer.use(
    http.get(PAGES, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      asked.push(`${params.get('cursor') ?? 'first'}:${params.get('limit')}`);
      if (params.get('cursor') !== 'page-2')
        return HttpResponse.json(pagesBody(firstPage, 'page-2'));
      await secondHeld;
      return HttpResponse.json(pagesBody([pathRow('second-1')]));
    }),
  );
  const user = userEvent.setup();
  renderPages();
  const table = await screen.findByRole('table', {
    name: 'Path-level AI Traffic with separate signal units',
  });
  expect(await within(table).findByRole('row', { name: /first-1\b/ })).toBeVisible();
  expect(screen.getByText('1–10 paths')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(asked).toEqual(['first:10', 'page-2:10']));
  // The next page is in flight: the first page's rows, the coverage line and
  // the pager stay where they were, with navigation paused.
  expect(within(table).getByRole('row', { name: /first-10\b/ })).toBeVisible();
  expect(screen.getByText(/Crawl coverage unknown · 200 known pages/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.queryByText('Loading paths…')).not.toBeInTheDocument();

  releaseSecond();
  expect(await within(table).findByRole('row', { name: /second-1\b/ })).toBeVisible();
  expect(within(table).queryByRole('row', { name: /first-1\b/ })).not.toBeInTheDocument();
  expect(screen.getByText('11–11 paths')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
});
