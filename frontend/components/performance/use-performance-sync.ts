'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';

import { integrationsApi, type IntegrationSyncRun } from '@/lib/api/integrations';
import { performanceApi, type PerformanceSyncEnqueueResponse } from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import {
  isActiveSyncRun,
  isSucceededSyncRun,
  SYNC_RUN_POLL_MS,
} from '@/lib/integrations/sync-runs';

/**
 * "Sync now" for the Performance surface: enqueue one integrations run per
 * active mapped connection, poll each to terminal, then invalidate the
 * projections the completed runs refreshed.
 *
 * The window each run covers is decided server-side and is INCREMENTAL — it
 * extends what the connection already imported rather than re-fetching a
 * fixed trailing window — so repeated syncs accumulate history instead of
 * rewriting the same dates.
 */
export function usePerformanceSync(projectId: string | null) {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<PerformanceSyncEnqueueResponse>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => performanceApi.syncNow(projectId ?? ''),
    onSuccess: (enqueued) => {
      if (!enqueued.length) {
        setNotice(
          'No active mapped sync connection — connect and map one in Settings to start syncing.',
        );
        return;
      }
      setNotice(null);
      setRuns(enqueued);
      setStartedAt(new Date().toISOString());
    },
  });
  const runQueries = useQueries({
    queries: runs.map((run) => ({
      queryKey: queryKeys.integrations.sync(run.connection_id, run.sync_run_id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        integrationsApi.getSync(run.connection_id, run.sync_run_id, { signal }),
      refetchInterval: (query: { state: { data?: IntegrationSyncRun } }) => {
        const result = query.state.data;
        return !result || isActiveSyncRun(result.status) ? SYNC_RUN_POLL_MS : false;
      },
    })),
  });
  const enqueued = runs.length > 0;
  const allTerminal =
    enqueued &&
    runQueries.every((query) => query.data !== undefined && !isActiveSyncRun(query.data.status));
  const syncing = enqueued && !allTerminal;
  const outcome = !allTerminal
    ? null
    : runQueries.every((query) => query.data && isSucceededSyncRun(query.data.status))
      ? 'succeeded'
      : 'failed';

  useEffect(() => {
    if (!allTerminal) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.performance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
  }, [allTerminal, queryClient]);

  return { mutation, notice, outcome, startedAt, syncing };
}
