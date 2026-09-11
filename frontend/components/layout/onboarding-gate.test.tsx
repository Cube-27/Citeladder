import { renderWithProviders as render } from '@/test/render';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectionStatus } from '@/lib/project/selection';

const replace = vi.fn();
let pathname = '/projects';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

let contextValue: {
  status: SelectionStatus;
  activeWorkspaceId: string | null;
  activeWorkspace: { id: string; role: Role } | null;
  retry: () => void;
};
vi.mock('@/lib/project/project-context', () => ({
  useActiveWorkspaceId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  useProjectContext: () => contextValue,
}));

let entitlement: { isLoading: boolean; usage: unknown; usageIsLoading: boolean };
vi.mock('@/lib/billing/entitlement-context', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEntitlement: () => entitlement,
}));

import { OnboardingGate } from './onboarding-gate';

/** A resolved usage payload granting `remaining` further project slots. */
function usage(remaining: number) {
  return { status: 'resolved', items: [{ key: 'project_slots', remaining }] };
}

function setContext(status: SelectionStatus, role: Role = 'owner') {
  contextValue = {
    status,
    activeWorkspaceId: WORKSPACE,
    activeWorkspace: { id: WORKSPACE, role },
    retry: vi.fn(),
  };
}

beforeEach(() => {
  replace.mockClear();
  pathname = '/projects';
  setContext('ready');
  entitlement = { isLoading: false, usage: usage(1), usageIsLoading: false };
});

describe('OnboardingGate', () => {
  it('renders the app once the workspace and project are resolved', () => {
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(screen.getByText('workspace')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends an empty workspace to onboarding, carrying the workspace', async () => {
    setContext('empty');
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    // The workspace travels with the redirect: refreshing the creation route
    // must not silently change which workspace the project is created in.
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/onboarding?workspace=${WORKSPACE}`));
    expect(screen.queryByText('workspace')).toBeNull();
  });

  it('does not redirect while the context is still resolving', () => {
    // An unsettled read is indistinguishable from "no projects" on length
    // alone. Redirecting here bounced existing users to onboarding for a frame.
    setContext('resolving');
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('workspace')).toBeNull();
  });

  it('offers a retry instead of onboarding when a read failed', () => {
    setContext('error');
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    // An empty error result is never evidence that the account needs
    // onboarding — sending them there is what let a transient network failure
    // present as a brand new account.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('names a missing project rather than substituting another one', () => {
    setContext('unavailable');
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('That project is unavailable')).toBeInTheDocument();
  });

  it('keeps an empty workspace on its workspace-management routes', () => {
    // A workspace with no projects is still a workspace: its owner may need
    // billing, members and settings, and redirecting those to project creation
    // made an empty workspace unmanageable.
    pathname = '/settings';
    setContext('empty');
    render(
      <OnboardingGate>
        <p>settings</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('settings')).toBeInTheDocument();
  });

  it('does not loop a Viewer through a creation flow that would refuse them', () => {
    setContext('empty', 'viewer');
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('You have read-only access to this workspace.')).toBeInTheDocument();
  });

  it('does not loop through creation when the allowance is exhausted', () => {
    setContext('empty');
    entitlement = { isLoading: false, usage: usage(0), usageIsLoading: false };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByText('Your current access does not include another project.'),
    ).toBeInTheDocument();
  });

  it('waits for entitlements so the shell paints complete', () => {
    entitlement = { isLoading: true, usage: null, usageIsLoading: true };
    render(
      <OnboardingGate>
        <p>workspace</p>
      </OnboardingGate>,
    );

    expect(screen.queryByText('workspace')).toBeNull();
  });
});
