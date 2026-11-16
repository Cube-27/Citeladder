import type { ReactNode } from 'react';

import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { VisibilityEmptyState } from '@/components/visibility/empty-state';
import { FanoutEvidence } from '@/components/visibility/fanout-evidence';
import { VisibilitySources } from '@/components/visibility/visibility-sources';
import { VisibilityPerception } from '@/components/visibility/visibility-perception';
import { VisibilityAccuracy } from '@/components/visibility/visibility-accuracy';
import { VisibilityAds } from '@/components/visibility/visibility-ads';
import { VisibilityByMarket } from '@/components/visibility/visibility-by-market';
import { SelectionGate } from '@/components/visibility/selection-gate';
import type { Visibility } from '@citeladder/contracts';
import {
  VisibilityActions,
  useVisibilityFilterMenu,
} from '@/components/visibility/visibility-toolbar';
import { VisibilityTrends } from '@/components/visibility/visibility-trends';
import type { FilterDefinition } from '@/components/ui/all-filters';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar } from '@/components/ui/filter-bar';
import { useBrandFacts } from '@/lib/project/use-brand-facts';
import { visibleTabs, type VisibilityTab } from '@/lib/visibility/dashboard';
import {
  EVIDENCE_LIMIT,
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';
import { StateBlock } from '@/components/ui/state-block';
import { SectionStack } from '@/components/ui/section';

type VisibilityDashboardState = 'loading' | 'error' | 'empty' | null;

export function VisibilityDashboard() {
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters);
  const state = dashboardState(
    queries.auditsQuery.isLoading,
    queries.auditsQuery.isError,
    queries.hasRuns,
  );
  // The Sources filters are listed in the page's control row but stay owned
  // by the Sources panel; the provider spans both.
  return <VisibilityWorkspace filters={filters} queries={queries} state={state} />;
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
  queries,
}: Readonly<{
  state: Exclude<VisibilityDashboardState, null>;
  queries: ReturnType<typeof useVisibilityQueries>;
}>) {
  const { auditsQuery } = queries;
  if (state === 'empty') return <VisibilityEmptyState activeRun={queries.activeRun ?? null} />;
  // Loading takes the overview's shape: its figures, then its chart, then its table.
  if (state === 'loading')
    return (
      <SectionStack aria-busy>
        <StateBlock kind="loading" label="Loading visibility…" shape={{ kind: 'figures' }} />
        <StateBlock kind="loading" label="Loading the trend…" shape={{ kind: 'chart' }} />
        <StateBlock kind="loading" label="Loading the evidence…" shape={{ kind: 'table' }} />
      </SectionStack>
    );
  if (state === 'error')
    return (
      <StateBlock
        kind="error"
        error={auditsQuery.error}
        title="Couldn't load this project's runs"
        fallback="Check your connection and try again."
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
  const pageFilters = useVisibilityPageFilters({ filters, queries });
  // One frame across states: the tabs always show; the filters only over data
  // (on a failed refetch, over the data the page already showed).
  const showFilters = state === null || (state === 'error' && queries.hasRuns);
  // The root spans the whole page: the filters every tab shares follow the
  // strip, and the panels are one band below. A table's own filters
  // lead its toolbar.
  return (
    <TabsRoot value={filters.activeTab} onValueChange={filters.selectTab}>
      <ReportPage
        // Empty, the state carries the next step, so the masthead leaves out Launch run.
        actions={<VisibilityActions launch={state !== 'empty'} />}
        tabs={
          <TabRow
            items={visibleTabs(factChecking).map((tab) => ({ value: tab.id, label: tab.label }))}
            ariaLabel="Visibility views"
            onIntent={queries.prefetchTab}
          />
        }
        filters={showFilters ? <FilterBar filters={pageFilters} /> : undefined}
      >
        {queries.activeRun && state !== 'empty' ? (
          <ActiveRunBanner run={queries.activeRun} />
        ) : null}
        <TabPanel value={filters.activeTab} className="focus-ring">
          {state ? (
            <DashboardState state={state} queries={queries} />
          ) : (
            <DashboardPanel filters={filters} queries={queries} />
          )}
        </TabPanel>
      </ReportPage>
    </TabsRoot>
  );
}

/**
 * The page's filters: the filters every tab shares (measurement, surface,
 * prompts, period). A tab's table keeps its own in its toolbar.
 */
function useVisibilityPageFilters({
  filters,
  queries,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
}>): readonly FilterDefinition[] {
  return useVisibilityFilterMenu({
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
}

function DashboardPanel({
  filters,
  queries,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
}>) {
  // Every panel below reads the selection's run, so each waits behind the
  // selection's own state; the market table reads the project and does not.
  const gated = (panel: (selected: Visibility) => ReactNode) => (
    <SelectionGate query={queries.visibilityQuery}>{panel}</SelectionGate>
  );
  const panels: Partial<Record<VisibilityTab, ReactNode>> = {
    trends: (
      <SectionStack>
        <VisibilityByMarket
          query={queries.marketRowsQuery}
          markets={queries.markets}
          market={filters.market}
          onSelectMarket={filters.setMarket}
        />
        {gated((selected) => (
          <VisibilityTrends
            query={queries.trendQuery}
            selected={selected}
            selectionBusy={queries.visibilityQuery.isFetching}
            engineFilter={filters.engine}
            surfaceRatesQuery={queries.surfaceRatesQuery}
            surfaceEngine={queries.surfaceEngine}
            hasRuns={queries.hasRuns}
            isFiltered={filters.isTrendFiltered}
            onEvidence={filters.openEvidence}
          />
        ))}
      </SectionStack>
    ),
    sources: gated(() => <VisibilitySources filters={filters} queries={queries} />),
    perception: gated(() => <VisibilityPerception filters={filters} queries={queries} />),
    accuracy: gated(() => <VisibilityAccuracy filters={filters} queries={queries} />),
    ads: gated(() => <VisibilityAds filters={filters} queries={queries} />),
    'query-fanout': gated(() => (
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
    )),
  };
  return panels[filters.activeTab] ?? null;
}
