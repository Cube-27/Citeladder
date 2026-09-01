import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsScreen } from './projects-screen';

const { replace, setActiveProjectId } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActiveProjectId: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('project=new-project&source=onboarding'),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    projects: [{ id: 'first-project' }],
    isLoading: false,
    setActiveProjectId,
  }),
}));

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: () => <div>Project dashboard</div>,
}));

describe('ProjectsScreen', () => {
  it('selects the onboarding project in the app provider and clears the handoff', async () => {
    render(<ProjectsScreen />);

    expect(screen.getByText('Project dashboard')).toBeInTheDocument();
    await waitFor(() => expect(setActiveProjectId).toHaveBeenCalledWith('new-project'));
    expect(replace).toHaveBeenCalledWith('/projects?source=onboarding', { scroll: false });
  });
});
