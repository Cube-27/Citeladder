import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { projectState, entitlementState } = vi.hoisted(() => ({
  projectState: { projects: [{ id: 'existing-project' }], isLoading: false, isError: false },
  entitlementState: {
    entitlement: {
      status: 'resolved',
      capabilities: [{ key: 'project_slots', value: 1 }],
    },
    isLoading: false,
  },
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
    projectState.projects = [{ id: 'existing-project' }];
    projectState.isLoading = false;
    projectState.isError = false;
    entitlementState.entitlement.capabilities = [{ key: 'project_slots', value: 1 }];
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
    projectState.projects = [];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
  });

  it('does not mount onboarding before the project gate resolves', () => {
    projectState.isLoading = true;

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
  });

  it('fails closed when existing project ownership cannot be resolved', () => {
    projectState.projects = [];
    projectState.isError = true;

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project access unavailable' })).toBeInTheDocument();
  });

  it('fails closed when the project capability is missing', () => {
    entitlementState.entitlement.capabilities = [];

    render(<OnboardingPageClient />);

    expect(screen.queryByText('Onboarding flow')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project limit reached' })).toBeInTheDocument();
  });

  it('keeps additional-project onboarding available for a development allowance', () => {
    entitlementState.entitlement.capabilities = [{ key: 'project_slots', value: 50_000 }];

    render(<OnboardingPageClient />);

    expect(screen.getByText('Onboarding flow')).toBeInTheDocument();
  });
});
