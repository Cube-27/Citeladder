import type { RankingRow, Visibility } from '@citeladder/contracts';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { CompetitorSources, NamedInsteadOfYou } from '@/components/brand/competitor-focus-cards';
import { CompetitorTrend } from '@/components/brand/competitor-trend';
import { ReportPage } from '@/components/templates/report-page';
import { AppGrid } from '@/components/ui/app-grid';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { FilterBar } from '@/components/ui/filter-bar';
import { ProjectLink } from '@/components/ui/project-link';
import { SectionStack } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { AnalysisRead, SelectionGate } from '@/components/visibility/selection-gate';
import {
  SelectionPageStateBlock,
  selectionPageState,
  useSelectionPageFilters,
} from '@/components/visibility/selection-page';
import { ApiError } from '@/lib/api/errors';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { formatPositionExact, formatRate, measured } from '@/lib/visibility/dashboard';
import { formatNet } from '@/lib/visibility/perception';
import { selectionEnabled, selectionParams } from '@/lib/visibility/use-source-analysis';
import {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

type Filters = ReturnType<typeof useVisibilityFilters>;
type Queries = ReturnType<typeof useVisibilityQueries>;

/** A name the roster does not hold: 404 with no machine code (unmeasured reads carry one). */
const isUnknownCompetitor = (error: unknown) =>
  error instanceof ApiError && error.status === 404 && !error.code;

/**
 * Brand → Competitors → one competitor (AV-6): its key figures beside yours,
 * its trend against yours, the sources cited when it is named and the prompts
 * naming it instead of you. Keyed by the roster name.
 */
export function CompetitorScreen() {
  const { name = '' } = useParams();
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters, 'competitor');
  const state = selectionPageState(queries);
  const pageFilters = useSelectionPageFilters({ view: 'competitor', filters, queries });
  return (
    <ReportPage
      title={name}
      crumb={
        <Breadcrumb parts={[{ label: 'Competitors', href: '/competitors' }, { label: name }]} />
      }
      filters={state === null ? <FilterBar filters={pageFilters} /> : undefined}
    >
      {queries.activeRun && state !== 'empty' ? <ActiveRunBanner run={queries.activeRun} /> : null}
      {state ? (
        <SelectionPageStateBlock state={state} queries={queries} />
      ) : (
        <SelectionGate query={queries.visibilityQuery}>
          {(selected) => (
            <CompetitorBody name={name} selected={selected} filters={filters} queries={queries} />
          )}
        </SelectionGate>
      )}
    </ReportPage>
  );
}

function CompetitorBody({
  name,
  selected,
  filters,
  queries,
}: Readonly<{ name: string; selected: Visibility; filters: Filters; queries: Queries }>) {
  const enabled = selectionEnabled(queries);
  const focus = useQuery({
    ...visibilityQueries.competitor(
      { workspaceId: queries.workspaceId, projectId: queries.projectId },
      { name, ...selectionParams(filters, queries) },
    ),
    enabled,
  });
  if (isUnknownCompetitor(focus.error))
    return (
      <StateBlock
        kind="empty"
        heading={`${name} isn’t a tracked competitor`}
        description="Add it in Context to measure it beside you."
        action={
          <Button asChild>
            <ProjectLink href="/agent/context?tab=competitors">Edit competitors</ProjectLink>
          </Button>
        }
      />
    );
  return (
    <SectionStack aria-busy={queries.visibilityQuery.isFetching}>
      <FocusFigures name={name} rankings={selected.rankings} />
      <CompetitorTrend name={name} query={queries.trendQuery} />
      <AnalysisRead
        query={focus}
        title={`Couldn't load ${name}'s sources and prompts`}
        busyLabel="Updating"
        busy={focus.isFetching}
        ready={focus.data}
      >
        {(data) => (
          <AppGrid layout="halves">
            <CompetitorSources focus={data} />
            <NamedInsteadOfYou focus={data} />
          </AppGrid>
        )}
      </AnalysisRead>
    </SectionStack>
  );
}

type Figure = { key: string; label: string; read: (row: RankingRow) => string | null };

const FIGURES: readonly Figure[] = [
  { key: 'visibility', label: 'Visibility', read: (row) => measured(formatRate(row.mention_rate)) },
  {
    key: 'sov',
    label: 'Share of voice',
    read: (row) => measured(formatRate(row.share_of_voice)),
  },
  {
    key: 'position',
    label: 'Position',
    read: (row) => measured(formatPositionExact(row.avg_position)),
  },
  { key: 'win', label: 'Win rate', read: (row) => measured(formatRate(row.win_rate ?? null)) },
  {
    key: 'sentiment',
    label: 'Sentiment',
    read: (row) => formatNet(row.sentiment?.net_sentiment ?? null),
  },
];

/** The competitor's figures, each over yours from the same ranking read. */
function FocusFigures({
  name,
  rankings,
}: Readonly<{ name: string; rankings: readonly RankingRow[] }>) {
  const theirs = rankings.find((row) => !row.is_brand && row.name === name);
  const yours = rankings.find((row) => row.is_brand);
  const segments = FIGURES.map((figure): FigureSegment => ({
    key: figure.key,
    label: figure.label,
    value: theirs ? figure.read(theirs) : null,
    sub: `You: ${(yours && figure.read(yours)) ?? 'not measured'}`,
  }));
  return <FigureStrip label={`${name} against you`} segments={segments} />;
}
