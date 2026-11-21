import { screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders, selectionAs, type TestRole } from '@/test/render';
import { ProjectsScreen } from './projects-screen';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function renderProjects({
  projects,
  projectSlots,
  role = 'owner',
}: {
  projects: ReturnType<typeof makeProject>[];
  projectSlots: number | null;
  role?: TestRole;
}) {
  return renderWithProviders(
    <>
      <ProjectsScreen />
      <Location />
    </>,
    {
      initialEntries: ['/projects'],
      projectSelection: { ...selectionAs(role), projects },
      entitlement: projectSlots === null ? { status: 'entitlement_unresolved' } : { projectSlots },
    },
  );
}

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: ({ onEditProject }: { onEditProject?: (project: unknown) => void }) => (
    <div>
      Project dashboard
      {onEditProject ? <button type="button">Edit project</button> : null}
    </div>
  ),
}));

describe('ProjectsScreen', () => {
  it.each([null, 0, 1])(
    'admits the empty-workspace creation action only with a confirmed slot (%s)',
    async (remaining) => {
      renderProjects({ projects: [], projectSlots: remaining });
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
    const view = renderProjects({ projects: [makeProject()], projectSlots: 1, role: 'viewer' });
    expect(screen.getByText('Project dashboard')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit project' })).toBeNull();
    view.unmount();

    renderProjects({ projects: [], projectSlots: 1, role: 'viewer' });
    expect(screen.getByText('No projects yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add project' })).toBeNull();
  });
});
