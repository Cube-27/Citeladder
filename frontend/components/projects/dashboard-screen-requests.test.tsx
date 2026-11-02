import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

const project = makeProject();
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: project, isLoading: false }),
  useOptionalProjectContext: () => ({ activeProjectId: project.id }),
  useWorkspaceCapability: () => true,
  useActiveWorkspaceId: () => project.workspace_id,
}));

import { DashboardScreen } from './dashboard-screen';

const root = `/api/v1/projects/${project.id}`;

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Overview opening requests', () => {
  it('asks for the layout and its widgets while the command center is still loading', async () => {
    const asked: string[] = [];
    mswServer.use(
      // Never answers, so anything else asked for was asked beside it.
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
          ],
          version: 0,
          customized: false,
          updated_at: null,
        });
      }),
      http.get(`${root}/visibility/prompts`, () => {
        asked.push('prompts');
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<DashboardScreen />);

    await vi.waitFor(() =>
      expect([...asked].sort()).toEqual(['command-center', 'layout', 'prompts']),
    );
    // Still behind the command center: none of the Overview has painted.
    expect(screen.queryByRole('heading', { name: project.name })).not.toBeInTheDocument();
  });
});
