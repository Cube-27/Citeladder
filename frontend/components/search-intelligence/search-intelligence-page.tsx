import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';

import { ListScreen, RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { SearchIntelligenceCitationMatcher } from '@/components/search-intelligence/search-intelligence-citation-matcher';
import { SearchIntelligenceCollection } from './search-intelligence-collection';
import { useSearchCollection, type SearchCollection } from './search-intelligence-collection-state';
import { SearchIntelligenceReviewDrawer } from '@/components/search-intelligence/search-intelligence-review-drawer';
import { SearchIntelligenceOverview } from '@/components/search-intelligence/search-intelligence-overview';
import { NotConnected, UnavailableNotice } from './search-intelligence-availability';
import {
  CollectionAction,
  PageActions,
  useRoleActions,
  type CollectionActions,
} from './search-intelligence-page-actions';
import { CostDetails, RunNotice } from './search-intelligence-runs';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import { TextLink } from '@/components/ui/text-link';
import type { FilterDefinition } from '@/components/ui/all-filters';
import { savedViewFilters, scopeControls } from './search-intelligence-scope';
import { Stack } from '@/components/ui/layout';
import { TabPanel, TabsRoot } from '@/components/ui/tabs';
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

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'backlinks', label: 'Backlinks' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const SEARCH_INTELLIGENCE_TABS = { items: TABS, ariaLabel: 'Keyword Research views' };
const TAB_CODEC = stringUrlCodec(
  TABS.map(({ value }) => value),
  'overview' as Tab,
);
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

/** What the page shows instead of research: no connection and no data, or no website. */
function blockedState(data: SearchIntelligenceReadiness) {
  if (!data.connected && !data.datasets.length)
    return <NotConnected funded={data.credential_mode === 'funded'} />;
  if (!data.owned_targets.length)
    return (
      <QueryState
        kind="empty"
        icon={Settings2}
        heading="Add your website address"
        description="Keyword Research needs the project’s homepage address."
        action={<TextLink href="/projects">Edit the project</TextLink>}
      />
    );
  return null;
}

export function SearchIntelligencePage() {
  const { workspaceId, projectId } = useProjectScope();
  const [tab, setTab] = useUrlState('tab', TAB_CODEC);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [citationOrigin, setCitationOrigin] = useState<string>();
  const [comparison, setComparison] = useState<SearchIntelligenceDataset | null>(null);
  const [market, setMarket] = useState('');
  const [scope, setScope] = useState('');
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
  // The first load draws the tab row and the control band the loaded page
  // has, so the work starts on the same line before and after.
  if (readiness.isPending)
    return (
      <TabsRoot value={tab} onValueChange={setTab}>
        <ListScreen tabs={SEARCH_INTELLIGENCE_TABS} controls={RESERVED_CONTROLS}>
          <QueryState kind="loading" label="Loading Keyword Research…" />
        </ListScreen>
      </TabsRoot>
    );
  // A failed read keeps the tab row, so the page does not lose its place.
  if (readiness.isError)
    return (
      <TabsRoot value={tab} onValueChange={setTab}>
        <ListScreen tabs={SEARCH_INTELLIGENCE_TABS}>
          <QueryState
            kind="error"
            {...readErrorProps(readiness)}
            fallback="Keyword Research could not be loaded."
          />
        </ListScreen>
      </TabsRoot>
    );
  const data = readiness.data;
  const tabs = SEARCH_INTELLIGENCE_TABS;
  const blocked = blockedState(data);
  if (blocked)
    return (
      <TabsRoot value={tab} onValueChange={setTab}>
        <ListScreen tabs={tabs}>{blocked}</ListScreen>
      </TabsRoot>
    );
  const firstRun = actions.analysis ? (
    <Button variant="primary" onClick={actions.analysis}>
      Review first analysis
    </Button>
  ) : undefined;
  return (
    <TabsRoot value={tab} onValueChange={setTab}>
      <ListScreen
        tabs={tabs}
        actions={
          <PageActions
            hasDatasets={Boolean(data.datasets.length)}
            onReview={actions.review}
            onCost={() => setCostOpen(true)}
          />
        }
        controls={pageControls({
          data,
          tab,
          datasets,
          collection,
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
          <TabPanel value="overview" className="min-w-0">
            <SearchIntelligenceOverview
              datasets={datasets}
              competitors={data.competitors}
              ownedHostname={data.owned_targets[0]?.hostname ?? ''}
              onOpen={openComparison}
              firstRun={firstRun}
            />
          </TabPanel>
          {TABS.filter((item) => item.value !== 'overview').map(({ value }) => (
            <TabPanel key={value} value={value} className="min-w-0">
              {collection?.tab === value ? (
                <SearchIntelligenceCollection
                  collection={collection}
                  datasets={datasets}
                  competitors={data.competitors}
                  onSelect={setComparison}
                />
              ) : null}
            </TabPanel>
          ))}
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
      </ListScreen>
    </TabsRoot>
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
