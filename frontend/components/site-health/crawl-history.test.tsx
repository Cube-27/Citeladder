import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeSiteCrawl } from '@/test/fixtures/site-health';
import { CrawlHistory } from './crawl-history';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const SITE = '22222222-2222-4222-8222-222222222222';
const SINGLE = '33333333-3333-4333-8333-333333333333';
const PAIR = '44444444-4444-4444-8444-444444444444';
const PAGE = '55555555-5555-4555-8555-555555555555';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const listed = (id: string, run: unknown) => ({
  ...makeSiteCrawl({ id, workspace_id: WORKSPACE, project_id: PROJECT }),
  run,
});

describe('CrawlHistory', () => {
  it('lists re-audits as their own rows and opens the page a one-page run audited', async () => {
    mswServer.use(
      http.get('/api/v1/site-crawls', () =>
        HttpResponse.json({
          items: [
            listed(SINGLE, { kind: 'page', site_url_id: PAGE }),
            listed(PAIR, { kind: 'pages', page_count: 2 }),
            listed(SITE, { kind: 'site' }),
          ],
          next_cursor: null,
        }),
      ),
    );
    renderWithProviders(<CrawlHistory workspaceId={WORKSPACE} projectId={PROJECT} />);

    const table = await screen.findByRole('table', { name: 'Crawls' });
    await within(table).findAllByRole('link');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) => [
        within(row).getByRole('link').getAttribute('href'),
        within(row).queryByText('Re-audit') !== null,
      ]),
    ).toEqual([
      [`/site/crawls/${SINGLE}/pages/${PAGE}`, true],
      ['/site?tab=pages', true],
      ['/site?tab=pages', false],
    ]);
  });
});
