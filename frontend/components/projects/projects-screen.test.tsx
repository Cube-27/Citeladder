import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { ProjectsScreen } from './projects-screen';

const { selection, capacity } = vi.hoisted(() => ({
  selection: vi.fn(),
  capacity: { remaining: null as number | null, write: true },
}));
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
vi.mock('@/lib/project/project-context', () => ({
  useWorkspaceCapability: (capability: string) => capability !== 'write' || capacity.write,
  useActiveWorkspaceId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  useProjectContext: selection,
}));
vi.mock('@/lib/billing/entitlement-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/entitlement-context')>()),
  useEntitlement: () => ({
    entitlement:
      capacity.remaining === null
        ? null
        : {
            status: 'resolved',
            occupancy: [{ key: 'project_slots', remaining: capacity.remaining }],
          },
  }),
}));

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: ({ onEditProject }: { onEditProject?: (project: unknown) => void }) => (
    <div>
      Project dashboard
      {onEditProject ? <button type="button">Edit project</button> : null}
    </div>
  ),
}));

describe('ProjectsScreen', () => {
  beforeEach(() => {
    selection.mockReturnValue({
      projects: [{ id: 'first-project' }],
      projectsSettled: true,
      activeWorkspaceId: WORKSPACE,
      isLoading: false,
    });
    capacity.remaining = null;
    capacity.write = true;
  });

  it.each([null, 0, 1])(
    'admits the empty-workspace creation action only with a confirmed slot (%s)',
    async (remaining) => {
      capacity.remaining = remaining;
      selection.mockReturnValue({
        projects: [],
        projectsSettled: true,
        activeWorkspaceId: WORKSPACE,
        isLoading: false,
      });
      function Location() {
        const location = useLocation();
        return <p data-testid="location">{location.pathname + location.search}</p>;
      }
      render(
        <MemoryRouter initialEntries={['/projects']}>
          <ProjectsScreen />
          <Location />
        </MemoryRouter>,
      );
      const button = screen.getByRole('button', { name: 'Add project' });
      if (remaining === 1) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
      await userEvent.setup().click(button);
      expect(screen.getByTestId('location')).toHaveTextContent(
        remaining === 1 ? `/onboarding?new=1&workspace=${WORKSPACE}` : '/projects',
      );
    },
  );

  it('offers a Viewer neither project editing nor project creation', () => {
    capacity.write = false;
    capacity.remaining = 1;
    const view = render(
      <MemoryRouter initialEntries={['/projects']}>
        <ProjectsScreen />
      </MemoryRouter>,
    );
    expect(screen.getByText('Project dashboard')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit project' })).toBeNull();

    selection.mockReturnValue({
      projects: [],
      projectsSettled: true,
      activeWorkspaceId: WORKSPACE,
      isLoading: false,
    });
    view.rerender(
      <MemoryRouter initialEntries={['/projects']}>
        <ProjectsScreen />
      </MemoryRouter>,
    );
    expect(screen.getByText('No projects yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add project' })).toBeNull();
  });
});
