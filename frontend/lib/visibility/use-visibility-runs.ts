import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { AUDIT_LIST_DEFAULT_MARKET, type Audit } from '@citeladder/contracts/audits';
import { retainPreviousDataForScope, warmQuery } from '@/lib/api/query-client';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { runsQueries, type RunsPageParams } from '@/lib/api/runs';
import { refreshVisibility } from '@/lib/api/visibility-queries';
import { TABLE_DEFAULT_PAGE_SIZE } from '@/lib/config/tables';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import type { ActiveProjectScope } from '@/lib/project/active-project-scope';
import { ACTIVE_AUDIT_STATUSES, countedStatuses, pollAudits, statusCount } from '@/lib/runs/status';
import { DASHBOARD_STATUSES, toRunOptions, type ActiveRun } from '@/lib/visibility/dashboard';

type RequestScope = Pick<ActiveProjectScope, 'workspaceId' | 'projectId'>;

export function brandRunsParams(market: string | null, page = 1): RunsPageParams {
  return {
    audit_scope: 'brand',
    market: market ?? AUDIT_LIST_DEFAULT_MARKET,
    status: DASHBOARD_STATUSES,
    sort: 'finished',
    page,
    page_size: TABLE_DEFAULT_PAGE_SIZE,
  };
}

export function warmBrandRuns(client: QueryClient, scope: ProjectScope) {
  warmQuery(client, runsQueries.list(scope, brandRunsParams(null)));
}

const ACTIVE_RUN_PARAMS: RunsPageParams = {
  audit_scope: 'brand',
  status: ACTIVE_AUDIT_STATUSES,
  sort: 'created',
  page_size: 1,
};

function activeRunOf(audit: Audit | undefined): ActiveRun | null {
  return audit ? { id: audit.id, status: audit.status, createdAt: audit.created_at } : null;
}

export type RunPicker = ReturnType<typeof useVisibilityRuns>['runPicker'];

export type RunWindow = Readonly<{ from: string | undefined; to: string | undefined }>;

function useRunWindow(requestScope: RequestScope, market: string | null, window: RunWindow | null) {
  const query = useQuery({
    ...runsQueries.list(requestScope, {
      ...brandRunsParams(market),
      completed_from: window?.from,
      completed_to: window?.to,
      page_size: 1,
    }),
    enabled: window !== null,
  });
  return query.data === undefined ? undefined : query.data.total > 0;
}

function useRunPicker(requestScope: RequestScope, market: string | null) {
  const [paged, setPaged] = useState({ market, page: 1 });
  const page = paged.market === market ? paged.page : 1;
  const latestQuery = useQuery({
    ...runsQueries.list(requestScope, brandRunsParams(market)),
    refetchInterval: (query) => pollAudits(countedStatuses(query.state.data?.status_counts)),
  });
  const pageQuery = useQuery({
    ...runsQueries.list(requestScope, brandRunsParams(market, page)),
    enabled: page > 1,
    placeholderData: (data, previous) =>
      retainPreviousDataForScope(requestScope.projectId, data, previous),
  });
  const shown = page > 1 ? pageQuery.data : latestQuery.data;
  const total = shown?.total ?? 0;
  return {
    latestQuery,
    items: shown?.items,
    runPage: {
      canPrev: page > 1,
      canNext: page * TABLE_DEFAULT_PAGE_SIZE < total,
      onPrev: () => setPaged({ market, page: Math.max(1, page - 1) }),
      onNext: () => setPaged({ market, page: page + 1 }),
    },
  };
}

export function useVisibilityRuns({
  requestScope,
  market,
  selectedRunId,
  window,
}: Readonly<{
  requestScope: RequestScope;
  market: string | null;
  selectedRunId: string | null;
  window: RunWindow | null;
}>) {
  const { workspaceId, projectId } = requestScope;
  const timeZone = useDisplayTimeZone();
  const queryClient = useQueryClient();
  const picker = useRunPicker(requestScope, market);
  const auditsQuery = picker.latestQuery;
  const counts = auditsQuery.data?.status_counts;
  const anyActive = counts ? statusCount(counts, ACTIVE_AUDIT_STATUSES) > 0 : false;
  const activeQuery = useQuery({
    ...runsQueries.list(requestScope, ACTIVE_RUN_PARAMS),
    enabled: anyActive,
    refetchInterval: (query) => pollAudits(query.state.data?.items.map((audit) => audit.status)),
  });
  const runOptions = useMemo(
    () => toRunOptions(picker.items ?? [], timeZone),
    [picker.items, timeZone],
  );
  const shownSelected = runOptions.some((run) => run.id === selectedRunId);
  const selectedQuery = useQuery({
    ...runsQueries.detail(workspaceId, selectedRunId ?? ''),
    enabled: selectedRunId !== null && auditsQuery.isSuccess && !shownSelected,
  });
  const [latestRun] = toRunOptions(auditsQuery.data?.items.slice(0, 1) ?? [], timeZone);
  const [selectedRun] = toRunOptions(selectedQuery.data ? [selectedQuery.data] : [], timeZone);
  const measured = counts ? statusCount(counts, DASHBOARD_STATUSES) : 0;
  const activeRun = anyActive ? activeRunOf(activeQuery.data?.items[0]) : null;
  const rangeHasRuns = useRunWindow(requestScope, market, window);
  const runSignal = `${measured}:${activeRun?.id ?? 'idle'}`;
  const previousSignal = useRef<string | undefined>(undefined);
  const loaded = auditsQuery.isSuccess;
  useEffect(() => {
    if (!loaded) return;
    const previous = previousSignal.current;
    previousSignal.current = runSignal;
    if (previous !== undefined && previous !== runSignal) {
      void refreshVisibility(queryClient, projectId);
    }
  }, [loaded, runSignal, queryClient, projectId]);
  return {
    queryClient,
    auditsQuery,
    runPicker: { runs: runOptions, latestRun, selectedRun, runPage: picker.runPage },
    hasRuns: measured > 0,
    activeRun,
    rangeHasRuns,
  };
}
