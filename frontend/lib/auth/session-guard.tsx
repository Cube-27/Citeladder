import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { authQueries } from '@/lib/api/auth';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
import { httpErrorStatus, humanizeApiError } from '@/lib/api/errors';
import type { SessionUser } from '@citeladder/contracts';
import { isDeparting, restartAt } from '@/lib/auth/account-transition';
import { Button } from '@/components/ui/button';
import { textRole } from '@/components/ui/typography';
import { Notice } from '@/components/ui/notice';

export type SessionContextValue = {
  user: SessionUser;
  /** Leave for `/login` with no account state carried over (see `restartAt`); never resolves. */
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Publish a resolved session.
 *
 * `SessionGuard` decides WHETHER there is one; this only carries the answer.
 * Separating them lets a harness mount the consumers that every authenticated
 * route mounts — the account controller, above all — without standing up the
 * guard's `me` request, while keeping the guard the only thing in the app that
 * may declare a session resolved.
 */
export function SessionProvider({
  value,
  children,
}: Readonly<{ value: SessionContextValue; children: ReactNode }>) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
type SessionFallback = ReactNode | ((content?: ReactNode) => ReactNode);

function renderSessionFallback(fallback: SessionFallback, content?: ReactNode) {
  return typeof fallback === 'function' ? fallback(content) : (content ?? fallback);
}

/**
 * SessionGuard (F4) — the authed-area gate + user context provider.
 *
 * Mounted at the top of the `(app)` route group. It:
 *   1. loads `GET /auth/me` (React Query; 4xx never retries per F2's policy);
 *   2. redirects to `/login` only on a 401 from `me` (session gone); non-401
 *      errors (network/5xx) do not log the user out;
 *   3. listens to the query and mutation caches so a 401 from ANY query or
 *      mutation (not just `me`) clears the cached session and redirects to
 *      `/login` (invariant: a cookie that expired mid-session must not strand
 *      the user on a broken screen).
 *
 * While `me` is loading, it renders `fallback` (a neutral splash) rather than
 * flashing protected content.
 */
export function SessionGuard({
  children,
  fallback = null,
}: Readonly<{ children: ReactNode; fallback?: SessionFallback }>) {
  const queryClient = useQueryClient();
  const redirectingRef = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    data: user,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({ ...authQueries.me(), enabled: !isRedirecting });

  const clearSession = useCallback(async () => {
    // Once per document: a sign-out already leaving, or a burst of 401s, must
    // not start a second navigation. The cache is dropped when the document
    // is left, which removes the active `me` query; disabling it keeps the
    // still-mounted guard from recreating it and asking again.
    if (redirectingRef.current || isDeparting(queryClient)) return;
    redirectingRef.current = true;
    setIsRedirecting(true);
    await restartAt(
      queryClient,
      withAuthReturnPath(
        '/login',
        safeAuthReturnPath(window.location.pathname + window.location.search),
      ),
    );
  }, [queryClient]);

  // Redirect only a genuinely unauthenticated visitor: a 401 from `me` means
  // the session is gone → clear + bounce to /login. A non-401 error (network
  // blip, 5xx) must NOT log the user out — React Query keeps the last state and
  // retries, so we leave rendering as-is rather than stranding them at /login.
  useEffect(() => {
    if (isError && httpErrorStatus(error) === 401) void clearSession();
  }, [isError, error, clearSession]);

  // The shell may be restored from the back-forward cache, frozen as it was,
  // so it asks `me` again: an ended session leads to sign-in, and another
  // person's session reloads the page with nothing of the frozen account.
  const onRestore = useEffectEvent(async () => {
    const shown = user?.id;
    const { data } = await refetch();
    if (shown && data && data.id !== shown) {
      await restartAt(queryClient, window.location.pathname + window.location.search);
    }
  });
  useEffect(() => {
    const recheck = (event: PageTransitionEvent) => {
      if (event.persisted) void onRestore();
    };
    window.addEventListener('pageshow', recheck);
    return () => window.removeEventListener('pageshow', recheck);
  }, []);

  // Global 401 watchdog: a 401 from any in-flight/finished query means the
  // session is gone — clear + redirect once, regardless of which query failed.
  //
  // `clearSession` is only ever *called* from the subscription, never read as a
  // value it depends on, so it goes through an Effect Event: the cache
  // subscription is installed once per query client instead of being torn down
  // and reinstalled every time the callback identity changes.
  const onCacheEvent = useEffectEvent((error: unknown) => {
    if (error && httpErrorStatus(error) === 401) void clearSession();
  });

  useEffect(() => {
    let disposed = false;
    // React Query notifies subscribers synchronously, and some of those
    // notifications land *during* a render (e.g. a query being observed for
    // the first time). Effect Events may not be called while rendering, so
    // hop to a microtask — by then the render has committed.
    const report = (cacheError: unknown) => {
      if (!cacheError) return;
      void Promise.resolve().then(() => {
        if (disposed) return;
        onCacheEvent(cacheError);
      });
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated') report(event.query.state.error);
    });
    // A write is as much proof the session ended as a read: a form submitted
    // after expiry must lead to sign-in, not an inline 401 message.
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated') report(event.mutation.state.error);
    });
    return () => {
      disposed = true;
      queries();
      mutations();
    };
  }, [queryClient]);

  const value = useMemo<SessionContextValue | null>(
    () => (user ? { user, clearSession } : null),
    [user, clearSession],
  );

  if (isLoading) {
    // Never render protected UI before the session is known. A session that
    // ends while the page is open keeps the page as it is until the sign-in
    // document replaces it, rather than collapsing it into this fallback.
    return <>{renderSessionFallback(fallback)}</>;
  }

  // oxlint-disable-next-line react-hooks/refs -- `clearSession` reads the ref only when invoked.
  if (!value) {
    // A non-401 failure is not an authentication decision. Keep protected
    // UI unmounted, explain the state, and retry only `auth.me`.
    if (isError && httpErrorStatus(error) !== 401) {
      const notice = (
        <div className="grid min-h-[60dvh] place-items-center p-[var(--page-section-gap)]">
          <Notice
            tone="warning"
            className="max-w-lg"
            action={
              <Button
                variant="secondary"
                onClick={() => void refetch()}
                pending={isFetching}
                pendingLabel="Retrying…"
              >
                Retry
              </Button>
            }
          >
            <h1 className={textRole('heading')}>Your session could not be verified</h1>
            <p>{humanizeApiError(error, 'Please try again.').message}</p>
          </Notice>
        </div>
      );
      return <>{renderSessionFallback(fallback, notice)}</>;
    }
    return <>{renderSessionFallback(fallback)}</>;
  }

  return <SessionProvider value={value}>{children}</SessionProvider>;
}

/** Access the authenticated session user. Throws if used outside the guard. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a <SessionGuard>.');
  }
  return context;
}

/** Convenience accessor for just the user record. */
export function useSessionUser(): SessionUser {
  return useSession().user;
}
