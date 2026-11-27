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
import { Notice, NoticeFrame, NoticeHeading } from '@/components/ui/notice';

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

  // oxlint-disable-next-line react-hooks/refs
  if (!value) {
    if (isError && httpErrorStatus(error) !== 401) {
      const notice = (
        <NoticeFrame>
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
            <NoticeHeading>Your session could not be verified</NoticeHeading>
            <p>{humanizeApiError(error, 'Please try again.').message}</p>
          </Notice>
        </NoticeFrame>
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
