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
    usage: {
      status: 'resolved',
      items: [{ key: 'project_slots', remaining: 0 }],
    },
    isLoading: false,
    usageIsLoading: false,
    usageIsError: false,
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
    entitlementState.usage.items = [{ key: 'project_slots', remaining: 0 }];
    entitlementState.isLoading = false;
    entitlementState.usageIsLoading = false;
    entitlementState.usageIsError = false;
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
    entitlementState.usage.items = [{ key: 'project_slots', remaining: 1 }];

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
    entitlementState.usage.items = [];

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
    entitlementState.usage.items = [{ key: 'project_slots', remaining: 49_999 }];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
  });

  it('distinguishes usage failure and retries the workspace and the allowance', () => {
    entitlementState.usageIsError = true;
    const { queryClient } = render(<OnboardingPageClient />);
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    expect(
      screen.getByRole('heading', { name: 'Project allowance could not be loaded' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // Both halves of the precondition are re-asked: the workspace this project
    // would be created in, and the allowance that says whether it may be.
    expect(contextRetry).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
