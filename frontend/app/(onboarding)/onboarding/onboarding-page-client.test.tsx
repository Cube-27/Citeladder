import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, projectState } = vi.hoisted(() => ({
  replace: vi.fn(),
  projectState: { projects: [{ id: 'existing-project' }], isLoading: false },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('new=1'),
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
  });

  it('redirects an additional-project URL when creation is unavailable', async () => {
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
});
