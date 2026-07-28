import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { replace, setActiveProjectId, createProject } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActiveProjectId: vi.fn(),
  createProject: vi.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Acme',
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
  useMutation: ({
    mutationFn,
    onSuccess,
  }: {
    mutationFn: () => Promise<unknown>;
    onSuccess: (value: { id: string; name: string }) => Promise<void>;
  }) => ({
    isError: false,
    isPending: false,
    mutate: () =>
      void mutationFn().then((value) => onSuccess(value as { id: string; name: string })),
  }),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ setActiveProjectId }),
}));

vi.mock('@/lib/onboarding/create-project', () => ({ createProjectFromOnboarding: createProject }));

vi.mock('@/lib/onboarding/use-discovery', () => ({
  useDiscovery: () => ({
    state: {
      domains: { status: 'idle', data: [], error: null, unconfigured: false },
      competitors: { status: 'idle', data: [], error: null, unconfigured: false },
      prompts: { status: 'idle', data: [], error: null, unconfigured: false },
    },
    isRunning: false,
    agentUnconfigured: false,
    retry: vi.fn(),
  }),
}));

vi.mock('@/lib/api/projects', () => ({
  projectsApi: { refreshProjectLogos: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('./discovery-progress', () => ({ DiscoveryProgress: () => <div /> }));
vi.mock('./review-step', () => ({ ReviewStep: () => <div>Review suggestions</div> }));

import { OnboardingScreen } from './onboarding-screen';

describe('OnboardingScreen', () => {
  it('shows Finish after creation and only opens the dashboard when requested', async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen />);

    await user.type(screen.getByLabelText(/brand name/i), 'Acme');
    await user.type(screen.getByLabelText(/website/i), 'acme.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(await screen.findByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: /workspace is ready/i })).toBeInTheDocument();
    expect(screen.getByText(/free Site Health crawl/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(setActiveProjectId).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');

    await user.click(screen.getByRole('button', { name: /open dashboard/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'));
  });
});
