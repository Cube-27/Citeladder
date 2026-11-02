import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';

import { makeSiteCrawl } from '@/test/fixtures/site-health';
import { mswServer } from '@/test/msw-server';
import { prefetchRoute } from './route-prefetch';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CRAWL_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT = {
  projectId: PROJECT_ID,
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

vi.mock('@/lib/api/demand', () => ({
  demandApi: { getLatest: vi.fn(async () => ({ id: 'snapshot' })) },
}));

import { demandApi } from '@/lib/api/demand';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('prefetchRoute', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  });

  it('does nothing without an active project', () => {
    prefetchRoute(client, '/demand', null);
    expect(demandApi.getLatest).not.toHaveBeenCalled();
  });

  it('warms the Search Demand snapshot on intent', async () => {
    prefetchRoute(client, '/demand', PROJECT);
    await vi.waitFor(() => expect(demandApi.getLatest).toHaveBeenCalledTimes(1));
  });

  /**
   * Search Demand renders a settled "no snapshot exists yet" alert from a 404.
   * Re-driving that key would reset `error` → `pending`, so the alert would be
   * replaced by the full-page skeleton for the length of the repeat request.
   */
  it('warms the Website page preview as soon as the dashboard names its crawl', async () => {
    const crawl = makeSiteCrawl({
      id: CRAWL_ID,
      workspace_id: PROJECT.workspaceId,
      project_id: PROJECT_ID,
      status: 'completed',
    });
    const asked: string[] = [];
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT_ID}/site-health`, () => {
        asked.push('dashboard');
        return HttpResponse.json({
          project_id: PROJECT_ID,
          crawl,
          score_summary: null,
          phase: 'dashboard',
          snapshot_id: null,
          quota: { used: 1, limit: 50 },
          root_errors: [],
        });
      }),
      http.get(`/api/v1/site-crawls/${CRAWL_ID}/pages`, ({ request }) => {
        asked.push('pages ' + new URL(request.url).search);
        return HttpResponse.json({ error: { message: 'not here' } }, { status: 404 });
      }),
    );
    prefetchRoute(client, '/site', PROJECT);

    // The page browser's first page names its default sort, so the warmed
    // preview must too or it fills an entry the browser never reads.
    await vi.waitFor(() =>
      expect(asked).toEqual(['dashboard', 'pages ?limit=10&monitored=true&sort=status']),
    );
  });

  it('warms the Overview layout beside the command center, then the reads its widgets make', async () => {
    const root = `/api/v1/projects/${PROJECT_ID}`;
    const asked: string[] = [];
    mswServer.use(
      // Never answers: everything else must already have been asked for.
      http.get(`${root}/command-center`, () => {
        asked.push('command-center');
        return new Promise<never>(() => {});
      }),
      http.get(`${root}/overview/layout`, () => {
        asked.push('layout');
        return HttpResponse.json({
          widgets: [
            { key: 'project_state', size: 'half' },
            { key: 'missing_prompts', size: 'full' },
            { key: 'visibility_trend', size: 'half' },
            { key: 'ai_traffic', size: 'half' },
            { key: 'search_console', size: 'half' },
          ],
          version: 0,
          customized: true,
          updated_at: null,
        });
      }),
      http.get(`${root}/visibility/prompts`, () => {
        asked.push('prompts');
        return HttpResponse.json([]);
      }),
      http.get(`${root}/visibility/trends`, ({ request }) => {
        asked.push('trends ' + new URL(request.url).search);
        return HttpResponse.json([]);
      }),
      http.get(`${root}/ai-traffic/overview`, ({ request }) => {
        asked.push('traffic ' + new URL(request.url).search);
        return HttpResponse.json({});
      }),
      http.get(`${root}/performance`, () => {
        asked.push('performance');
        return HttpResponse.json({});
      }),
    );

    prefetchRoute(client, '/projects', PROJECT);

    await vi.waitFor(() =>
      expect([...asked].sort()).toEqual([
        'command-center',
        'layout',
        'performance',
        'prompts',
        'traffic ?range=30d',
        'trends ?cohort=core',
      ]),
    );
  });

  it('does not ask for a widget read that needs a measured run when there is none', async () => {
    const root = `/api/v1/projects/${PROJECT_ID}`;
    const asked: string[] = [];
    mswServer.use(
      http.get(`${root}/command-center`, () => new Promise<never>(() => {})),
      http.get(`${root}/overview/layout`, () =>
        HttpResponse.json({
          widgets: [{ key: 'perception', size: 'half' }],
          version: 0,
          customized: true,
          updated_at: null,
        }),
      ),
      http.get(`${root}/visibility`, () => {
        asked.push('visibility');
        return HttpResponse.json(
          { error: { message: 'No visibility metrics available for the selected measurement' } },
          { status: 404 },
        );
      }),
      http.get(`${root}/visibility/perception`, () => {
        asked.push('perception');
        return HttpResponse.json({});
      }),
    );

    prefetchRoute(client, '/projects', PROJECT);

    await vi.waitFor(() =>
      expect(
        client.getQueryData([
          'visibility',
          'project',
          PROJECT_ID,
          'latest',
          { cohort: 'core', selection_mode: 'latest' },
        ]),
      ).toBe(null),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(asked).toEqual(['visibility']);
  });

  it('leaves an already-failed query untouched so a settled error cannot flicker', async () => {
    vi.mocked(demandApi.getLatest).mockRejectedValueOnce(new Error('404'));
    await client
      .fetchQuery({
        queryKey: ['demand', PROJECT_ID, 'latest'],
        queryFn: () => demandApi.getLatest(PROJECT_ID),
      })
      .catch(() => undefined);

    const query = client.getQueryCache().find({ queryKey: ['demand', PROJECT_ID, 'latest'] });
    expect(query?.state.status).toBe('error');
    const callsAfterFailure = vi.mocked(demandApi.getLatest).mock.calls.length;

    prefetchRoute(client, '/demand', PROJECT);
    await Promise.resolve();

    expect(vi.mocked(demandApi.getLatest).mock.calls).toHaveLength(callsAfterFailure);
    expect(query?.state.status).toBe('error');
  });
});
