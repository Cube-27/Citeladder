'use client';

import type { ReactNode } from 'react';

import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { VisibilityEmptyState } from '@/components/visibility/empty-state';
import { FanoutEvidence, useFanoutGroupFilter } from '@/components/visibility/fanout-evidence';
import {
  SourceFiltersProvider,
  useSourceFilters,
} from '@/components/visibility/source-filter-registry';
import { VisibilitySources } from '@/components/visibility/visibility-sources';
import { VisibilityPerception } from '@/components/visibility/visibility-perception';
import { VisibilityAccuracy } from '@/components/visibility/visibility-accuracy';
import { VisibilityAds } from '@/components/visibility/visibility-ads';
import { VisibilityByMarket } from '@/components/visibility/visibility-by-market';
import {
  VisibilityActions,
  useVisibilityFilterMenu,
} from '@/components/visibility/visibility-toolbar';
import { VisibilityTrends } from '@/components/visibility/visibility-trends';
import { AllFilters, type FilterDefinition } from '@/components/ui/all-filters';
import { TabPanel, TabsRoot } from '@/components/ui/tabs';
import { ListScreen } from '@/components/layout/page-shell';
import { QueryState } from '@/components/ui/query-state';
import { Stack } from '@/components/ui/layout';
import { useBrandFacts } from '@/lib/project/use-brand-facts';
import { visibleTabs, type VisibilityTab } from '@/lib/visibility/dashboard';
import {
  EVIDENCE_LIMIT,
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

type VisibilityDashboardState = 'loading' | 'error' | 'empty' | null;

export function VisibilityDashboard() {
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters);
  const state = dashboardState(
    queries.auditsQuery.isLoading,
    queries.auditsQuery.isError,
    queries.hasRuns,
  );
  // The Sources filters are listed in the page's All filters but stay owned
  // by the Sources panel; the provider spans both.
  return (
    <SourceFiltersProvider>
      <VisibilityWorkspace filters={filters} queries={queries} state={state} />
    </SourceFiltersProvider>
  );
}

function dashboardState(
  auditsLoading: boolean,
  auditsError: boolean,
  hasRuns: boolean,
): VisibilityDashboardState {
  if (auditsLoading) return 'loading';
  if (auditsError) return 'error';
  if (!hasRuns) return 'empty';
  return null;
}

function DashboardState({
  state,
  auditsQuery,
}: Readonly<{
  state: Exclude<VisibilityDashboardState, 'empty' | null>;
  auditsQuery: ReturnType<typeof useVisibilityQueries>['auditsQuery'];
}>) {
  if (state === 'loading') return <QueryState kind="loading" label="Loading visibility…" />;
  if (state === 'error')
    return (
      <QueryState
        kind="error"
        error={auditsQuery.error}
        fallback="Could not load this project's runs. Check your connection and try again."
        onRetry={() => void auditsQuery.refetch()}
        pending={auditsQuery.isFetching}
      />
    );
  return null;
}

function VisibilityWorkspace({
  filters,
  queries,
  state,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  state: VisibilityDashboardState;
}>) {
  // The Accuracy tab exists only inside the fact-checking pilot.
  const factChecking = useBrandFacts().data?.enabled ?? false;
  if (state === 'empty') {
    return (
      <ListScreen actions={<VisibilityActions />}>
        {queries.activeRun ? <ActiveRunBanner run={queries.activeRun} /> : null}
        <VisibilityEmptyState hasActiveRun={Boolean(queries.activeRun)} />
      </ListScreen>
    );
  }
  // The root spans the whole page: the strip is the navigation band and its
  // panels are one band below, in the content region. Every filter is in the
  // All filters menu at the strip's far right; there is no filter row.
  return (
    <TabsRoot value={filters.activeTab} onValueChange={filters.selectTab}>
      <ListScreen
        actions={<VisibilityActions />}
        tabs={{
          items: visibleTabs(factChecking).map((tab) => ({
            value: tab.id,
            label: tab.label,
          })),
          ariaLabel: 'Visibility views',
          onIntent: queries.prefetchTab,
          controls: <VisibilityAllFilters filters={filters} queries={queries} state={state} />,
        }}
      >
        {queries.activeRun ? <ActiveRunBanner run={queries.activeRun} /> : null}
        <TabPanel value={filters.activeTab} className="focus-ring">
          {state ? (
            <DashboardState state={state} auditsQuery={queries.auditsQuery} />
          ) : (
            <DashboardPanel filters={filters} queries={queries} />
          )}
        </TabPanel>
      </ListScreen>
    </TabsRoot>
  );
}

/**
 * The page's All filters: the filters every tab shares, then the active tab's
 * own (the Sources table's, published by its panel; the fanout grouping), so
 * a tab's own filters never move the shared ones.
 */
function VisibilityAllFilters({
  filters,
  queries,
  state,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  state: VisibilityDashboardState;
}>) {
  const shared = useVisibilityFilterMenu({
    activeTab: filters.activeTab,
    runs: queries.runOptions,
    selectedRunId: filters.selectedRunId,
    onSelectMeasurement: filters.selectMeasurement,
    engine: filters.engine,
    onChangeEngine: filters.setEngine,
    promptOptions: queries.promptOptions,
    promptId: filters.promptId,
    onChangePrompt: filters.setPromptId,
    range: filters.range,
    onChangeRange: filters.setRange,
    granularity: filters.granularity,
    onChangeGranularity: filters.setGranularity,
    cohort: filters.cohort,
    onChangeCohort: filters.setCohort,
    selectionMode: filters.selectionMode,
    onChangeSelectionMode: filters.setSelectionMode,
    outcome: filters.outcome,
    onChangeOutcome: filters.setOutcome,
    markets: queries.markets,
    market: filters.market,
    onChangeMarket: filters.setMarket,
  });
  const sources = useSourceFilters();
  const fanoutGroup = useFanoutGroupFilter();
  const own: Partial<Record<VisibilityTab, readonly FilterDefinition[]>> = {
    sources,
    'query-fanout': [fanoutGroup],
  };
  const tabFilters = state ? [] : (own[filters.activeTab] ?? []);
  return <AllFilters filters={[...shared, ...tabFilters]} />;
}

function DashboardPanel({
  filters,
  queries,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
}>) {
  const panels: Partial<Record<VisibilityTab, ReactNode>> = {
    trends: (
      <Stack gap="workspace">
        <VisibilityByMarket
          query={queries.marketRowsQuery}
          markets={queries.markets}
          market={filters.market}
          onSelectMarket={filters.setMarket}
        />
        <VisibilityTrends
          query={queries.trendQuery}
          visibilityQuery={queries.visibilityQuery}
          engineFilter={filters.engine}
          surfaceRatesQuery={queries.surfaceRatesQuery}
          surfaceEngine={queries.surfaceEngine}
          hasRuns={queries.hasRuns}
          isFiltered={filters.isTrendFiltered}
          onEvidence={filters.openEvidence}
        />
      </Stack>
    ),
    sources: <VisibilitySources filters={filters} queries={queries} />,
    perception: <VisibilityPerception filters={filters} queries={queries} />,
    accuracy: <VisibilityAccuracy filters={filters} queries={queries} />,
    ads: <VisibilityAds filters={filters} queries={queries} />,
    'query-fanout': (
      <FanoutEvidence
        query={queries.evidenceQuery}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clearEvidenceFilters}
        limit={EVIDENCE_LIMIT}
        runId={queries.activeRunId}
        scope={queries.evidenceScope}
        scopeReady={queries.hasEvidenceScope}
        scopeNarrowed={queries.evidenceScopeNarrowed}
      />
    ),
  };
  return panels[filters.activeTab] ?? null;
}
