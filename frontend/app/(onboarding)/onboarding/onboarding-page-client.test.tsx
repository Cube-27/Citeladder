import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, projectState, entitlementState } = vi.hoisted(() => ({
  replace: vi.fn(),
  projectState: { projects: [{ id: 'existing-project' }], isLoading: false },
  entitlementState: {
    entitlement: {
      status: 'resolved',
      capabilities: [{ key: 'project_slots', value: 1 }],
    },
    isLoading: false,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/billing/entitlement-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/entitlement-context')>()),
  useEntitlement: () => entitlementState,
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => projectState,
}));

vi.mock('@/components/onboarding/onboarding-screen', () => ({
  OnboardingScreen: () => <div>Onboarding flow</div>,
}));

import { OnboardingPageClient } from './onboarding-page-client';

describe('OnboardingPageClient', () => {
  beforeEach(() => {
    replace.mockClear();
    projectState.projects = [{ id: 'existing-project' }];
    projectState.isLoading = false;
    entitlementState.entitlement.capabilities = [{ key: 'project_slots', value: 1 }];
    entitlementState.isLoading = false;
  });

  it('redirects direct onboarding navigation when the project allowance is full', async () => {
    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
  });

  it('keeps first-project onboarding available for an empty workspace', () => {
    projectState.projects = [];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not mount onboarding before the project gate resolves', () => {
    projectState.isLoading = true;

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps additional-project onboarding available without a project cap', () => {
    entitlementState.entitlement.capabilities = [];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
