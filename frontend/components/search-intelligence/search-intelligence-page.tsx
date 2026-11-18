import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Layers, Play, Receipt, RefreshCw, Settings2 } from 'lucide-react';

import type { ReactNode } from 'react';

import { DemandProjection } from '@/components/demand/demand-projection';
import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { SearchIntelligenceCitationMatcher } from '@/components/search-intelligence/search-intelligence-citation-matcher';
import { SearchIntelligenceCollection } from './search-intelligence-collection';
import { useSearchCollection, type SearchCollection } from './search-intelligence-collection-state';
import { SearchIntelligenceReviewDrawer } from '@/components/search-intelligence/search-intelligence-review-drawer';
import { SearchIntelligenceOverview } from '@/components/search-intelligence/search-intelligence-overview';
import { referringLists } from './search-intelligence-format';
import { NoAnalysisYet, NotConnected, UnavailableNotice } from './search-intelligence-availability';
import { Icon } from '@/components/ui/icon';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { CostDetails, RunNotice } from './search-intelligence-runs';
import { Button } from '@/components/ui/button';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Drawer } from '@/components/ui/drawer';
import { TextLink } from '@/components/ui/text-link';
import type { FilterDefinition } from '@/components/ui/all-filters';
import { savedViewFilters, scopeControls } from './search-intelligence-scope';
import { Stack } from '@/components/ui/layout';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import {
  searchIntelligenceMutations,
  searchIntelligenceQueries,
  type SearchIntelligenceDataset,
  type SearchIntelligenceReadiness,
  type SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';
import type { SearchReviewAction } from '@citeladder/contracts/search-intelligence-requests';
import { searchMarketLabel } from '@/lib/config/search-intelligence';
import { pollSearchRun } from '@/lib/search-intelligence/status';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

const TABS = [
  { value: 'demand', label: 'Demand' },
  { value: 'overview', label: 'Overview' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'competitors', label: 'Organic competitors' },
  { value: 'backlinks', label: 'Backlinks' },
] as const;
type PageTab = (typeof TABS)[number]['value'];
/** The tabs read from saved Keyword Research datasets; Demand reads Search Console. */
type Tab = Exclude<PageTab, 'demand'>;
const RESEARCH_TABS = TABS.flatMap(({ value }) => (value === 'demand' ? [] : [value]));
const TAB_ROW = <TabRow items={TABS} ariaLabel="Keyword research views" />;
const TAB_CODEC = stringUrlCodec(
  TABS.map(({ value }) => value),
  'demand' as PageTab,
);
/** Demand's own address keys, dropped when the reader leaves its tab. */
const DEMAND_KEYS = ['view', 'signal'];
/**
 * The research scopes and markets the saved datasets offer, the chosen ones
 * (or the first offered), and the datasets they select. The server already
 * answers only the newest dataset of each acquisition identity.
 */
function selectDatasets(
  readiness: SearchIntelligenceReadiness | undefined,
  scope: string,
  market: string,
) {
  const latestDatasets = readiness?.datasets ?? [];
  const offered = readiness?.markets ?? [];
  const scopes = [...new Set(latestDatasets.map((item) => item.research_scope ?? 'exact_host'))];
  const activeScope = scopes.includes(scope as 'exact_host' | 'domain_subdomains')
    ? scope
    : scopes[0];
  const markets = [
    ...new Map(
      latestDatasets
        .filter(
          (item) =>
            (item.research_scope ?? 'exact_host') === activeScope && item.location_code !== null,
        )
        .map((item) => [
          `${item.location_code}:${item.language_code}`,
          {
            value: `${item.location_code}:${item.language_code}`,
            label: `${searchMarketLabel(item.location_code, offered)} · ${item.language_code}`,
          },
        ]),
    ).values(),
  ];
  const activeMarket = markets.find((item) => item.value === market)?.value ?? markets[0]?.value;
  const datasets = latestDatasets.filter(
    (item) =>
      (item.research_scope ?? 'exact_host') === activeScope &&
      (item.location_code === null ||
        `${item.location_code}:${item.language_code}` === activeMarket),
  );
  return { scopes, activeScope, markets, activeMarket, datasets };
}

/**
 * The Keyword research page: Search demand on its first tab, then the
 * saved datasets. Each reads its own owner, so neither gates the other.
 */
export function SearchIntelligencePage() {
  const [tab, setTab] = useUrlState('tab', TAB_CODEC, { clearKeys: DEMAND_KEYS });
  const view = useSavedView();
  return (
    <TabsRoot value={tab} onValueChange={setTab}>
      {tab === 'demand' ? (
        <DemandProjection tabs={TAB_ROW} />
      ) : (
        <KeywordResearch tab={tab} setTab={setTab} view={view} />
      )}
    </TabsRoot>
  );
}

/** The saved scope, market and comparison chosen, held above the tabs so a visit to Demand keeps them. */
function useSavedView() {
  const [comparison, setComparison] = useState<SearchIntelligenceDataset | null>(null);
  const [market, setMarket] = useState('');
  const [scope, setScope] = useState('');
  return { comparison, setComparison, market, setMarket, scope, setScope };
}

function KeywordResearch({
  tab,
  setTab,
  view,
}: Readonly<{
  tab: Tab;
  setTab: (tab: PageTab) => void;
  view: ReturnType<typeof useSavedView>;
}>) {
  const { workspaceId, projectId } = useProjectScope();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [citationOrigin, setCitationOrigin] = useState<string>();
  const { comparison, setComparison, market, setMarket, scope, setScope } = view;
  const [action, setAction] = useState<SearchReviewAction>('analysis');
  const requestScope = { workspaceId, projectId };
  const readiness = useQuery({
    ...searchIntelligenceQueries.readiness(requestScope),
    refetchInterval: (query) => pollSearchRun(query.state.data?.latest_run?.status),
  });
  const runsQuery = useQuery({
    ...searchIntelligenceQueries.runs(requestScope),
    enabled: costOpen,
  });
  const cancelMutation = useMutation(searchIntelligenceMutations.cancel(requestScope));
  const reviewMutation = useMutation(searchIntelligenceMutations.review(requestScope));
  const confirmMutation = useMutation(searchIntelligenceMutations.confirm(requestScope));
  const openReview = (nextAction: SearchReviewAction) => {
    setAction(nextAction);
    setDrawerOpen(true);
  };
  const actions = useRoleActions({
    openReview,
    cancel: (runId) => cancelMutation.mutate(runId),
    openMatch: (origin) => {
      setCitationOrigin(origin);
      setCitationOpen(true);
    },
  });
  const { scopes, activeScope, markets, activeMarket, datasets } = selectDatasets(
    readiness.data,
    scope,
    market,
  );
  const openComparison = (dataset: SearchIntelligenceDataset) => {
    setComparison(dataset);
    setTab('competitors');
  };
  const collection = useSearchCollection({
    tab: tab === 'overview' ? null : tab,
    datasets,
    competitors: readiness.data?.competitors ?? [],
    selected: comparison,
    onSelect: setComparison,
  });
  // The first load draws the tab row, the control band and the shape of the
  // tab's first card, so the work starts on the same line before and after.
  if (readiness.isPending)
    return (
      <KeywordResearchFrame controls={RESERVED_CONTROLS}>
        <ResearchLoading tab={tab} />
      </KeywordResearchFrame>
    );
  // A failed read keeps the tab row, so the page does not lose its place.
  if (readiness.isError)
    return (
      <KeywordResearchFrame>
        <StateBlock
          kind="error"
          {...readErrorProps(readiness)}
          fallback="Keyword research could not be loaded."
          title="Keyword research could not be loaded"
        />
      </KeywordResearchFrame>
    );
  const data = readiness.data;
  if (!data.connected && !data.datasets.length)
    return (
      <KeywordResearchFrame>
        <NotConnected funded={data.credential_mode === 'funded'} tab={tab} />
      </KeywordResearchFrame>
    );
  if (!data.owned_targets.length)
    return (
      <KeywordResearchFrame>
        <StateBlock
          kind="empty"
          icon={Settings2}
          heading="Add your website address"
          description="Keyword research needs the project’s homepage address."
          action={<TextLink href="/projects">Edit the project</TextLink>}
        />
      </KeywordResearchFrame>
    );
  // Before the first analysis every tab is empty and its state holds the
  // first-analysis action, so the masthead does not repeat it.
  const empty = !data.datasets.length;
  const firstRun = actions.analysis ? (
    <Button onClick={actions.analysis}>
      <Icon icon={Play} />
      Review first analysis
    </Button>
  ) : undefined;
  return (
    <KeywordResearchFrame
      actions={
        <PageActions
          hasDatasets={!empty}
          onReview={actions.review}
          onCost={() => setCostOpen(true)}
        />
      }
      controls={pageControls({
        data,
        tab,
        datasets,
        // Nothing saved: the bar keeps only its caption, no view or picker over nothing.
        collection: empty ? null : collection,
        onSeed: actions.onSeed,
        onMatch: actions.onMatch,
        onExpand: actions.onExpand,
        savedView: savedViewFilters({
          scopes,
          scope: activeScope,
          markets,
          market: activeMarket,
          tab,
          onScope: (value) => {
            setScope(value);
            setComparison(null);
          },
          onMarket: (value) => {
            setMarket(value);
            setComparison(null);
          },
        }),
      })}
    >
      <Stack gap="workspace" className="min-w-0">
        <UnavailableNotice data={data} />
        <RunNotice
          run={data.latest_run}
          onCancel={actions.cancel}
          onReview={actions.analysis}
          cancelling={cancelMutation.isPending}
        />
        {empty ? (
          RESEARCH_TABS.map((value) => (
            <TabPanel key={value} value={value} className="min-w-0">
              <NoAnalysisYet tab={value} action={firstRun} />
            </TabPanel>
          ))
        ) : (
          <ResearchPanels
            data={data}
            datasets={datasets}
            collection={collection}
            onOpen={openComparison}
            onSelect={setComparison}
          />
        )}
        <Drawer
          open={citationOpen}
          onOpenChange={setCitationOpen}
          title="Match Visibility citations"
          description="Find the sources AI answers cite that already link to your website."
        >
          <SearchIntelligenceCitationMatcher
            key={citationOrigin}
            datasets={datasets}
            targetOrigin={citationOrigin}
            onDerived={() => setCitationOpen(false)}
          />
        </Drawer>
        <CostDetails
          open={costOpen}
          onOpenChange={setCostOpen}
          runs={runsQuery.data}
          pending={runsQuery.isPending}
          error={runsQuery.error}
          onRetry={() => void runsQuery.refetch()}
        />
        <SearchIntelligenceReviewDrawer
          key={`${workspaceId}:${projectId}:${action}:${drawerOpen}`}
          open={drawerOpen}
          action={action}
          readiness={data}
          onOpenChange={setDrawerOpen}
          onReview={(payload) =>
            reviewMutation.mutateAsync(payload) as Promise<SearchIntelligenceRun>
          }
          onConfirm={async (runId) => {
            await confirmMutation.mutateAsync(runId);
            setDrawerOpen(false);
          }}
          busy={reviewMutation.isPending || confirmMutation.isPending}
        />
      </Stack>
    </KeywordResearchFrame>
  );
}

/**
 * Keyword Research is a Report: it reads saved datasets (figures, then the
 * competitive footprint and each dataset's table), with no editor to work in.
 * Every state keeps the tab row, so the page never loses its place.
 */
function KeywordResearchFrame({
  actions,
  controls,
  children,
}: Readonly<{ actions?: ReactNode; controls?: FilterBarProps; children: ReactNode }>) {
  return (
    <ReportPage
      actions={actions}
      tabs={TAB_ROW}
      filters={controls ? <FilterBar {...controls} /> : undefined}
    >
      {children}
    </ReportPage>
  );
}

/**
 * The page's actions, each only for a role that may take it: reviews and
 * cancels spend or stop credits (run); saving citation matches is a write.
 */
function useRoleActions({
  openReview,
  cancel,
  openMatch,
}: Readonly<{
  openReview: (action: SearchReviewAction) => void;
  cancel: (runId: string) => void;
  openMatch: (targetOrigin: string | undefined) => void;
}>): Readonly<
  CollectionActions & {
    review?: (action: SearchReviewAction) => void;
    /** Opens the analysis review: the first run, or the recovery for a stopped one. */
    analysis?: () => void;
    cancel?: (runId: string) => void;
  }
> {
  const canRun = useWorkspaceCapability('run');
  const canWrite = useWorkspaceCapability('write');
  const onMatch = canWrite ? openMatch : undefined;
  if (!canRun) return { onMatch };
  return {
    review: openReview,
    analysis: () => openReview('analysis'),
    cancel,
    onSeed: () => openReview('seed'),
    onExpand: () => openReview('increase_depth'),
    onMatch,
  };
}

/** The first load's shape of the tab's first card: Overview's figures, or a table. */
function ResearchLoading({ tab }: Readonly<{ tab: Tab }>) {
  if (tab === 'overview') return <Skeleton variant="stat" count={5} label="Loading keywords…" />;
  return (
    <Section>
      <Skeleton variant="table" columns={6} label="Loading keywords…" />
    </Section>
  );
}

/** Every tab's panel once an analysis is saved: Overview, then each tab's collection. */
function ResearchPanels({
  data,
  datasets,
  collection,
  onOpen,
  onSelect,
}: Readonly<{
  data: SearchIntelligenceReadiness;
  datasets: SearchIntelligenceDataset[];
  collection: ReturnType<typeof useSearchCollection>;
  onOpen: (dataset: SearchIntelligenceDataset) => void;
  onSelect: (dataset: SearchIntelligenceDataset | null) => void;
}>) {
  return (
    <>
      <TabPanel value="overview" className="min-w-0">
        <SearchIntelligenceOverview
          datasets={datasets}
          competitors={data.competitors}
          ownedHostname={data.owned_targets[0]?.hostname ?? ''}
          onOpen={onOpen}
        />
      </TabPanel>
      {RESEARCH_TABS.filter((value) => value !== 'overview').map((value) => (
        <TabPanel key={value} value={value} className="min-w-0">
          {collection?.tab === value ? (
            <SearchIntelligenceCollection
              collection={collection}
              datasets={datasets}
              competitors={data.competitors}
              onSelect={onSelect}
            />
          ) : null}
        </TabPanel>
      ))}
    </>
  );
}

function PageActions({
  hasDatasets,
  onReview,
  onCost,
}: Readonly<{
  hasDatasets: boolean;
  /** Opens a credit-spending review; omitted for a role that may not run one. */
  onReview?: (action: SearchReviewAction) => void;
  onCost: () => void;
}>) {
  const costDetails = (
    <Button variant="quiet" onClick={onCost}>
      <Icon icon={Receipt} />
      Cost details
    </Button>
  );
  // Before the first analysis each tab's empty state holds the action.
  if (!onReview || !hasDatasets) return costDetails;
  return (
    <>
      {costDetails}
      <Button variant="secondary" onClick={() => onReview('refresh')}>
        <Icon icon={RefreshCw} />
        Refresh
      </Button>
      <MastheadPrimary>
        <Button variant="primary" onClick={() => onReview('analysis')}>
          New analysis
        </Button>
      </MastheadPrimary>
    </>
  );
}

/**
 * The page's one control strip for the open tab. The caption names the saved
 * result on screen, else the newest one the tab can show.
 */
function pageControls({
  data,
  tab,
  datasets,
  collection,
  savedView,
  ...actions
}: Readonly<
  {
    data: SearchIntelligenceReadiness;
    tab: Tab;
    datasets: SearchIntelligenceDataset[];
    collection: SearchCollection | null;
    savedView: FilterDefinition[];
  } & CollectionActions
>) {
  const newest = datasets.find((item) =>
    tab === 'backlinks' ? item.location_code === null : item.location_code !== null,
  );
  return scopeControls({
    data,
    tab,
    latest: collection?.dataset ?? newest,
    savedView,
    collection: collection ?? undefined,
    action: collection ? (
      <CollectionAction collection={collection} datasets={datasets} {...actions} />
    ) : undefined,
  });
}

/** A tab's next steps; each is omitted for a role that may not take it. */
type CollectionActions = {
  /** Reviews a keyword to research, a run. */
  onSeed?: () => void;
  /** Saves citation matches, a write. */
  onMatch?: (targetOrigin: string | undefined) => void;
  /** Reviews a deeper collection, a run. */
  onExpand?: () => void;
};

/**
 * The tab's own next step, at the end of the control strip: its research
 * action, then a deeper review of the saved result on screen.
 */
function CollectionAction({
  collection,
  datasets,
  onSeed,
  onMatch,
  onExpand,
}: Readonly<
  {
    collection: SearchCollection;
    datasets: SearchIntelligenceDataset[];
  } & CollectionActions
>) {
  // Only the website on screen: matching another website's list would save
  // matches for a site the reader is not looking at.
  const matchable =
    collection.tab === 'backlinks' &&
    referringLists(datasets).some((dataset) => dataset.target_origin === collection.target);
  const expandable = !collection.listingCompetitors && Boolean(collection.dataset);
  return (
    <>
      {collection.tab === 'keywords' && onSeed ? (
        <Button variant="secondary" onClick={onSeed}>
          Research a keyword
        </Button>
      ) : null}
      {matchable && onMatch ? (
        <Button variant="secondary" onClick={() => onMatch(collection.target)}>
          Match with Visibility citations
        </Button>
      ) : null}
      {expandable && onExpand ? (
        <Button variant="quiet" onClick={onExpand}>
          <Icon icon={Layers} />
          Review depth
        </Button>
      ) : null}
    </>
  );
}
