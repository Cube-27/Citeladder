import { screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import type { Audit } from '@citeladder/contracts';
import { runsApi } from '@/lib/api/runs';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

import { RunsScreen } from './runs-screen';

const project = makeProject();

function audit(n: number, status: Audit['status'], created_at: string): Audit {
  return {
    id: `0000000${n}-1111-4111-8111-111111111111`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    parent_audit_id: null,
    status,
    cancelable: false,
    benchmark_mode: 'consumer_like',
    audit_scope: 'brand',
    model_provenance: [],
    repetitions: 1,
    random_seed: 'seed',
    requested_count: 10,
    completed_count: status === 'failed' ? 0 : 10,
    failed_count: status === 'failed' ? 10 : 0,
    error_message: '',
    engine_snapshots: [],
    market: { id: null, country_code: 'US', language_code: 'en' },
    launch_id: null,
    not_applicable_engines: [],
    created_at,
    updated_at: created_at,
    started_at: created_at,
    completed_at: created_at,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it('opens on the status a deep link names', async () => {
  vi.spyOn(runsApi, 'listAudits').mockResolvedValue([
    audit(1, 'completed', '2026-08-01T00:00:00Z'),
    audit(2, 'failed', '2026-07-30T00:00:00Z'),
  ]);
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  window.history.replaceState(null, '', `/projects/${project.id}/runs?status=failed`);
  renderWithProviders(<RunsScreen />, {
    projectSelection: {
      projects: [project],
      activeProject: project,
      activeProjectId: project.id,
      status: 'ready',
    },
  });

  const table = within(await screen.findByRole('table', { name: 'All runs' }));
  expect(table.getByRole('link', { name: 'Brand audit · Jul 30, 2026' })).toBeVisible();
  expect(table.queryByRole('link', { name: 'Brand audit · Aug 1, 2026' })).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Failed/ })).toHaveAttribute('aria-checked', 'true');
});

it('carries Launch run in the empty state, once, when there is no run yet', async () => {
  vi.spyOn(runsApi, 'listAudits').mockResolvedValue([]);
  vi.spyOn(runsApi, 'listSchedules').mockResolvedValue([]);
  renderWithProviders(<RunsScreen />, {
    projectSelection: {
      projects: [project],
      activeProject: project,
      activeProjectId: project.id,
      status: 'ready',
    },
  });

  const heading = await screen.findByRole('heading', { name: 'No runs yet' });
  const empty = heading.closest<HTMLElement>('[data-state-block="empty"]')!;
  expect(within(empty).getByRole('button', { name: 'Launch run' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Launch run' })).toHaveLength(1);
});
