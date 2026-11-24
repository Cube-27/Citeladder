import { useState } from 'react';

import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { searchDatasetTraits } from '@citeladder/contracts/search-intelligence';
import { matchesCompetitor } from './search-intelligence-competitors';

type View = { value: string; label: string };

export type CollectionTab = 'keywords' | 'backlinks';

const VIEWS: Record<CollectionTab, readonly [View, ...View[]]> = {
  keywords: [
    { value: 'ranking_keywords', label: 'Ranking keywords' },
    { value: 'organic_pages', label: 'Top pages' },
    { value: 'keyword_suggestions', label: 'Keyword ideas' },
    { value: 'missing_keywords', label: 'Missing keywords' },
    { value: 'shared_keywords', label: 'Shared keywords' },
  ],
  backlinks: [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'referring_domains', label: 'Referring domains' },
    { value: 'destination_pages', label: 'Top linked pages' },
    { value: 'citation_matches', label: 'Citation matches' },
  ],
};

const COLLECTION_TABS: readonly CollectionTab[] = ['keywords', 'backlinks'];

export function collectionTabOf(kind: string): CollectionTab | null {
  return COLLECTION_TABS.find((tab) => VIEWS[tab].some((view) => view.value === kind)) ?? null;
}

export type KeywordFilterValues = Readonly<{ minVolume: string; intent: string }>;

const NO_KEYWORD_FILTERS: KeywordFilterValues = { minVolume: '', intent: '' };

type TabState = Readonly<{
  kind: string;
  selectedId: string;
  targetOrigin: string;
  comparisonOrigin: string;
  filters: KeywordFilterValues & { datasetId: string | undefined };
}>;

function initialState(tab: CollectionTab): TabState {
  return {
    kind: VIEWS[tab][0].value,
    selectedId: '',
    targetOrigin: '',
    comparisonOrigin: '',
    filters: { ...NO_KEYWORD_FILTERS, datasetId: undefined },
  };
}

function collectionTargets(
  datasets: readonly SearchIntelligenceDataset[],
  tab: CollectionTab,
  ownedOrigins: readonly string[],
) {
  const kinds = new Set(VIEWS[tab].map((item) => item.value));
  if (tab === 'backlinks') {
    kinds.add('backlink_summary');
    kinds.add('backlink_history');
  }
  const targets = [
    ...new Map(
      datasets
        .filter((item) => kinds.has(item.dataset_kind))
        .map((item) => [
          item.target_origin,
          { value: item.target_origin, label: item.target_hostname },
        ]),
    ).values(),
  ];
  const owned = (item: { value: string }) => ownedOrigins.includes(item.value);
  return [...targets.filter(owned), ...targets.filter((item) => !owned(item))];
}

function datasetLabel(
  item: SearchIntelligenceDataset,
  competitors: SearchIntelligenceReadiness['competitors'],
) {
  if (
    item.dataset_kind === 'keyword_suggestions' &&
    item.acquisition &&
    typeof item.acquisition === 'object' &&
    'keyword' in item.acquisition
  )
    return `${item.target_hostname} · ${String(item.acquisition.keyword)}`;
  const competitor = competitors.find((entry) =>
    matchesCompetitor(item.comparison_origin, entry.registrable_domain),
  );
  return competitor?.label ?? item.target_hostname;
}

export function useSearchCollection({
  tab,
  ...input
}: Readonly<
  Omit<CollectionInput, 'tab' | 'state' | 'patch'> & {
    tab: CollectionTab | null;
  }
>) {
  const [states, setStates] = useState<Partial<Record<CollectionTab, TabState>>>({});
  const patchTab = (target: CollectionTab, next: Partial<TabState>) =>
    setStates((current) => ({
      ...current,
      [target]: { ...(current[target] ?? initialState(target)), ...next },
    }));
  const openComparison = (dataset: SearchIntelligenceDataset) =>
    patchTab('keywords', {
      kind: dataset.dataset_kind,
      comparisonOrigin: dataset.comparison_origin,
    });
  if (tab === null) return { collection: null, openComparison };
  const collection = collectionView({
    ...input,
    tab,
    state: states[tab] ?? initialState(tab),
    patch: (next) => patchTab(tab, next),
  });
  return { collection, openComparison };
}

export type SearchCollection = ReturnType<typeof collectionView>;

type CollectionInput = Readonly<{
  tab: CollectionTab;
  state: TabState;
  patch: (next: Partial<TabState>) => void;
  datasets: readonly SearchIntelligenceDataset[];
  competitors: SearchIntelligenceReadiness['competitors'];
  ownedOrigins: readonly string[];
}>;

function collectionView({
  tab,
  state,
  patch,
  datasets,
  competitors,
  ownedOrigins,
}: CollectionInput) {
  const { kind } = state;
  const comparison = Boolean(searchDatasetTraits(kind)?.comparison);
  const targets = collectionTargets(datasets, tab, ownedOrigins);
  const target =
    targets.find((item) => item.value === state.targetOrigin)?.value ?? targets[0]?.value;
  const candidates = datasets.filter(
    (item) => item.dataset_kind === kind && (comparison || item.target_origin === target),
  );
  const dataset =
    candidates.find((item) =>
      comparison ? item.comparison_origin === state.comparisonOrigin : item.id === state.selectedId,
    ) ?? candidates[0];

  const filters = state.filters.datasetId === dataset?.id ? state.filters : NO_KEYWORD_FILTERS;
  const setFilters = (next: Partial<KeywordFilterValues>) =>
    patch({ filters: { ...filters, ...next, datasetId: dataset?.id } });

  return {
    tab,
    comparison,
    views: VIEWS[tab].filter(
      (item) =>
        item.value !== 'citation_matches' ||
        datasets.some((entry) => entry.dataset_kind === item.value),
    ),
    kind,
    changeKind: (value: string) => patch({ kind: value }),
    title: VIEWS[tab].find((item) => item.value === kind)?.label ?? 'Saved results',
    targets: comparison ? [] : targets,
    target,
    changeTarget: (value: string) => patch({ targetOrigin: value }),
    candidates,
    dataset,
    changeDataset: (id: string) =>
      patch(
        comparison
          ? {
              comparisonOrigin: candidates.find((item) => item.id === id)?.comparison_origin ?? '',
            }
          : { selectedId: id },
      ),
    label: (item: SearchIntelligenceDataset) => datasetLabel(item, competitors),
    keywordDataset: Boolean(dataset && searchDatasetTraits(dataset.dataset_kind)?.keyword),
    keywordFilters: filters,
    setMinVolume: (minVolume: string) => setFilters({ minVolume }),
    setIntent: (intent: string) => setFilters({ intent }),
  };
}
