import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getActiveWorkspaceId, setActiveWorkspaceId } from '@/lib/api/client';
import { createAppQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { ACTIVE_PROJECT_STORAGE_KEY } from '@/lib/project/active-project-storage';
import { mswServer } from '@/test/msw-server';
import { makeProject } from '@/test/fixtures/project';

import { useAuthMutation } from './use-auth-mutation';

vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
const navigate = vi.mocked(hardNavigate);

const sessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const project = makeProject({
  id: '22222222-2222-4222-8222-222222222222',
  website_url: 'https://example.com',
});

function setup(mutationFn: () => Promise<typeof sessionUser> = () => Promise.resolve(sessionUser)) {
  const queryClient = createAppQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // The auth call itself is stubbed to resolve immediately.
  const hook = renderHook(() => useAuthMutation(mutationFn), { wrapper });
  return { queryClient, ...hook };
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  navigate.mockReset();
  window.localStorage.clear();
  globalThis.sessionStorage.clear();
  setActiveWorkspaceId(null);
});
afterAll(() => mswServer.close());

describe('useAuthMutation', () => {
  // Login no longer reads the project list to pick a destination. It could
  // only have read it UNSCOPED — no workspace is resolved at this point — so
  // the answer came from whichever workspace the backend defaulted to. The
  // shell's gate makes that decision from the resolved workspace instead.
  it('primes the me cache and routes into the app', async () => {
    const { result, queryClient } = setup();

    act(() => {
      void result.current.submit({});
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects'));
    expect(queryClient.getQueryData(queryKeys.auth.me())).toMatchObject({ id: sessionUser.id });
  });

  it('cancels old-account queries and clears only account-scoped state before seeding login', async () => {
    const { result, queryClient } = setup();
    queryClient.setQueryData(['old-account', 'private'], { secret: 'stale' });
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);
    window.localStorage.setItem('citeladder-theme', 'dark');
    setActiveWorkspaceId(project.workspace_id);

    let requestStarted: (() => void) | undefined;
    let wasAborted = false;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const oldRequest = queryClient
      .fetchQuery({
        queryKey: ['old-account', 'in-flight'],
        queryFn: ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            requestStarted?.();
            signal.addEventListener(
              'abort',
              () => {
                wasAborted = true;
                reject(signal.reason);
              },
              { once: true },
            );
          }),
      })
      .catch(() => undefined);
    await started;

    act(() => {
      void result.current.submit({});
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects'));
    await oldRequest;
    expect(wasAborted).toBe(true);
    expect(queryClient.getQueryData(['old-account', 'private'])).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.auth.me())).toMatchObject({ id: sessionUser.id });
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('citeladder-theme')).toBe('dark');
    expect(getActiveWorkspaceId()).toBeNull();
  });

  it('does not clear the existing account state when authentication fails', async () => {
    const { result, queryClient } = setup(() => Promise.reject(new Error('invalid credentials')));
    queryClient.setQueryData(['old-account', 'private'], { stays: true });
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id);
    setActiveWorkspaceId(project.workspace_id);

    await act(async () => {
      await result.current.submit({});
    });

    await waitFor(() => expect(result.current.mutation.isError).toBe(true));
    expect(queryClient.getQueryData(['old-account', 'private'])).toEqual({ stays: true });
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe(project.id);
    expect(getActiveWorkspaceId()).toBe(project.workspace_id);
    expect(navigate).not.toHaveBeenCalled();
  });

  // A pricing selection captured before signing in was the visitor's last
  // deliberate action; landing them on /projects would silently discard it.
  it('resumes a captured pricing intent instead of the normal destination', async () => {
    globalThis.sessionStorage.setItem(
      'citeladder.pendingPricingIntent.v1',
      JSON.stringify({
        version: 1,
        kind: 'checkout',
        catalog_key: 'tier_2',
        quantity: 1,
        byok: true,
        country_code: null,
        billing_details: null,
        idempotency_key: 'idem-1',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );
    const { result } = setup();

    act(() => {
      void result.current.submit({});
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pricing?resumeActivation=1'));
    // No intent field may leak into the auth URL — the record stays in
    // storage and is revalidated against the live catalog before any purchase.
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('tier_2'));
    globalThis.sessionStorage.clear();
  });

  it('ignores a malformed stored intent and uses the normal destination', async () => {
    globalThis.sessionStorage.setItem('citeladder.pendingPricingIntent.v1', '{"version":99}');
    const { result } = setup();

    act(() => {
      void result.current.submit({});
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects'));
    globalThis.sessionStorage.clear();
  });
});
