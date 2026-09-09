'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { PageLoading } from '@/components/layout/page-loading';
import { VisibilityEmptyState } from '@/components/visibility/empty-state';
import { FanoutEvidence } from '@/components/visibility/fanout-evidence';
import { FanoutSummary } from '@/components/visibility/fanout-summary';
import { MentionsCitations } from '@/components/visibility/mentions-citations';
import { VisibilitySources } from '@/components/visibility/visibility-sources';
import { VisibilityToolbar } from '@/components/visibility/visibility-toolbar';
import { VisibilityTrends } from '@/components/visibility/visibility-trends';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import { useProjectContext } from '@/lib/project/project-context';
import { VISIBILITY_TABS, type VisibilityTab } from '@/lib/visibility/dashboard';
import {
  EVIDENCE_LIMIT,
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

export function VisibilityDashboard() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(projectId, filters);
  const promptQuery = usePromptQuery(
    projectId,
    queries.activeRunId,
    filters,
    queries.visibilityQuery.data?.comparison?.baseline_audit_id,
    queries.selectedRunIds,
    queries.visibilityQuery.data?.comparison?.baseline_audit_ids,
  );
  const state = dashboardState(
    projectId,
    projectLoading,
    queries.auditsQuery.isLoading,
    queries.auditsQuery.isError,
    queries.hasRuns,
  );
  return (
    <VisibilityWorkspace
      filters={filters}
      queries={queries}
      promptQuery={promptQuery}
      state={state}
    />
  );
}

function usePromptQuery(
  projectId: string | null,
  activeRunId: string | null,
  filters: ReturnType<typeof useVisibilityFilters>,
  baselineId?: string | null,
  auditIds?: string[],
  baselineAuditIds?: string[],
) {
  const params = {
    engine: filters.engine === 'all' ? undefined : filters.engine,
    cohort: filters.cohort,
    baseline_id: baselineId ?? undefined,
    audit_ids: auditIds,
    baseline_audit_ids: baselineAuditIds,
  };
  return useQuery({
    queryKey: [...queryKeys.visibility.prompts(projectId ?? '', activeRunId ?? undefined), params],
    queryFn: ({ signal }) =>
      visibilityApi.getPromptMetrics(projectId ?? '', activeRunId ?? undefined, { signal }, params),
    enabled: filters.activeTab === 'trends' && Boolean(projectId && activeRunId),
  });
}

function dashboardState(
  projectId: string | null,
  projectLoading: boolean,
  auditsLoading: boolean,
  auditsError: boolean,
  hasRuns: boolean,
) {
  if (projectLoading || (Boolean(projectId) && auditsLoading)) return 'loading';
  if (!projectId) return 'missing-project';
  if (auditsError) return 'error';
  if (!hasRuns) return 'empty';
  return null;
}

function DashboardState({
  state,
  hasActiveRun,
}: Readonly<{ state: string; hasActiveRun: boolean }>) {
  if (state === 'loading') return <PageLoading label="Loading visibility…" />;
  if (state === 'missing-project')
    return <Alert tone="info">Select or create a project to see its AI-visibility results.</Alert>;
  if (state === 'error')
    return (
      <Alert tone="danger">
        Could not load this project&apos;s runs. Check your connection and try again.
      </Alert>
    );
  return <VisibilityEmptyState hasActiveRun={hasActiveRun} />;
}

function VisibilityWorkspace({
  filters,
  queries,
  promptQuery,
  state,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  promptQuery: ReturnType<typeof usePromptQuery>;
  state: string | null;
}>) {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      {queries.activeRun ? <ActiveRunBanner run={queries.activeRun} /> : null}
      <Tabs
        value={filters.activeTab}
        onValueChange={filters.selectTab}
        items={VISIBILITY_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
        ariaLabel="Visibility views"
        rootClassName="grid gap-[var(--workspace-gap)]"
        onIntent={queries.prefetchTab}
      >
        <div className="flex flex-wrap gap-2">
          <AnalysisChoice
            label="Measurement selection"
            value={filters.selectionMode}
            options={[
              { value: 'run', label: 'Selected run' },
              { value: 'range', label: 'All runs in range' },
            ]}
            onChange={filters.setSelectionMode}
          />
          {filters.selectionMode === 'run' ? (
            <AnalysisChoice
              label="Comparison baseline"
              value={filters.baselineId ?? 'auto'}
              options={[
                { value: 'auto', label: 'Previous compatible measurement' },
                ...queries.runOptions.map((run) => ({ value: run.id, label: run.label })),
              ]}
              onChange={(value) => filters.setBaselineId(value === 'auto' ? null : value)}
            />
          ) : null}
          {filters.selectionMode === 'range' && queries.visibilityQuery.data ? (
            <AnalysisChoice
              label="Frozen configuration"
              value={queries.visibilityQuery.data.comparison_key ?? ''}
              options={Object.entries(queries.visibilityQuery.data.configuration_groups ?? {}).map(
                ([value, count], index) => ({
                  value,
                  label: `Configuration ${index + 1} · ${count} runs`,
                }),
              )}
              onChange={filters.setConfiguration}
            />
          ) : null}
        </div>
        <VisibilityToolbar
          activeTab={filters.activeTab}
          runs={queries.runOptions}
          selectedRunId={filters.selectedRunId}
          onSelectRun={filters.setSelectedRunId}
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
        />
        <TabPanel value={filters.activeTab} className="focus-ring">
          {state ? (
            <DashboardState state={state} hasActiveRun={Boolean(queries.activeRun)} />
          ) : (
            <DashboardPanel filters={filters} queries={queries} promptQuery={promptQuery} />
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}

function DashboardPanel({
  filters,
  queries,
  promptQuery,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  promptQuery: ReturnType<typeof usePromptQuery>;
}>) {
  const panels: Partial<Record<VisibilityTab, ReactNode>> = {
    trends: (
      <VisibilityTrends
        query={queries.trendQuery}
        visibilityQuery={queries.visibilityQuery}
        promptQuery={promptQuery}
        engineFilter={filters.engine}
        hasRuns={queries.hasRuns}
        isFiltered={filters.isTrendFiltered}
        onEvidence={filters.openEvidence}
      />
    ),
    'mentions-citations': (
      <VisibilitySources filters={filters} queries={queries}>
        <MentionsCitations
          query={queries.evidenceQuery}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clearEvidenceFilters}
          limit={EVIDENCE_LIMIT}
          onNextPage={filters.nextPage}
        />
      </VisibilitySources>
    ),
    'query-fanout': (
      <div className="grid gap-[var(--workspace-gap)]">
        <FanoutSummary filters={filters} queries={queries} />
        <FanoutEvidence
          query={queries.evidenceQuery}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clearEvidenceFilters}
          limit={EVIDENCE_LIMIT}
          onNextPage={filters.nextPage}
        />
      </div>
    ),
  };
  return panels[filters.activeTab] ?? null;
}
