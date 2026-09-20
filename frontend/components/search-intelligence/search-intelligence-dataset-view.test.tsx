import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it } from 'vite-plus/test';

import type { SearchIntelligenceDataset } from '@/lib/api/search-intelligence';
import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders, testProjectSelection } from '@/test/render';
import { SearchIntelligenceDatasetView } from './search-intelligence-dataset-view';

const project = makeProject();
const dataset: SearchIntelligenceDataset = {
  id: 'a5df36ea-cb35-40f9-a7a9-a50ff7309cf1',
  run_id: '72dbc77c-676f-4bf7-8c29-16f163cb09f5',
  dataset_kind: 'ranking_keywords',
  target_domain: 'example.com',
  target_hostname: 'example.com',
  target_origin: 'https://example.com',
  comparison_origin: '',
  location_code: 2840,
  language_code: 'en',
  status: 'published',
  coverage: 'complete',
  requested_rows: 201,
  raw_rows_received: 201,
  unique_rows_saved: 201,
  provider_total: 201,
  truncated: false,
  summary: {},
  collection_started_at: null,
  collection_ended_at: null,
  published_at: null,
};
function row(id: string, keyword: string) {
  return {
    id,
    dataset_id: dataset.id,
    call_id: null,
    row_kind: 'ranking_keywords',
    keyword,
    domain: '',
    url: '',
    search_volume: null,
    difficulty: null,
    intent: '',
    rank_group: null,
    owned_rank_group: null,
    etv: null,
    backlinks: null,
    referring_main_domains: null,
    dataforseo_rank: null,
    auxiliary: {},
  };
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

it('loads the next cursor page while retaining existing rows', async () => {
  const cursor = 'page+/=';
  const cursors: Array<string | null> = [];
  mswServer.use(
    http.get(
      `/api/v1/projects/${project.id}/search-intelligence/datasets/${dataset.id}/rows`,
      ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get('limit')).toBe('200');
        cursors.push(params.get('cursor'));
        return HttpResponse.json({
          dataset,
          rows: [
            params.has('cursor')
              ? row('33333333-3333-4333-8333-333333333333', 'Later keyword')
              : row('44444444-4444-4444-8444-444444444444', 'First keyword'),
          ],
          next_cursor: params.has('cursor') ? null : cursor,
        });
      },
    ),
  );
  renderWithProviders(<SearchIntelligenceDatasetView dataset={dataset} />, {
    projectSelection: testProjectSelection({ activeProject: project, activeProjectId: project.id }),
  });

  expect(await screen.findByText('First keyword')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Load more rows' }));
  expect(await screen.findByText('Later keyword')).toBeInTheDocument();
  expect(screen.getByText('First keyword')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Load more rows' })).not.toBeInTheDocument();
  expect(cursors).toEqual([null, cursor]);
});
