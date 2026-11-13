import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  performanceMutations,
  performanceQueries,
  refreshPerformance,
  type PerformanceDashboard,
} from '@/lib/api/performance';
import { pollRangeTask, RANGE_TASK_STATES } from '@/lib/performance/status';
import type { ActiveProjectScope } from '@/lib/project/active-project-scope';

/**
 * Materialize any window the dashboard reported as unprojected.
 *
 * A read never builds a projection, so when the selected or comparison window
 * has no snapshot the screen queues the display-only range task and refetches
 * once it completes. The task is idempotent on the window, so a re-render or
 * a second viewer joins the same work rather than duplicating it.
 */
export function useRangeProjection(
  scope: Pick<ActiveProjectScope, 'workspaceId' | 'projectId'>,
  data: PerformanceDashboard | undefined,
) {
  const { workspaceId, projectId } = scope;
  const queryClient = useQueryClient();
  const scopeKey = `${workspaceId}:${projectId}`;
  const [queued, setQueued] = useState<{
    scopeKey: string;
    taskId: string;
    window: RangeWindow;
  } | null>(null);
  // The window whose projection could not be built: its enqueue was refused,
  // or its task ended failed or cancelled. Kept apart from "never imported",
  // so the screen reports the failure and offers Retry (invariant 7).
  const [failed, setFailed] = useState<{
    scopeKey: string;
    window: RangeWindow;
    error: unknown;
  } | null>(null);
  // Read inside `onSuccess`, which runs long after the mutation was fired.
  const scopeKeyRef = useRef(scopeKey);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    scopeKeyRef.current = scopeKey;
    dataRef.current = data;
  }, [scopeKey, data]);
  const pending = queued?.scopeKey === scopeKey ? queued.taskId : null;
  const mutation = useMutation(performanceMutations.enqueueRange(scope));

  const missing = missingWindow(data);
  const enqueue = (window: RangeWindow) => {
    const requested = scopeKey;
    // Two enqueues can be in flight when the selection moves while the first
    // is still open, and they can land in either order. A response only
    // counts if it is still the window this screen wants — otherwise the
    // later selection's poll would be replaced by the earlier one's task, and
    // the dashboard would never be refreshed for the window actually on screen.
    const superseded = () => {
      const wanted = missingWindow(dataRef.current);
      return requested !== scopeKeyRef.current || (wanted !== null && !sameWindow(wanted, window));
    };
    setFailed(null);
    mutation.mutate(window, {
      onSuccess: (task) => {
        if (!superseded()) setQueued({ scopeKey: requested, taskId: task.task_id, window });
      },
      onError: (error) => {
        if (!superseded()) setFailed({ scopeKey: requested, window, error });
      },
    });
  };
  useEffect(() => {
    if (missing) enqueue(missing);
    // `missing` is a stable string pair derived from the response; re-running
    // on the mutation object or `enqueue` itself would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, projectId, missing?.from, missing?.to]);

  const task = useQuery({
    ...performanceQueries.rangeTask(scope, pending),
    refetchInterval: (query) => pollRangeTask(query.state.data?.status),
  });

  const status = task.data?.status;
  const terminal = status !== undefined && !RANGE_TASK_STATES[status].active;
  useEffect(() => {
    // EVERY terminal status releases the pending task, not only a success.
    // Only a success changed a projection, so only a success invalidates.
    if (!terminal || !queued) return;
    setQueued(null);
    if (status === 'succeeded') void refreshPerformance(queryClient, projectId);
    else
      setFailed({
        scopeKey: queued.scopeKey,
        window: queued.window,
        error: new Error(
          status === 'cancelled'
            ? 'Building this range was cancelled.'
            : 'Building this range from imported data failed.',
        ),
      });
  }, [terminal, status, queued, queryClient, projectId]);

  const failure =
    failed?.scopeKey === scopeKey && missing && sameWindow(failed.window, missing) ? failed : null;
  return {
    projecting: Boolean(pending) && !terminal,
    /** The current window's projection failed: what happened, and Retry for exactly it. */
    failure: failure
      ? {
          error: failure.error,
          retry: () => enqueue(failure.window),
          pending: mutation.isPending,
        }
      : null,
  };
}

type RangeWindow = Readonly<{ from: string; to: string }>;

function sameWindow(a: RangeWindow, b: RangeWindow) {
  return a.from === b.from && a.to === b.to;
}

/** The first window the response reported as unprojected, if any. */
function missingWindow(data: PerformanceDashboard | undefined): RangeWindow | null {
  if (!data) return null;
  for (const window of [data.selected, data.comparison]) {
    if (window?.snapshot_id === null && window.window_start && window.window_end) {
      return { from: window.window_start, to: window.window_end };
    }
  }
  return null;
}
