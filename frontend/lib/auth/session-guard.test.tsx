import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useQuery, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/errors';
import { runsQueries } from '@/lib/api/runs';
import { queryKeys } from '@/lib/api/query-keys';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ACTIVE_WORKSPACE_STORAGE_KEY,
} from '@/lib/project/active-project-storage';
import { ProjectProvider } from '@/lib/project/project-context';
import { THEME_COOKIE, setThemePreference } from '@/lib/theme/theme';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { hardNavigate } from '@/lib/navigation/hard-navigate';

vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
const navigate = vi.mocked(hardNavigate);

import { SessionGuard, useSessionUser } from './session-guard';

const sessionUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'guarded@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function Protected() {
  const user = useSessionUser();
  return <div>signed in as {user.email}</div>;
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  navigate.mockReset();
  window.localStorage.clear();
  document.cookie = `${THEME_COOKIE}=; Max-Age=0; Path=/`;
});
afterAll(() => mswServer.close());

describe('SessionGuard', () => {
  it('renders protected content for an authenticated user', async () => {
    mswServer.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })));

    renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );

    expect(await screen.findByText(/signed in as guarded@example.com/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    { now: 'the same person', next: sessionUser, leavesFor: [] },
    {
      now: 'another person',
      next: { ...sessionUser, id: '33333333-3333-4333-8333-333333333333' },
      leavesFor: [['/']],
    },
    { now: 'nobody', next: null, leavesFor: [['/login']] },
  ])(
    'asks again on a back-forward cache restore with $now signed in',
    async ({ next, leavesFor }) => {
      let current: typeof next = sessionUser;
      let requestCount = 0;
      mswServer.use(
        http.get('/api/v1/auth/me', () => {
          requestCount += 1;
          return current
            ? HttpResponse.json({ user: current })
            : HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
        }),
      );
      renderWithProviders(
        <SessionGuard fallback={<div>loading</div>}>
          <Protected />
        </SessionGuard>,
      );
      expect(await screen.findByText(/signed in as guarded@example.com/i)).toBeInTheDocument();

      current = next;
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));

      await waitFor(() => expect(requestCount).toBe(2));
      await waitFor(() => expect(navigate.mock.calls).toEqual(leavesFor));
    },
  );

  it('leaves the protected document when an unauthenticated visitor is sent to /login', async () => {
    let requestCount = 0;
    mswServer.use(
      http.get('/api/v1/auth/me', () => {
        requestCount += 1;
        return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
      }),
    );

    renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(navigate).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(requestCount).toBe(1);
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  it('does not log the user out when /auth/me fails with a non-401 error', async () => {
    mswServer.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ error: { message: 'Forbidden' } }, { status: 403 }),
      ),
    );

    renderWithProviders(
      <SessionGuard
        fallback={(content) => (
          <div>
            <span>Neutral shell geometry</span>
            {content ?? <span>loading</span>}
          </div>
        )}
      >
        <Protected />
      </SessionGuard>,
    );

    await screen.findByRole('heading', { name: 'Your session could not be verified' });
    expect(screen.getByText('Neutral shell geometry')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('retries only the session read and mounts protected content after recovery', async () => {
    const user = userEvent.setup();
    let available = false;
    let requestCount = 0;
    mswServer.use(
      http.get('/api/v1/auth/me', () => {
        requestCount += 1;
        return available
          ? HttpResponse.json({ user: sessionUser })
          : HttpResponse.json(
              {
                error: {
                  code: 'session_unavailable',
                  message: 'Session service unavailable',
                  retryable: false,
                },
              },
              { status: 503 },
            );
      }),
    );

    renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Your session could not be verified' }),
    ).toBeVisible();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
    available = true;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/signed in as guarded@example.com/i)).toBeVisible();
    expect(requestCount).toBe(2);
  });

  it('clears account state and leaves the protected document when any query returns 401', async () => {
    mswServer.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })),
      http.get('/api/v1/audits', () =>
        HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 }),
      ),
    );

    function ChildQuery() {
      useQuery({
        ...runsQueries.list({ workspaceId: null, projectId: 'p1' }),
      });
      return <Protected />;
    }

    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, 'old-project');
    setThemePreference('dark');
    window.localStorage.setItem(
      ACTIVE_WORKSPACE_STORAGE_KEY,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );

    const { queryClient } = renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <ChildQuery />
      </SessionGuard>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/signed in as guarded@example.com/i)).toBeInTheDocument();
    window.dispatchEvent(new Event('pagehide'));
    expect(queryClient.getQueryData(queryKeys.auth.me())).toBeUndefined();
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('acts on a 401 reaching the cache directly, after the deferring microtask', async () => {
    mswServer.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })));

    const { queryClient } = renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );
    await screen.findByText(/signed in as guarded@example.com/i);

    await expect(reject401(queryClient, 'while-mounted')).rejects.toThrow();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('leaves for sign-in when a write is refused with 401, not only a read', async () => {
    mswServer.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })));
    const { queryClient } = renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );
    await screen.findByText(/signed in as guarded@example.com/i);

    await expect(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () => Promise.reject(new ApiError('Unauthorized', 401, '')),
        })
        .execute(undefined),
    ).rejects.toThrow('Unauthorized');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('drops a 401 already queued when the guard unmounts mid-notify', async () => {
    mswServer.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })));

    const { queryClient, unmount } = renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );
    await screen.findByText(/signed in as guarded@example.com/i);

    let unmountedMidNotify = false;
    const stop = queryClient.getQueryCache().subscribe((event) => {
      if (unmountedMidNotify || event.type !== 'updated' || !event.query.state.error) return;
      unmountedMidNotify = true;
      unmount();
    });

    await expect(reject401(queryClient, 'mid-notify')).rejects.toThrow();
    stop();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(unmountedMidNotify).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stops acting on cache 401s once unmounted', async () => {
    mswServer.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ user: sessionUser })));

    const { queryClient, unmount } = renderWithProviders(
      <SessionGuard fallback={<div>loading</div>}>
        <Protected />
      </SessionGuard>,
    );
    await screen.findByText(/signed in as guarded@example.com/i);

    unmount();

    await expect(reject401(queryClient, 'after-unmount')).rejects.toThrow();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets the project list load alongside me without exposing protected content', async () => {
    let projectsRequested = false;
    let resolveMe!: () => void;
    const meSettled = new Promise<void>((resolve) => {
      resolveMe = resolve;
    });
    mswServer.use(
      http.get('/api/v1/auth/me', async () => {
        await meSettled;
        return HttpResponse.json({ user: sessionUser });
      }),
      http.get('/api/v1/projects', () => {
        projectsRequested = true;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(
      <ProjectProvider>
        <SessionGuard fallback={<div>loading</div>}>
          <Protected />
        </SessionGuard>
      </ProjectProvider>,
    );

    await waitFor(() => expect(projectsRequested).toBe(true));
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();

    resolveMe();
    expect(await screen.findByText(/signed in as guarded@example.com/i)).toBeInTheDocument();
  });
});

function reject401(queryClient: QueryClient, key: string) {
  return queryClient.fetchQuery({
    queryKey: [key],
    queryFn: () => Promise.reject(new ApiError('Unauthorized', 401, '')),
    retry: false,
  });
}
