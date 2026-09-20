import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vite-plus/test';

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
afterEach(() => {
  mswServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => mswServer.close());

it('shows a storage failure instead of losing a content handoff', async () => {
  mswServer.use(
    http.get(`/api/v1/projects/${project.id}/search-intelligence/datasets/${dataset.id}/rows`, () =>
      HttpResponse.json({
        dataset,
        rows: [row('33333333-3333-4333-8333-333333333333', 'Keyword')],
        next_cursor: null,
      }),
    ),
    http.post(`/api/v1/projects/${project.id}/search-intelligence/content-handoff`, () =>
      HttpResponse.json({ project_id: project.id, evidence: [], user_instructions: 'Write this' }),
    ),
  );
  renderWithProviders(<SearchIntelligenceDatasetView dataset={dataset} />, {
    projectSelection: testProjectSelection({ activeProject: project, activeProjectId: project.id }),
  });
  await userEvent.click(await screen.findByRole('checkbox'));
  await userEvent.type(screen.getByRole('textbox', { name: 'Content instructions' }), 'Write this');
  vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(() => {
    throw new Error('Storage is full');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Write content from 1 selected row' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full');
});

it('uses shared pagination and resets its cursor when sorting or changing rows per page', async () => {
  const cursor = 'page+/=';
  const cursors: Array<string | null> = [];
  const requests: URLSearchParams[] = [];
  mswServer.use(
    http.get(
      `/api/v1/projects/${project.id}/search-intelligence/datasets/${dataset.id}/rows`,
      ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(params);
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
  expect(requests[0].get('limit')).toBe('10');
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(await screen.findByText('Later keyword')).toBeInTheDocument();
  expect(screen.queryByText('First keyword')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  expect(cursors).toEqual([null, cursor]);
  await userEvent.click(screen.getByRole('button', { name: 'Keyword' }));
  await waitFor(() => expect(requests.at(-1)?.get('sort')).toBe('keyword'));
  expect(requests.at(-1)?.has('cursor')).toBe(false);
  expect(await screen.findByRole('columnheader', { name: 'Keyword' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keyword' }));
  await waitFor(() => expect(requests.at(-1)?.get('direction')).toBe('desc'));
  await userEvent.click(
    await screen.findByRole('combobox', { name: 'Rows per page for evidence rows' }),
  );
  await userEvent.click(await screen.findByRole('option', { name: '25' }));
  await waitFor(() => expect(requests.at(-1)?.get('limit')).toBe('25'));
  expect(requests.at(-1)?.has('cursor')).toBe(false);
});
