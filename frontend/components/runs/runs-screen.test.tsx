import { screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vite-plus/test';

import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { promptsApi } from '@/lib/api/prompts';
import { runsApi } from '@/lib/api/runs';
import { makeProject } from '@/test/fixtures/project';
import { auditPage, makeAudit } from '@/test/fixtures/runs';
import { mswServer } from '@/test/msw-server';
import { makePrompt, makeSet, makeSetList } from '@/test/fixtures/prompts';
import { renderWithProviders } from '@/test/render';
import type { Audit, AuditStatus } from '@citeladder/contracts';

import { DISPLAY_TIME_ZONE_COOKIE } from '@/lib/display-timezone';
import { RunsScreen } from './runs-screen';

beforeEach(() => {
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=UTC; Path=/`;
});

afterEach(() => {
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=; Path=/; Max-Age=0`;
});

const project = makeProject();

const audit = (n: number, status: AuditStatus, created_at: string) =>
  makeAudit(n, {
    project_id: project.id,
    workspace_id: project.workspace_id,
    status,
    created_at,
    completed_count: status === 'failed' ? 0 : 10,
    failed_count: status === 'failed' ? 10 : 0,
  });

function serveRuns(audits: readonly Audit[]) {
  const asked: URLSearchParams[] = [];
  mswServer.use(
    http.get('/api/v1/audits', ({ request }) => {
      const params = new URL(request.url).searchParams;
      asked.push(params);
      const statuses = params.getAll('status');
      const shown = audits.filter((run) => !statuses.length || statuses.includes(run.status));
      const page = Number(params.get('page'));
      const size = Number(params.get('page_size'));
      return HttpResponse.json(
        auditPage(audits, {
          items: shown.slice((page - 1) * size, page * size),
          total: shown.length,
        }),
      );
    }),
  );
  return asked;
}

const renderRuns = () =>
  renderWithProviders(<RunsScreen />, {
    projectSelection: {
      projects: [project],
      activeProject: project,
      activeProjectId: project.id,
      status: 'ready',
    },
  });

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterAll(() => mswServer.close());
afterEach(() => {
  mswServer.resetHandlers();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it('opens on the status a deep link names and asks the server for that status', async () => {
  const asked = serveRuns([
    audit(1, 'completed', '2026-08-01T00:00:00Z'),
    audit(2, 'failed', '2026-07-30T00:00:00Z'),
  ]);
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  window.history.replaceState(null, '', `/projects/${project.id}/runs?status=failed`);
  renderRuns();

  const table = within(await screen.findByRole('table', { name: 'All runs' }));
  expect(table.getByRole('link', { name: 'Jul 30, 2026, 12:00 AM · Brand audit' })).toBeVisible();
  expect(
    table.queryByRole('link', { name: 'Aug 1, 2026, 12:00 AM · Brand audit' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Failed/ })).toHaveAttribute('aria-selected', 'true');
  expect(asked.at(-1)?.getAll('status')).toEqual(['failed', 'cancelled']);
});

it('sends the sort and page to the server and returns to page one on a new sort', async () => {
  const user = userEvent.setup();
  const asked = serveRuns(
    Array.from({ length: 25 }, (_, i) => audit(i + 1, 'completed', '2026-08-01T00:00:00Z')),
  );
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  renderRuns();
  await screen.findByRole('table', { name: 'All runs' });
  const last = () => Object.fromEntries(asked.at(-1)!);
  expect(last()).toMatchObject({ sort: 'created', descending: 'true', page: '1', page_size: '10' });

  await user.click(screen.getByRole('button', { name: /next/i }));
  await waitFor(() => expect(last()).toMatchObject({ page: '2' }));

  await user.click(screen.getByRole('button', { name: /Failed/ }));
  await waitFor(() => expect(last()).toMatchObject({ sort: 'failed', page: '1' }));
});

it('shows no rows from the previous status tab while the new one loads', async () => {
  const user = userEvent.setup();
  serveRuns([
    audit(1, 'completed', '2026-08-04T00:00:00Z'),
    audit(2, 'failed', '2026-08-01T00:00:00Z'),
  ]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mswServer.use(
    http.get('/api/v1/audits', async ({ request }) => {
      if (!new URL(request.url).searchParams.getAll('status').includes('failed')) return;
      await held;
    }),
  );
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  renderRuns();
  expect(
    await screen.findByRole('link', { name: 'Aug 4, 2026, 12:00 AM · Brand audit' }),
  ).toBeVisible();

  await user.click(screen.getByRole('tab', { name: /Failed/ }));
  expect(screen.queryByRole('link', { name: 'Aug 4, 2026, 12:00 AM · Brand audit' })).toBeNull();
  release();
  expect(
    await screen.findByRole('link', { name: 'Aug 1, 2026, 12:00 AM · Brand audit' }),
  ).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Aug 4, 2026, 12:00 AM · Brand audit' })).toBeNull();
});

it('counts every run under exactly one status tab', async () => {
  serveRuns([
    audit(1, 'completed', '2026-08-04T00:00:00Z'),
    audit(2, 'partially_completed', '2026-08-03T00:00:00Z'),
    audit(3, 'cancelled', '2026-08-02T00:00:00Z'),
    audit(4, 'failed', '2026-08-01T00:00:00Z'),
  ]);
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  renderRuns();

  await screen.findByRole('table', { name: 'All runs' });
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'All (4)',
    'Completed (1)',
    'Partial (1)',
    'Running (0)',
    'Failed or cancelled (2)',
  ]);
});

it.each([
  ['no active prompt', 'archived', { role: 'link', name: 'Add prompts' }, false],
  ['an active prompt', 'active', { role: 'button', name: 'Launch run' }, true],
] as const)(
  'with no run and %s, the empty state carries the next step and no status tabs',
  async (_label, status, next, schedules) => {
    serveRuns([]);
    vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
    vi.spyOn(promptsApi, 'listPromptSets').mockResolvedValue(
      makeSetList([makeSet([makePrompt({ status })])]),
    );
    renderWithProviders(<RunsScreen />, {
      projectSelection: {
        projects: [project],
        activeProject: project,
        activeProjectId: project.id,
        status: 'ready',
      },
    });

    const heading = await screen.findByRole('heading', { name: 'No runs yet' });
    const empty = within(heading.closest<HTMLElement>('[data-state-block="empty"]')!);
    await waitFor(() =>
      expect(empty.getByRole(next.role, { name: next.name })).not.toHaveAttribute('aria-disabled'),
    );
    expect(screen.queryAllByRole('button', { name: 'Launch run' })).toHaveLength(
      next.name === 'Launch run' ? 1 : 0,
    );
    if (schedules) await screen.findByRole('heading', { name: 'Scheduled audits' });
    else expect(screen.queryByRole('heading', { name: 'Scheduled audits' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Completed/ })).toBeNull();
  },
);
