import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsScreen } from './projects-screen';

vi.mock('@/lib/project/project-context', () => ({
  useActiveWorkspaceId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  useProjectContext: () => ({
    projects: [{ id: 'first-project' }],
    isLoading: false,
  }),
}));

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: () => <div>Project dashboard</div>,
}));

describe('ProjectsScreen', () => {
  it('renders the workspace dashboard when a project is available', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <ProjectsScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText('Project dashboard')).toBeInTheDocument();
  });
});
