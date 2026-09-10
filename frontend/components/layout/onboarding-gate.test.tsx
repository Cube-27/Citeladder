import { renderWithProviders as render } from '@/test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/lib/api/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

// The gate reads projects, isLoading, isError and hasPendingSelection.
let contextValue = {
  projects: [] as Project[],
  isError: false,
  isLoading: false,
  hasPendingSelection: false,
};
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => contextValue,
}));

let entitlementLoading = false;
vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ isLoading: entitlementLoading }),
}));

import { OnboardingGate } from './onboarding-gate';

beforeEach(() => {
  replace.mockClear();
  entitlementLoading = false;
});

describe('OnboardingGate', () => {
  it('redirects to /onboarding when the workspace has no projects', async () => {
    contextValue = { projects: [], isError: false, isLoading: false, hasPendingSelection: false };
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
    contextValue = { projects: [], isError: false, isLoading: true, hasPendingSelection: false };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('workspace')).toBeNull();
  });

  /**
   * Entitlement decides which controls the shell has, so drawing before it
   * answers means growing a button and a navigation row a round trip later.
   */
  it('holds the shell until entitlement has answered', () => {
    contextValue = {
      projects: [{ id: 'p1' } as Project],
      isError: false,
      isLoading: false,
      hasPendingSelection: false,
    };
    entitlementLoading = true;
    render(
      <OnboardingGate>
        <p>app</p>
      </OnboardingGate>,
    );

    expect(screen.queryByText('app')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the app once projects exist, without redirecting', () => {
    contextValue = {
      projects: [{ id: 'p1' } as Project],
      isError: false,
      isLoading: false,
      hasPendingSelection: false,
    };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('workspace')).toBeInTheDocument();
  });

  /**
   * Race (c), and the one that cost a user their first project. Arriving from
   * onboarding mounts a NEW provider whose list can still be the pre-create
   * one: not loading, and empty. Read on length alone that says "this account
   * has no projects", so the gate sent them back to a blank /onboarding right
   * after they had finished it — and the second completion was refused with
   * "not allowed to create more projects", because the first one existed.
   */
  it('waits instead of redirecting while a committed selection is unconfirmed', () => {
    contextValue = { projects: [], isError: false, isLoading: false, hasPendingSelection: true };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('workspace')).toBeNull();
  });
});

it('keeps failed project lookup recoverable without redirecting to onboarding', async () => {
  contextValue = { projects: [], isLoading: false, isError: true, hasPendingSelection: false };
  const { queryClient } = render(
    <OnboardingGate>
      <p>workspace</p>
    </OnboardingGate>,
  );
  const retry = vi.spyOn(queryClient, 'refetchQueries');
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Projects could not be loaded' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});
