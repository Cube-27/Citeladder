import { renderWithProviders as render } from '@/test/render';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { projectState, entitlementState, contextRetry } = vi.hoisted(() => ({
  contextRetry: vi.fn(),
  projectState: {
    status: 'ready' as string,
    activeWorkspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as string | null,
    retry: () => {},
  },
  entitlementState: {
    // The MEMBER-SAFE workspace projection now carries the remaining
    // allowance, so the first-project flow asks the same question an Owner
    // and a Member can both have answered.
    entitlement: {
      status: 'resolved' as string,
      occupancy: [{ key: 'project_slots', allowance: 1, consumed: 1, remaining: 0 }] as Array<
        Record<string, unknown>
      >,
    },
    isLoading: false,
  },
}));

vi.mock('@/lib/billing/entitlement-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/entitlement-context')>()),
  useEntitlement: () => entitlementState,
}));

vi.mock('@/lib/project/project-context', () => ({
  useActiveWorkspaceId: () => projectState.activeWorkspaceId,
  useProjectContext: () => ({ ...projectState, retry: contextRetry }),
}));

vi.mock('@/components/onboarding/onboarding-screen', () => ({
  OnboardingScreen: () => <div>Onboarding flow</div>,
}));

import { OnboardingPageClient } from './onboarding-page-client';

describe('OnboardingPageClient', () => {
  beforeEach(() => {
    contextRetry.mockClear();
    projectState.status = 'ready';
    projectState.activeWorkspaceId = WORKSPACE;
    entitlementState.entitlement.status = 'resolved';
    entitlementState.entitlement.occupancy = [
      { key: 'project_slots', allowance: 1, consumed: 1, remaining: 0 },
    ];
    entitlementState.isLoading = false;
  });

  it('blocks direct onboarding navigation when the project allowance is full', () => {
    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project limit reached' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
  });

  it('keeps first-project onboarding available for an empty workspace', () => {
    projectState.status = 'empty';
    entitlementState.entitlement.occupancy = [
      { key: 'project_slots', allowance: 1, consumed: 0, remaining: 1 },
    ];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
  });

  it('does not mount onboarding before the workspace resolves', () => {
    projectState.status = 'resolving';
    projectState.activeWorkspaceId = null;

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
  });

  it('fails closed when the target workspace cannot be resolved', () => {
    projectState.status = 'error';

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Your workspace could not be loaded' }),
    ).toBeInTheDocument();
  });

  it('fails closed when the project capability is missing', () => {
    entitlementState.entitlement.occupancy = [];

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project access unavailable' })).toBeInTheDocument();
  });

  it('blocks an empty workspace when the allowance is already spent', () => {
    projectState.status = 'empty';

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project limit reached' })).toBeInTheDocument();
  });

  it('keeps additional-project onboarding available for a development allowance', () => {
    entitlementState.entitlement.occupancy = [
      { key: 'project_slots', allowance: 49_999, consumed: 0, remaining: 49_999 },
    ];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
  });

  it('surfaces a workspace failure that leaves no workspace resolved', () => {
    // The failure path has no workspace by definition, so testing for a null
    // workspace FIRST hid the retry behind a spinner that never resolved.
    projectState.status = 'error';
    projectState.activeWorkspaceId = null;

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Your workspace could not be loaded' }),
    ).toBeInTheDocument();
  });

  it('does not offer creation for a link naming an unavailable project', () => {
    projectState.status = 'unavailable';

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'That project is unavailable' }),
    ).toBeInTheDocument();
  });

  it('retries the workspace and the allowance when the allowance is unresolved', () => {
    // An unresolved entitlement is a settled backend state, not a transient
    // transport failure — but it is equally not a basis for asserting a limit,
    // so the reader gets a retry rather than a claim about their access.
    entitlementState.entitlement.status = 'entitlement_unresolved';
    entitlementState.entitlement.occupancy = [];
    const { queryClient } = render(<OnboardingPageClient />);
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    expect(screen.getByRole('heading', { name: 'Project access unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // Both halves of the precondition are re-asked: the workspace this project
    // would be created in, and the allowance that says whether it may be.
    expect(contextRetry).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
