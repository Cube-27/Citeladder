import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { agentViewHref } from '@/lib/agent/view-links';
import { mswServer } from '@/test/msw-server';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

import { ThreadViews } from './thread-views';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CRAWL = '33333333-3333-4333-8333-333333333333';
const MARKET = '44444444-4444-4444-8444-444444444444';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Agent thread views', () => {
  it('links each view to the screen that shows the same selection', () => {
    expect([
      agentViewHref({ kind: 'visibility_trend', market_id: MARKET, topic_id: null, range: '1y' }),
      agentViewHref({ kind: 'visibility_ranking', market_id: null, topic_id: null }),
      agentViewHref({ kind: 'visibility_sources', market_id: MARKET, topic_id: null }),
      agentViewHref({ kind: 'site_health_summary', crawl_id: CRAWL }),
      agentViewHref({ kind: 'ai_traffic_overview', range: '30d' }),
      agentViewHref({ kind: 'keyword_research_rows', dataset_id: CRAWL }, 'missing_keywords'),
      agentViewHref({ kind: 'keyword_research_rows', dataset_id: CRAWL }),
    ]).toEqual([
      `/insights?market=${MARKET}&range=1y`,
      '/competitors',
      `/visibility?tab=domains&market=${MARKET}`,
      `/site?crawl_id=${CRAWL}`,
      '/ai-traffic?tab=overview&range=30d',
      '/search-intelligence?tab=keywords',
      '/search-intelligence',
    ]);
  });

  it('shows a removed record as unavailable, not as a failed read to retry', async () => {
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/site-health`, () =>
        HttpResponse.json({ detail: 'Crawl not found' }, { status: 404 }),
      ),
    );
    renderWithProviders(
      <ThreadViews
        scope={{ workspaceId: WORKSPACE, projectId: PROJECT }}
        views={[{ kind: 'site_health_summary', crawl_id: CRAWL }]}
      />,
      {
        projectSelection: {
          activeProjectId: PROJECT,
          activeProject: makeProject({ id: PROJECT }),
          status: 'ready',
        },
      },
    );
    expect(await screen.findByText(/This view is unavailable/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: /retry/iu })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in app' })).toHaveAttribute(
      'href',
      `/site?crawl_id=${CRAWL}&project=${PROJECT}`,
    );
  });

  it('asks for a keyword dataset largest first, not in row id order', async () => {
    const dataset = {
      id: CRAWL,
      run_id: MARKET,
      dataset_kind: 'ranking_keywords',
      target_domain: 'example.com',
      target_hostname: 'example.com',
      target_origin: 'https://example.com',
      research_scope: 'exact_host',
      acquisition: {},
      comparison_origin: '',
      location_code: 2840,
      language_code: 'en',
      status: 'published',
      coverage: 'complete',
      requested_rows: 1,
      raw_rows_received: 1,
      unique_rows_saved: 1,
      provider_total: 1,
      truncated: false,
      summary: {},
      collection_started_at: null,
      collection_ended_at: null,
      published_at: null,
    };
    const row = {
      id: WORKSPACE,
      dataset_id: CRAWL,
      call_id: null,
      row_kind: 'ranking_keywords',
      keyword: 'school shoes',
      domain: '',
      url: '',
      search_volume: 3600,
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
    const orders: string[] = [];
    mswServer.use(
      http.get(
        `/api/v1/projects/${PROJECT}/search-intelligence/datasets/${CRAWL}/rows`,
        ({ request }) => {
          const params = new URL(request.url).searchParams;
          orders.push(`${params.get('sort')} ${params.get('direction')} ${params.get('limit')}`);
          return HttpResponse.json({ dataset, rows: [row], next_cursor: null });
        },
      ),
    );
    renderWithProviders(
      <ThreadViews
        scope={{ workspaceId: WORKSPACE, projectId: PROJECT }}
        views={[{ kind: 'keyword_research_rows', dataset_id: CRAWL }]}
      />,
      {
        projectSelection: {
          activeProjectId: PROJECT,
          activeProject: makeProject({ id: PROJECT }),
          status: 'ready',
        },
      },
    );
    expect(await screen.findByRole('cell', { name: '3,600' })).toBeVisible();
    expect(orders.at(-1)).toBe('search_volume desc 10');
  });
});
