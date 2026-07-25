import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/lib/api/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

// The gate reads only projects + isLoading from context.
let contextValue = { projects: [] as Project[], isLoading: false };
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => contextValue,
}));

import { OnboardingGate } from './onboarding-gate';

beforeEach(() => {
  replace.mockClear();
});

describe('OnboardingGate', () => {
  it('redirects to /onboarding when the workspace has no projects', async () => {
    contextValue = { projects: [], isLoading: false };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    // The app is never rendered behind the redirect.
    expect(screen.queryByText('workspace')).toBeNull();
  });

  it('does not redirect while projects are still loading', () => {
    // Race (a): `projects` is [] during the fetch, which is indistinguishable
    // from "no projects" on length alone. Redirecting here would bounce an
    // existing user to onboarding for a frame.
    contextValue = { projects: [], isLoading: true };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('workspace')).toBeNull();
  });

  it('renders the app once projects exist, without redirecting', () => {
    contextValue = {
      projects: [{ id: 'p1' } as Project],
      isLoading: false,
    };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('workspace')).toBeInTheDocument();
  });
});
