/**
 * TanStack Query client factory + retry policy (F2).
 *
 * `shouldRetryQuery`: retry transient failures only — network errors and
 * 408/429/5xx — capped at 2 attempts. 4xx (except 408/429) and aborts never
 * retry. When the backend (or the A3 timeout surface) classifies the failure
 * with an explicit `retryable` flag, that classification wins — an A3
 * `request_timeout` ApiError carries `retryable: true` and slots in here.
 * Read-mostly projections stay fresh for 60s and remain recoverable from the
 * cache for 30 minutes. Explicit polling intervals still own live workflows;
 * these defaults do not replace or slow their timers. Mutations never
 * auto-retry.
 */
import { QueryClient } from '@tanstack/react-query';

import { ApiError, httpErrorStatus, isAbortError } from './errors';

/**
 * Warm a cache entry from INTENT — a hover, a focus, a route the reader has
 * not committed to yet. Intent must never disturb what a screen is already
 * rendering.
 *
 * An errored query is permanently stale, so `prefetchQuery` always refetches
 * it, and TanStack resets `error` back to `pending` while that refetch is in
 * flight. On a screen already showing the failure (Search Demand's "no
 * snapshot exists yet" 404 alert, a tab whose panel settled on an error),
 * that flips `isLoading` true and swaps the settled alert for a full-page
 * skeleton until the identical failure returns — a hover on a sidebar link
 * or on the ALREADY SELECTED tab visibly reloading the page.
 *
 * Warming a cache is strictly an optimisation, so a key that has already
 * failed is left exactly as it is: the destination mounts and retries on its
 * own terms, and explicit retry is unaffected.
 */
export function warmQuery<TOptions extends { queryKey: readonly unknown[] }>(
  client: QueryClient,
  options: TOptions,
): void {
  if (client.getQueryCache().find({ queryKey: options.queryKey })?.state.status === 'error') {
    return;
  }
  void client.prefetchQuery(options as never);
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2 || isAbortError(error)) return false;
  if (error instanceof ApiError && typeof error.retryable === 'boolean') {
    return error.retryable;
  }
  const status = httpErrorStatus(error);
  if (status === undefined) return true; // network / unknown → retry
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Retain the prior result only while the query stays inside the same
 * project/crawl scope. Filter and cursor changes keep their mounted content,
 * while changing the active project cannot temporarily relabel another
 * project's persisted evidence as the newly selected project.
 *
 * Domain query keys place their owning project or crawl id at index 2.
 */
export function retainPreviousDataForScope<TData>(
  scopeId: string,
  previousData: TData | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
): TData | undefined {
  return previousQuery?.queryKey[2] === scopeId ? previousData : undefined;
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
