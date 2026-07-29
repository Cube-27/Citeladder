import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/projects',
  search: '',
  tour: {
    workspace_id: '00000000-0000-4000-8000-000000000002',
    version: 'dashboard-v1',
    status: 'in_progress' as const,
    step_id: 'dashboard-overview',
    started_at: '2026-07-28T00:00:00Z',
    completed_at: null,
  },
  push: vi.fn(),
  updates: [] as Array<{ status: string; step_id?: string | null }>,
  driverCalls: [] as Array<{
    config: Record<string, unknown>;
    instance: { destroy: ReturnType<typeof vi.fn>; highlight: ReturnType<typeof vi.fn> };
  }>,
  reducedMotion: false,
  failUpdate: false,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.tour }),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (payload: { status: string; step_id?: string | null }) => Promise<unknown>;
    onSuccess: (tour: unknown) => void;
    onError?: () => void;
  }) => ({
    isPending: false,
    mutate: async (payload: { status: string; step_id?: string | null }) => {
      state.updates.push(payload);
      try {
        const result = await mutationFn(payload);
        onSuccess(result);
      } catch {
        onError?.();
      }
    },
  }),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    activeProject: { workspace_id: '00000000-0000-4000-8000-000000000002' },
  }),
}));

vi.mock('@/lib/api/workspaces', () => ({
  workspacesApi: {
    getProductTour: vi.fn(),
    updateProductTour: vi.fn(async (_workspaceId: string, payload: Record<string, unknown>) => {
      if (state.failUpdate) throw new Error('persist failed');
      return { ...state.tour, ...payload };
    }),
  },
}));

vi.mock('driver.js', () => ({
  driver: vi.fn((config: Record<string, unknown>) => {
    const instance = { destroy: vi.fn(), highlight: vi.fn() };
    state.driverCalls.push({ config, instance });
    return instance;
  }),
}));

import { PRODUCT_TOUR_STEPS, ProductTourProvider } from './product-tour-provider';

function renderTour(target = true) {
  return render(
    <ProductTourProvider>
      {target ? <div data-tour="dashboard-overview" /> : null}
    </ProductTourProvider>,
  );
}

describe('ProductTourProvider', () => {
  afterEach(() => {
    state.pathname = '/projects';
    state.search = '';
    state.tour = {
      workspace_id: '00000000-0000-4000-8000-000000000002',
      version: 'dashboard-v1',
      status: 'in_progress',
      step_id: 'dashboard-overview',
      started_at: '2026-07-28T00:00:00Z',
      completed_at: null,
    };
    state.push.mockReset();
    state.updates.length = 0;
    state.driverCalls.length = 0;
    state.reducedMotion = false;
    state.failUpdate = false;
    vi.useRealTimers();
  });

  it('keeps Driver keyboard controls enabled and honors reduced motion', async () => {
    state.reducedMotion = true;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: state.reducedMotion })),
    );

    renderTour();
    await waitFor(() => expect(state.driverCalls).toHaveLength(1));

    expect(state.driverCalls[0].config).toMatchObject({
      allowKeyboardControl: true,
      animate: false,
    });
    vi.unstubAllGlobals();
  });

  it('does not open a tour overlay when its target never mounts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    renderTour(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    expect(state.driverCalls).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('destroys an active overlay when unmounted', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const { unmount } = renderTour();
    await waitFor(() => expect(state.driverCalls).toHaveLength(1));

    unmount();

    expect(state.driverCalls[0].instance.destroy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('navigates to a cross-route step before looking for its target', async () => {
    state.tour = { ...state.tour, step_id: 'provider-settings' };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );

    renderTour();
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/settings?tab=providers'));

    expect(state.driverCalls).toHaveLength(0);
    expect(PRODUCT_TOUR_STEPS.find((step) => step.id === 'provider-settings')?.path).toBe(
      '/settings?tab=providers',
    );
    vi.unstubAllGlobals();
  });

  it('persists the next step and terminal Done state from Driver controls', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    const { unmount } = renderTour();
    await waitFor(() => expect(state.driverCalls).toHaveLength(1));

    await act(async () => {
      await (state.driverCalls[0].config.onNextClick as () => void)();
    });
    expect(state.updates).toContainEqual({ status: 'in_progress', step_id: 'dashboard-report' });

    unmount();

    state.tour = { ...state.tour, step_id: 'provider-settings' };
    state.pathname = '/settings';
    state.search = 'tab=providers';
    render(
      <ProductTourProvider>
        <div data-tour="provider-settings" />
      </ProductTourProvider>,
    );
    await waitFor(() => expect(state.driverCalls).toHaveLength(2));
    await act(async () => {
      await (state.driverCalls[1].config.onNextClick as () => void)();
    });
    expect(state.updates).toContainEqual({ status: 'completed', step_id: null });
    vi.unstubAllGlobals();
  });

  it('clears transition state when persisting a step fails', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    state.failUpdate = true;
    renderTour();
    await waitFor(() => expect(state.driverCalls).toHaveLength(1));

    await act(async () => {
      await (state.driverCalls[0].config.onNextClick as () => void)();
    });
    await act(async () => {
      await (state.driverCalls[0].config.onDestroyStarted as () => void)();
    });

    expect(state.updates).toContainEqual({ status: 'skipped', step_id: undefined });
    vi.unstubAllGlobals();
  });
});
