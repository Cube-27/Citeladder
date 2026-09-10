import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectsScreen } from './projects-screen';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    projects: [{ id: 'first-project' }],
    isLoading: false,
  }),
}));

vi.mock('./dashboard-screen', () => ({
  DashboardScreen: () => <div>Project dashboard</div>,
}));

describe('ProjectsScreen', () => {
  /**
   * This screen used to carry onboarding's hand-off: it read `?project=<id>`,
   * selected it, and rewrote the URL to `/projects`. That put a transient id in
   * the address bar for everyone to watch disappear, and it applied the
   * selection one effect-tick after the provider had already resolved a
   * different project — see `ProjectProvider`, which now seeds its pin from
   * storage instead. The screen owns no routing at all.
   */
  it('renders the workspace without touching the address bar', () => {
    render(<ProjectsScreen />);

    expect(screen.getByText('Project dashboard')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
