import type { AccuracyResponse } from '@citeladder/contracts/fact-checking';

import { PerceptionView } from '@/components/perception/perception-brand';
import { PerceptionFactChecking } from '@/components/perception/perception-factcheck';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar } from '@/components/ui/filter-bar';
import type { FigureSegment } from '@/components/ui/figure-strip';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { ActiveRunBanner } from '@/components/visibility/active-run-banner';
import { VisibilityEmptyState } from '@/components/visibility/empty-state';
import { AnalysisRead, SelectionGate } from '@/components/visibility/selection-gate';
import { selectionPageState } from '@/components/visibility/selection-page';
import { useVisibilityFilterMenu } from '@/components/visibility/visibility-toolbar';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useBrandFacts } from '@/lib/project/use-brand-facts';
import { useAccuracy, useFactViews } from '@/lib/visibility/use-accuracy';
import { usePerception } from '@/lib/visibility/use-perception';
import {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

type PerceptionTab = 'brand' | 'fact-checking';

const TABS = [
  { value: 'brand', label: 'Brand' },
  { value: 'fact-checking', label: 'Fact-checking' },
] as const satisfies readonly { value: PerceptionTab; label: string }[];

const TAB_CODEC = stringUrlCodec<PerceptionTab>(['brand', 'fact-checking'], 'brand');

type Filters = ReturnType<typeof useVisibilityFilters>;
type Queries = ReturnType<typeof useVisibilityQueries>;

/** How AI portrays the brand, and for the fact-checking pilot what it claims. */
export function PerceptionScreen() {
  const filters = useVisibilityFilters();
  const queries = useVisibilityQueries(filters, 'perception');
  // Fact-checking exists only inside the pilot.
  const pilot = useBrandFacts().data?.enabled ?? false;
  const [requested, setTab] = useUrlState('tab', TAB_CODEC);
  const tab = pilot ? requested : 'brand';
  const accuracy = useAccuracy({ filters, queries, pilot });
  const factViews = useFactViews({ filters, queries, accuracy, open: tab === 'fact-checking' });
  const pageFilters = usePageFilters(filters, queries);
  const ready = selectionPageState(queries) === null;
  // A previous selection's count is not this one's: load instead.
  const accuracyData = accuracy.isPlaceholderData ? undefined : accuracy.data;
  const brandFact = pilot ? factFigure(accuracyData, () => setTab('fact-checking')) : undefined;
  return (
    <TabsRoot value={tab} onValueChange={setTab}>
      <ReportPage
        tabs={
          <TabRow
            items={pilot ? TABS : TABS.filter((item) => item.value === 'brand')}
            ariaLabel="Perception views"
          />
        }
        filters={ready ? <FilterBar filters={pageFilters} /> : undefined}
      >
        {queries.activeRun && queries.hasRuns ? <ActiveRunBanner run={queries.activeRun} /> : null}
        <TabPanel value={tab} className="focus-ring">
          {ready ? (
            <SelectionGate query={queries.visibilityQuery}>
              {() =>
                tab === 'brand' ? (
                  <BrandTab filters={filters} queries={queries} factFigure={brandFact} />
                ) : (
                  <PerceptionFactChecking query={accuracy} views={factViews} />
                )
              }
            </SelectionGate>
          ) : (
            <PageState queries={queries} />
          )}
        </TabPanel>
      </ReportPage>
    </TabsRoot>
  );
}

function BrandTab({
  filters,
  queries,
  factFigure: figure,
}: Readonly<{ filters: Filters; queries: Queries; factFigure?: FigureSegment }>) {
  const query = usePerception(filters, queries);
  return (
    <AnalysisRead
      query={query}
      title="Couldn't load perception"
      busyLabel="Updating perception"
      busy={query.isFetching}
      ready={query.data}
    >
      {(data) => <PerceptionView data={data} factFigure={figure} />}
    </AnalysisRead>
  );
}

const ACCURACY_MISSING: Record<Exclude<AccuracyResponse['state'], 'value'>, string> = {
  not_enabled: 'Not enabled',
  no_facts: 'No confirmed facts',
  no_claims: 'No claims',
  pending: 'Checking',
  unavailable: 'Unavailable',
};

/** The pilot's contradicted claims on the Brand tab, opening the Fact-checking tab. */
function factFigure(data: AccuracyResponse | undefined, onSelect: () => void): FigureSegment {
  return {
    key: 'contradicted',
    label: 'Contradicted claims',
    value: data?.state === 'value' ? String(data.score.coverage.contradicted) : null,
    missingLabel: data && data.state !== 'value' ? ACCURACY_MISSING[data.state] : undefined,
    loading: data === undefined,
    sub: 'Claims about you that a confirmed fact contradicts.',
    action: { label: 'Open fact-checking', onSelect },
  };
}

function PageState({ queries }: Readonly<{ queries: Queries }>) {
  const { auditsQuery } = queries;
  if (auditsQuery.isLoading)
    return <StateBlock kind="loading" label="Loading perception…" shape={{ kind: 'figures' }} />;
  if (auditsQuery.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(auditsQuery)}
        title="Couldn't load this project's runs"
        fallback="Check your connection and try again."
      />
    );
  return <VisibilityEmptyState activeRun={queries.activeRun ?? null} />;
}

function usePageFilters(filters: Filters, queries: Queries) {
  return useVisibilityFilterMenu({
    view: 'perception',
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
    markets: queries.markets,
    market: filters.market,
    onChangeMarket: filters.setMarket,
  });
}
