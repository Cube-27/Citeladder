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
 * How long to keep refetching after the last sync run goes terminal, and how
 * often. The projection chain (derive -> snapshot refresh, or ingest ->
 * classify -> snapshot for referrals) runs on the analytics worker after the
 * import, so the fresh numbers appear seconds later, not instantly. Ten
 * polls at three seconds covers ~30s of catch-up.
 */
const PROJECTION_SETTLE_POLLS = 10;
const PROJECTION_POLL_MS = 3_000;

/**
 * "Sync now" for the Performance surface: enqueue one integrations run per
 * active mapped connection, poll each to terminal, then invalidate the
 * projections the completed runs refreshed.
 *
 * The window each run covers is decided server-side and is INCREMENTAL — it
 * extends what the connection already imported rather than re-fetching a
 * fixed trailing window — so repeated syncs accumulate history instead of
 * rewriting the same dates.
 *
 * A terminal sync run means the IMPORT finished, NOT that the projection did:
 * the worker enqueues `traffic_snapshot_refresh` (and, for referral datasets,
 * ingest -> classify -> `ai_referrals_snapshot_refresh`) only after
 * derivation, so those tasks are still queued when the run reports success.
 * Invalidating once at that moment refetches the OLD snapshot and the screen
 * looks unchanged until something else triggers a refetch — the "GA4 only
 * updates after a few refreshes" symptom, worst on the longest chain. So the
 * hook keeps refetching for a bounded settling period after the run goes
 * terminal, and stops as soon as the projection lands.
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
  // ANY succeeded run enqueues projections, so this is not `outcome ===
  // 'succeeded'`: that is all-or-nothing, and a batch where GSC imported and
  // Bing failed still has fresh evidence to project.
  const anySucceeded = runQueries.some(
    (query) => query.data && isSucceededSyncRun(query.data.status),
  );

  // Refetch on the terminal edge, then keep polling while the projection
  // catches up. Bounded so a projection that never lands (a failed refresh
  // task) settles into a normal screen instead of polling forever.
  // Counted in POLLS rather than a wall-clock deadline: the count is pure to
  // compute during render, where the ACTIVE -> TERMINAL edge is detected
  // (React's derived-state pattern, as the date dialog uses for its draft).
  // An effect that setState'd here would render the stale screen once before
  // polling started — the very lag this exists to remove.
  const [pollsLeft, setPollsLeft] = useState(0);
  const [wasTerminal, setWasTerminal] = useState(allTerminal);
  if (allTerminal !== wasTerminal) {
    setWasTerminal(allTerminal);
    // A batch where EVERY run failed enqueues no projection, so there is
    // nothing to wait for — polling would just hold the "syncing" banner up
    // for half a minute after a failure the user can already see.
    if (allTerminal && anySucceeded) setPollsLeft(PROJECTION_SETTLE_POLLS);
  }

  const projecting = pollsLeft > 0;
  useEffect(() => {
    if (pollsLeft <= 0) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.performance.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
    const timer = setTimeout(() => setPollsLeft((current) => current - 1), PROJECTION_POLL_MS);
    return () => clearTimeout(timer);
  }, [pollsLeft, queryClient]);

  return { mutation, notice, outcome, startedAt, syncing: syncing || projecting };
}
