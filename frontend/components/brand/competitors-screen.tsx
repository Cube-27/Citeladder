import { useQuery } from '@tanstack/react-query';

import { ReportPage } from '@/components/templates/report-page';
import { Button } from '@/components/ui/button';
import { FilterBar, pageStripFilters } from '@/components/ui/filter-bar';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionStack } from '@/components/ui/section';
import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { CompetitorSuggestions } from '@/components/visibility/prompt-insights';
import { RankingRowsTable } from '@/components/visibility/ranking-rows';
import { SelectionGate } from '@/components/visibility/selection-gate';
import {
  SelectionPageStateBlock,
  selectionPageState,
  useSelectionPageFilters,
} from '@/components/visibility/selection-page';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import { coverageSummary } from '@/lib/visibility/coverage';
import {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

/**
 * Brand → Competitors (AV-16): you beside the brands you track, then the
 * suggestions. Context keeps owning the roster; Edit competitors goes there.
 */
export function CompetitorsScreen() {
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters, 'competitors');
  const state = selectionPageState(queries);
  const pageFilters = useSelectionPageFilters({ view: 'competitors', filters, queries });
  const timeZone = useDisplayTimeZone();
  const formatDate = (iso: string) => formatDisplayDate(iso, timeZone);
  const suggestions = useQuery(
    visibilityQueries.competitorSuggestions({
      workspaceId: queries.workspaceId,
      projectId: queries.projectId,
    }),
  );
  return (
    <ReportPage
      actions={
        <Button variant="secondary" asChild>
          <ProjectLink href="/agent/context?tab=competitors">Edit competitors</ProjectLink>
        </Button>
      }
      filters={state === null ? <FilterBar {...pageStripFilters(pageFilters)} /> : undefined}
    >
      {queries.activeRun && state !== 'empty' ? <ActiveRunBanner run={queries.activeRun} /> : null}
      {state ? (
        <SelectionPageStateBlock state={state} queries={queries} />
      ) : (
        <SectionStack>
          <SelectionGate query={queries.visibilityQuery}>
            {(selected) => (
              <RankingRowsTable
                rows={selected.rankings}
                description={coverageSummary(selected, formatDate).change}
              />
            )}
          </SelectionGate>
          <CompetitorSuggestions projectId={queries.projectId} suggestionsQuery={suggestions} />
        </SectionStack>
      )}
    </ReportPage>
  );
}
