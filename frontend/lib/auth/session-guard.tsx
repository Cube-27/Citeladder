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
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

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
    return <>{renderSessionFallback(fallback)}</>;
  }

  // oxlint-disable-next-line react-hooks/refs -- `clearSession` reads the ref only when invoked.
  if (!value) {
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

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a <SessionGuard>.');
  }
  return context;
}

export function useSessionUser(): SessionUser {
  return useSession().user;
}
