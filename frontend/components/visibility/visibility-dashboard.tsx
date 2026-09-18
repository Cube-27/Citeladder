'use client';

import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { PageLoading } from '@/components/layout/page-loading';
import { VisibilityEmptyState } from '@/components/visibility/empty-state';
import { FanoutEvidence } from '@/components/visibility/fanout-evidence';
import { VisibilitySources } from '@/components/visibility/visibility-sources';
import { VisibilityActions, VisibilityToolbar } from '@/components/visibility/visibility-toolbar';
import { VisibilityTrends } from '@/components/visibility/visibility-trends';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import { PageShell } from '@/components/layout/page-shell';
import { Stack } from '@/components/ui/layout';
import { useProjectContext } from '@/lib/project/project-context';
import { VISIBILITY_TABS, type VisibilityTab } from '@/lib/visibility/dashboard';
import {
  EVIDENCE_LIMIT,
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

type VisibilityDashboardState = 'loading' | 'missing-project' | 'error' | 'empty' | null;

export function VisibilityDashboard() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(projectId, filters);
  const state = dashboardState(
    projectId,
    projectLoading,
    queries.auditsQuery.isLoading,
    queries.auditsQuery.isError,
    queries.hasRuns,
  );
  return <VisibilityWorkspace filters={filters} queries={queries} state={state} />;
}

function dashboardState(
  projectId: string | null,
  projectLoading: boolean,
  auditsLoading: boolean,
  auditsError: boolean,
  hasRuns: boolean,
): VisibilityDashboardState {
  if (projectLoading || (Boolean(projectId) && auditsLoading)) return 'loading';
  if (!projectId) return 'missing-project';
  if (auditsError) return 'error';
  if (!hasRuns) return 'empty';
  return null;
}

function DashboardState({
  state,
}: Readonly<{ state: Exclude<VisibilityDashboardState, 'empty' | null> }>) {
  if (state === 'loading') return <PageLoading label="Loading visibility…" />;
  if (state === 'missing-project')
    return <Alert tone="info">Select or create a project to see its AI-visibility results.</Alert>;
  if (state === 'error')
    return (
      <Alert tone="danger">
        Could not load this project&apos;s runs. Check your connection and try again.
      </Alert>
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
  if (state === 'empty') {
    return (
      <PageShell actions={<VisibilityActions />}>
        <Stack gap="workspace">
          {queries.activeRun ? <ActiveRunBanner run={queries.activeRun} /> : null}
          <VisibilityEmptyState hasActiveRun={Boolean(queries.activeRun)} />
        </Stack>
      </PageShell>
    );
  }
  // The root spans the whole page: the strip is the navigation band and its
  // panels are two bands below, in the content region.
  return (
    <TabsRoot value={filters.activeTab} onValueChange={filters.selectTab}>
      <PageShell
        actions={<VisibilityActions />}
        tabs={
          <TabsBar
            variant="band"
            items={VISIBILITY_TABS.map((tab) => ({
              value: tab.id,
              label: tab.label,
            }))}
            ariaLabel="Visibility views"
            onIntent={queries.prefetchTab}
          />
        }
        controls={
          <VisibilityToolbar
            activeTab={filters.activeTab}
            runs={queries.runOptions}
            selectedRunId={filters.selectedRunId}
            onSelectMeasurement={filters.selectMeasurement}
            engine={filters.engine}
            onChangeEngine={filters.setEngine}
            promptOptions={queries.promptOptions}
            promptId={filters.promptId}
            onChangePrompt={filters.setPromptId}
            range={filters.range}
            onChangeRange={filters.setRange}
            granularity={filters.granularity}
            onChangeGranularity={filters.setGranularity}
            cohort={filters.cohort}
            onChangeCohort={filters.setCohort}
            selectionMode={filters.selectionMode}
            onChangeSelectionMode={filters.setSelectionMode}
            outcome={filters.outcome}
            onChangeOutcome={filters.setOutcome}
          />
        }
      >
        <Stack gap="workspace">
          {queries.activeRun ? <ActiveRunBanner run={queries.activeRun} /> : null}
          <TabPanel value={filters.activeTab} className="focus-ring">
            {state ? (
              <DashboardState state={state} />
            ) : (
              <DashboardPanel filters={filters} queries={queries} />
            )}
          </TabPanel>
        </Stack>
      </PageShell>
    </TabsRoot>
  );
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
    ),
    sources: <VisibilitySources filters={filters} queries={queries} />,
    'query-fanout': (
      <FanoutEvidence
        query={queries.evidenceQuery}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clearEvidenceFilters}
        limit={EVIDENCE_LIMIT}
        projectId={queries.projectId}
        runId={queries.activeRunId}
        scope={queries.evidenceScope}
        scopeReady={queries.hasEvidenceScope}
        scopeNarrowed={queries.evidenceScopeNarrowed}
      />
    ),
  };
  return panels[filters.activeTab] ?? null;
}
