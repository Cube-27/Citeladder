import type { ReactNode } from 'react';

import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { FanoutEvidence } from '@/components/visibility/fanout-evidence';
import { VisibilitySources } from '@/components/visibility/visibility-sources';
import { VisibilityAds } from '@/components/visibility/visibility-ads';
import { SelectionGate } from '@/components/visibility/selection-gate';
import {
  SelectionPageStateBlock,
  selectionPageState,
  useSelectionPageFilters,
  type SelectionPageState,
} from '@/components/visibility/selection-page';
import type { Visibility } from '@citeladder/contracts';
import { VisibilityActions } from '@/components/visibility/visibility-toolbar';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar } from '@/components/ui/filter-bar';
import { VISIBILITY_TABS, type SourceTab, type VisibilityTab } from '@/lib/visibility/dashboard';
import {
  EVIDENCE_LIMIT,
  useCanonicalSourcesTab,
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

export function VisibilityDashboard() {
  useCanonicalSourcesTab();
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters, filters.activeTab);
  // The Sources filters are listed in the page's control row but stay owned
  // by the Sources panel; the provider spans both.
  return (
    <VisibilityWorkspace filters={filters} queries={queries} state={selectionPageState(queries)} />
  );
}

function VisibilityWorkspace({
  filters,
  queries,
  state,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  state: SelectionPageState;
}>) {
  const pageFilters = useSelectionPageFilters({ view: filters.activeTab, filters, queries });
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
            items={VISIBILITY_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
            ariaLabel="Visibility views"
            onIntent={queries.prefetchTab}
          />
        }
        filters={state === null ? <FilterBar filters={pageFilters} /> : undefined}
      >
        {queries.activeRun && state !== 'empty' ? (
          <ActiveRunBanner run={queries.activeRun} />
        ) : null}
        <TabPanel value={filters.activeTab} className="focus-ring">
          {state ? (
            <SelectionPageStateBlock state={state} queries={queries} />
          ) : (
            <DashboardPanel filters={filters} queries={queries} />
          )}
        </TabPanel>
      </ReportPage>
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
  // Every panel reads the selection's run, so each waits behind its state.
  const gated = (panel: (selected: Visibility) => ReactNode) => (
    <SelectionGate query={queries.visibilityQuery}>{panel}</SelectionGate>
  );
  const sources = (tab: SourceTab) =>
    gated(() => <VisibilitySources tab={tab} filters={filters} queries={queries} />);
  const panels: Record<VisibilityTab, ReactNode> = {
    domains: sources('domains'),
    urls: sources('urls'),
    'read-not-cited': sources('read-not-cited'),
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
      />
    )),
  };
  return panels[filters.activeTab];
}
