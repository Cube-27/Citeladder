'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { EngineFilter } from '@/components/visibility/visibility-toolbar';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { runsQueries } from '@/lib/api/runs';
import { visibilityApi } from '@/lib/api/visibility';
import {
  findActiveRun,
  isEvidenceTab,
  VISIBILITY_TABS,
  toPromptOptions,
  toRunOptions,
  type VisibilityTab,
} from '@/lib/visibility/dashboard';
import { shouldPollAudit } from '@/lib/runs/status';
import { ACTIVE_RUN_POLL_MS, EVIDENCE_LIMIT } from '@/lib/config/operational';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';

/** Compatibility exports for existing visibility consumers and tests. */
export { EVIDENCE_LIMIT } from '@/lib/config/operational';
import { rangeToFrom, type TrendGranularity, type TrendRange } from '@/lib/visibility/trends';

const VISIBILITY_TAB_CODEC = stringUrlCodec(
  VISIBILITY_TABS.map(({ id }) => id),
  'trends' as VisibilityTab,
);

/**
 * The Visibility workspace's URL-synced tab + shared filter state.
 *
 * The active tab is owned by `?tab=` (invalid values fall back to Trends), so
 * refresh / back / forward preserve it without a mirrored local store. Shared filter state lives
 * here and persists across tab switches; hidden controls keep their state.
 * Ownership: selected run → Trends + both evidence tabs; logical
 * engine → every tab; prompt → both evidence tabs; date range → Trends + both
 * evidence tabs; granularity → Trends only.
 */
export function useVisibilityFilters() {
  const [activeTab, setActiveTab] = useUrlState('tab', VISIBILITY_TAB_CODEC);

  // Shared filter state (persists across tab switches).
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineFilter>('all');
  const [promptId, setPromptId] = useState<string | null>(null);
  const [range, setRange] = useState<TrendRange>('90d');
  const [granularity, setGranularity] = useState<TrendGranularity>('run');
  const [cohort, setCohort] = useState<'core' | 'comparison'>('core');

  function selectTab(tab: VisibilityTab) {
    // The shared URL-state owner pushes a shallow history entry and emits one
    // subscription event, avoiding an App Router round trip and a mirrored
    // local tab store while preserving browser Back across visible views.
    setActiveTab(tab);
  }

  // A narrowing filter (engine, bounded range, or a specific prompt) is active —
  // used to explain a filtered-empty result vs a genuinely empty history.
  const isFiltered = engine !== 'all' || range !== 'all' || promptId !== null || cohort !== 'core';
  const isTrendFiltered = engine !== 'all' || range !== 'all' || cohort !== 'core';

  function clearEvidenceFilters() {
    setEngine('all');
    setRange('all');
    setPromptId(null);
    setCohort('core');
  }

  return {
    activeTab,
    selectTab,
    selectedRunId,
    setSelectedRunId,
    engine,
    setEngine,
    promptId,
    setPromptId,
    range,
    setRange,
    granularity,
    setGranularity,
    cohort,
    setCohort,
    isFiltered,
    isTrendFiltered,
    clearEvidenceFilters,
  };
}

/**
 * The project's dashboard-ready runs: the audits list, the run-selector
 * options, and the optional explicit run filter. The default remains `null`
 * so projection endpoints resolve their latest run immediately server-side;
 * the audits list is not a prerequisite for the first analytical request.
 */
function useRunSelection(projectId: string | null, selectedRunId: string | null) {
  const auditsQuery = useQuery({
    ...runsQueries.list(projectId ?? ''),
    enabled: Boolean(projectId),
    // While any run is still progressing, keep the audits list fresh so an
    // in-progress run is visible here (not only on /runs/[runId]) and its
    // snapshot appears the moment it completes. Stops when all runs are
    // terminal.
    refetchInterval: (query) => {
      const audits = query.state.data;
      return audits?.some((audit) => shouldPollAudit(audit.status)) ? ACTIVE_RUN_POLL_MS : false;
    },
  });

  const runOptions = useMemo(() => toRunOptions(auditsQuery.data ?? []), [auditsQuery.data]);
  const activeRun = useMemo(() => findActiveRun(auditsQuery.data ?? []), [auditsQuery.data]);
  useLatestRunInvalidation(
    projectId,
    auditsQuery.data === undefined ? undefined : (runOptions[0]?.id ?? null),
  );

  const activeRunId = useMemo(() => {
    if (selectedRunId && runOptions.some((run) => run.id === selectedRunId)) {
      return selectedRunId;
    }
    return null;
  }, [runOptions, selectedRunId]);

  return {
    auditsQuery,
    runOptions,
    activeRun,
    activeRunId,
    hasRuns: runOptions.length > 0,
  };
}

/** Refresh `latest` projections when polling observes a newly dashboard-ready run. */
function useLatestRunInvalidation(
  projectId: string | null,
  latestDashboardRunId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const previous = useRef<{ projectId: string; runId: string | null } | null>(null);

  useEffect(() => {
    if (!projectId || latestDashboardRunId === undefined) return;
    const prior = previous.current;
    previous.current = { projectId, runId: latestDashboardRunId };
    if (!prior || prior.projectId !== projectId || prior.runId === latestDashboardRunId) return;

    // The server-resolved `latest` keys do not change when run B supersedes run
    // A. Mark cached Visibility projections stale so the active tab refetches
    // immediately and inactive evidence is refreshed
    // on its next intent/mount instead of serving run A for the global staleTime.
    void queryClient.invalidateQueries({ queryKey: queryKeys.visibility.all });
  }, [latestDashboardRunId, projectId, queryClient]);
}

/**
 * The shared execution-evidence queries for the two evidence tabs. ONE
 * identical cache key drives both tabs, so switching between Mentions &
 * Citations and Query Fanout reuses the cache instead of refetching.
 * `audit_id` + date bound intersect server-side.
 *
 * Prompt options for the evidence prompt selector must NOT collapse when a
 * prompt is selected, so they are derived from a parallel evidence query that
 * keeps the run/engine/date scope but omits `prompt_id`. When no prompt is
 * selected that key is identical to the main evidence query, so it reuses the
 * cache and issues no extra request; only a selected prompt filter triggers a
 * second (unfiltered-by-prompt) fetch to keep the list stable.
 */
function useEvidenceQueries(
  projectId: string | null,
  enabled: boolean,
  scope: Readonly<{
    activeRunId: string | null;
    promptId: string | null;
    engineParam: string | undefined;
    fromParam: string | undefined;
    cohort: 'core' | 'comparison';
  }>,
) {
  const queryClient = useQueryClient();
  const { activeRunId, promptId, engineParam, fromParam, cohort } = scope;
  const evidenceParams = {
    audit_id: activeRunId ?? undefined,
    prompt_id: promptId ?? undefined,
    engine: engineParam,
    from: fromParam,
    limit: EVIDENCE_LIMIT,
    cohort,
  };
  const keyFilters = {
    audit_id: activeRunId ?? null,
    engine: engineParam ?? null,
    from: fromParam ?? null,
    limit: EVIDENCE_LIMIT,
    cohort,
  };

  const evidenceOptions = {
    queryKey: queryKeys.visibility.evidence(projectId ?? '', {
      ...keyFilters,
      prompt_id: promptId ?? null,
    }),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      visibilityApi.getVisibilityEvidence(projectId!, evidenceParams, { signal }),
  };
  const evidenceQuery = useQuery({
    ...evidenceOptions,
    enabled,
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
  });

  const promptEvidenceOptions = {
    queryKey: queryKeys.visibility.evidence(projectId ?? '', {
      ...keyFilters,
      prompt_id: null,
    }),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      visibilityApi.getVisibilityEvidence(
        projectId!,
        { ...evidenceParams, prompt_id: undefined },
        { signal },
      ),
  };
  const promptOptionsQuery = useQuery({
    ...promptEvidenceOptions,
    enabled,
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
  });
  const promptOptions = useMemo(
    () => toPromptOptions(promptOptionsQuery.data?.items ?? []),
    [promptOptionsQuery.data],
  );

  const prefetch = () => {
    if (!projectId) return;
    void Promise.all([
      queryClient.prefetchQuery(evidenceOptions),
      queryClient.prefetchQuery(promptEvidenceOptions),
    ]);
  };

  return { evidenceQuery, promptOptions, prefetch };
}

/**
 * The Visibility workspace's per-tab queries. The default Trends projection
 * starts as soon as the project is known, with `audit_id` omitted so the server
 * resolves latest. Tab intent prefetches the other bounded projection before
 * selection, while inactive tabs still avoid an unsolicited cold request.
 */
export function useVisibilityQueries(
  projectId: string | null,
  filters: ReturnType<typeof useVisibilityFilters>,
) {
  const queryClient = useQueryClient();
  const runs = useRunSelection(projectId, filters.selectedRunId);
  const scope = useQueryScope(filters);
  const trendsEnabled = Boolean(projectId) && filters.activeTab === 'trends';
  const visibilityQuery = useVisibilityProjection(
    projectId,
    runs.activeRunId,
    scope.cohort,
    trendsEnabled,
  );
  const trendQuery = useTrendQuery(projectId, scope, trendsEnabled);
  const evidence = useEvidenceQueries(
    projectId,
    Boolean(projectId) && isEvidenceTab(filters.activeTab),
    { activeRunId: runs.activeRunId, promptId: filters.promptId, ...scope },
  );
  const prefetchTab = (tab: VisibilityTab) => {
    if (!projectId) return;
    if (tab === 'trends') {
      void Promise.all([
        queryClient.prefetchQuery(
          visibilityProjectionOptions(projectId, runs.activeRunId, scope.cohort),
        ),
        queryClient.prefetchQuery(trendOptions(projectId, scope)),
      ]);
      return;
    }
    evidence.prefetch();
  };
  return { ...runs, visibilityQuery, trendQuery, ...evidence, prefetchTab };
}

function useQueryScope(filters: ReturnType<typeof useVisibilityFilters>) {
  const engineParam = filters.engine === 'all' ? undefined : filters.engine;
  const fromParam = useMemo(() => rangeToFrom(filters.range), [filters.range]);
  return { engineParam, fromParam, granularity: filters.granularity, cohort: filters.cohort };
}

function useVisibilityProjection(
  projectId: string | null,
  activeRunId: string | null,
  cohort: 'core' | 'comparison',
  enabled: boolean,
) {
  return useQuery({
    ...visibilityProjectionOptions(projectId ?? '', activeRunId, cohort),
    enabled,
  });
}

function visibilityProjectionOptions(
  projectId: string,
  activeRunId: string | null,
  cohort: 'core' | 'comparison',
) {
  return {
    queryKey: [...queryKeys.visibility.project(projectId, activeRunId ?? undefined), cohort],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      visibilityApi.getProjectVisibility(
        projectId,
        { audit_id: activeRunId ?? undefined, cohort },
        { signal },
      ),
  };
}

function useTrendQuery(
  projectId: string | null,
  scope: ReturnType<typeof useQueryScope>,
  enabled: boolean,
) {
  return useQuery({
    ...trendOptions(projectId ?? '', scope),
    enabled,
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
  });
}

function trendOptions(projectId: string, scope: ReturnType<typeof useQueryScope>) {
  return {
    queryKey: queryKeys.visibility.trends(projectId, {
      engine: scope.engineParam ?? null,
      from: scope.fromParam ?? null,
      granularity: scope.granularity,
      cohort: scope.cohort,
    }),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      visibilityApi.getVisibilityTrends(
        projectId,
        {
          engine: scope.engineParam,
          from: scope.fromParam,
          granularity: scope.granularity,
          cohort: scope.cohort,
        },
        { signal },
      ),
  };
}
