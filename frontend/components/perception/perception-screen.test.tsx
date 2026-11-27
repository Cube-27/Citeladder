import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { queryKeys } from '@/lib/api/query-keys';
import { makeProject } from '@/test/fixtures/project';
import { auditPage, makeAudit } from '@/test/fixtures/runs';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { PerceptionScreen } from './perception-screen';

const project = makeProject();
const BASE = `/api/v1/projects/${project.id}`;
const RUN = makeAudit(1, {
  project_id: project.id,
  workspace_id: project.workspace_id,
  completed_at: new Date().toISOString(),
});

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  window.history.replaceState(null, '', '/');
});
afterAll(() => mswServer.close());

function held() {
  let release = () => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { done, release };
}

function serve({
  dashboard = Promise.resolve(),
  brandFacts = Promise.resolve(),
  pilot = false,
}: Readonly<{ dashboard?: Promise<void>; brandFacts?: Promise<void>; pilot?: boolean }> = {}) {
  const asked: URL[] = [];
  let dashboardReads = 0;
  mswServer.use(
    http.get('/api/v1/*', ({ request }) => {
      asked.push(new URL(request.url));
    }),
    http.get('/api/v1/audits', () => HttpResponse.json(auditPage([RUN]))),
    http.get(`${BASE}/brand-facts`, async () => {
      await brandFacts;
      return HttpResponse.json({
        enabled: pilot,
        facts: [],
        limits: { statement_max_chars: 280, facts_import_max_rows: 100 },
      });
    }),
    http.get(`${BASE}/visibility`, async () => {
      await dashboard;
      dashboardReads += 1;
      return HttpResponse.json({
        project_id: project.id,
        audit_id: RUN.id,
        audit_status: 'completed',
        analyzer_version: 'v1',
        scoring_rule_version: 'v1',
        total_completed: 1,
        total_failed: 0,
        visibility_score: null,
        selection_mode: 'range',
        source_audit_ids: [RUN.id],
        from_at: null,
        to_at: `2026-11-27T10:00:0${dashboardReads}.000Z`,
        rankings: [],
        per_engine: [],
        avg_position: null,
        created_at: '2026-11-27T10:00:00.000Z',
      });
    }),
    http.get('/api/v1/*', () =>
      HttpResponse.json({ error: { message: 'not here' } }, { status: 404 }),
    ),
  );
  const paths = () => asked.map((url) => url.pathname);
  const reads = (path: string) => asked.filter((url) => url.pathname === `${BASE}/${path}`);
  return { asked, paths, reads };
}

const renderScreen = (search: string) => {
  window.history.replaceState(null, '', `/perception${search}`);
  return renderWithProviders(<PerceptionScreen />, {
    projectSelection: {
      projects: [project],
      activeProject: project,
      activeProjectId: project.id,
      status: 'ready',
    },
  });
};

describe('PerceptionScreen reads', () => {
  it('asks for Brand perception once the runs list answers, without waiting on the dashboard', async () => {
    const dashboard = held();
    const { reads } = serve({ dashboard: dashboard.done });
    renderScreen('');

    await waitFor(() => expect(reads('visibility/perception')).toHaveLength(1));
    expect(reads('visibility')).toHaveLength(1);
    dashboard.release();
  });

  it('mounts no dashboard read on a probe tab, and one on Brand', async () => {
    const { reads, paths } = serve();
    renderScreen('?tab=market');
    await waitFor(() => expect(paths()).toContain(`${BASE}/brand-facts`));
    expect(reads('visibility')).toHaveLength(0);
    expect(reads('visibility/perception')).toHaveLength(0);

    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Brand' }));
    await waitFor(() => expect(reads('visibility')).toHaveLength(1));
  });

  it('holds a fact-checking deep link until brand facts answer, then reads accuracy and never Brand perception', async () => {
    const brandFacts = held();
    const { reads, paths } = serve({ brandFacts: brandFacts.done, pilot: true });
    renderScreen('?tab=fact-checking');
    await waitFor(() => expect(paths()).toContain(`${BASE}/brand-facts`));
    expect(reads('visibility/perception')).toHaveLength(0);
    expect(reads('visibility')).toHaveLength(0);

    brandFacts.release();
    await waitFor(() => expect(reads('visibility/accuracy')).toHaveLength(1));
    expect(reads('visibility/perception')).toHaveLength(0);
  });

  it.each([
    ['90d', ''],
    ['all', '?range=all&selection=range'],
  ])(
    'keeps the %s perception and accuracy reads on one key across a dashboard refetch, with a to bound',
    async (_range, search) => {
      const { reads } = serve({ pilot: true });
      const { queryClient } = renderScreen(search);
      await waitFor(() => expect(reads('visibility/accuracy')).toHaveLength(1));
      await waitFor(() => expect(reads('visibility/perception')).toHaveLength(1));

      await queryClient.invalidateQueries({
        queryKey: queryKeys.visibility.resource(project.id, 'selection'),
      });
      await waitFor(() => expect(reads('visibility')).toHaveLength(2));

      const cached = (resource: string) =>
        queryClient.getQueryCache().findAll({
          queryKey: queryKeys.visibility.resource(project.id, resource),
        }).length;
      expect([cached('perception'), cached('accuracy')]).toEqual([1, 1]);
      const sent = reads('visibility/perception')[0]!.searchParams;
      expect(sent.get('to')).toMatch(/T00:00:00\.000Z$/);
      expect(sent.has('from')).toBe(search === '');
    },
  );
});
