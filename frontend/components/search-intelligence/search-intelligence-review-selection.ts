import type { DatasetSelection, SearchIntelligenceReadiness } from '@/lib/api/search-intelligence';
import {
  BACKLINK_DATASET_KINDS,
  COMPETITOR_DATASET_KINDS,
  KEYWORD_DATASET_KINDS,
  OWNED_DATASET_KINDS,
  PRESET_COMPETITOR_KINDS,
  PRESET_OWNED_KINDS,
  SEARCH_DEFAULT_DEPTHS,
} from '@/lib/config/search-intelligence';
import { matchesCompetitor } from './search-intelligence-competitors';

export const selectionKey = (selection: DatasetSelection) =>
  `${selection.kind}:${selection.competitor_id ?? ''}`;

function depthFor(data: SearchIntelligenceReadiness, kind: string) {
  return (
    data.preferences.depths[kind] ??
    SEARCH_DEFAULT_DEPTHS[kind as keyof typeof SEARCH_DEFAULT_DEPTHS]
  );
}

/** Competitors the review offers: the saved preference, else every saved competitor. */
export function reviewCompetitors(data: SearchIntelligenceReadiness): string[] {
  return data.preferences.competitor_ids.length
    ? data.preferences.competitor_ids
    : data.competitors.map(({ identity }) => identity);
}

export function availableSelections(data: SearchIntelligenceReadiness): DatasetSelection[] {
  return [
    ...OWNED_DATASET_KINDS.map((kind) => ({ kind, depth: depthFor(data, kind) })),
    ...reviewCompetitors(data).flatMap((competitor_id) =>
      COMPETITOR_DATASET_KINDS.map((kind) => ({
        kind,
        competitor_id,
        depth: depthFor(data, kind),
      })),
    ),
  ];
}

/** Whether a saved dataset already answers this selection, so a refresh re-reads it. */
function saved(data: SearchIntelligenceReadiness, selection: DatasetSelection) {
  const owned = data.owned_targets[0]?.origin;
  const competitor = data.competitors.find((item) => item.identity === selection.competitor_id);
  return data.datasets.some((dataset) => {
    if (dataset.dataset_kind !== selection.kind) return false;
    if (!competitor) return dataset.target_origin === owned && !dataset.comparison_origin;
    const origin = ['missing_keywords', 'shared_keywords'].includes(selection.kind)
      ? dataset.comparison_origin
      : dataset.target_origin;
    return matchesCompetitor(origin, competitor.registrable_domain);
  });
}

/**
 * What the review starts with. A keyword seed asks for suggestions only; a refresh
 * or deeper fetch re-reads what is saved; a new analysis starts from the small
 * preset: the owned footprint and rankings, and one competitor's keyword gaps.
 */
export function defaultSelections(
  data: SearchIntelligenceReadiness,
  action: string,
): DatasetSelection[] {
  const available = availableSelections(data);
  if (action === 'seed')
    return available.filter(
      ({ kind, competitor_id }) => kind === 'keyword_suggestions' && !competitor_id,
    );
  if (['refresh', 'increase_depth'].includes(action)) {
    const current = available.filter(
      (selection) => selection.kind !== 'keyword_suggestions' && saved(data, selection),
    );
    if (current.length) return current;
  }
  const [first] = reviewCompetitors(data);
  return available.filter(({ kind, competitor_id }) =>
    competitor_id
      ? competitor_id === first && PRESET_COMPETITOR_KINDS.includes(kind)
      : PRESET_OWNED_KINDS.includes(kind),
  );
}

export function reviewInputsValid(
  selections: DatasetSelection[],
  ownedTarget: string,
  location: string,
  seed: string,
  researchScope: string,
) {
  const marketNeeded = selections.some(({ kind }) => !BACKLINK_DATASET_KINDS.includes(kind));
  return Boolean(
    selections.length &&
    ownedTarget &&
    (!marketNeeded || (Number.isInteger(Number(location)) && Number(location) > 0)) &&
    !(
      researchScope === 'exact_host' && selections.some(({ kind }) => kind === 'backlink_history')
    ) &&
    selections.every((item) => item.kind !== 'keyword_suggestions' || seed.trim()),
  );
}

export function prepareReviewSelections(
  selections: DatasetSelection[],
  controls: {
    seed: string;
    grouping: 'as_is' | 'one_per_domain';
    order: DatasetSelection['order'];
    minVolume: string;
  },
): DatasetSelection[] {
  return selections.map((selection) => {
    if (selection.kind === 'backlinks') return { ...selection, grouping: controls.grouping };
    if (!KEYWORD_DATASET_KINDS.includes(selection.kind)) return selection;
    return {
      ...selection,
      ...(selection.kind === 'keyword_suggestions' ? { seed: controls.seed } : {}),
      order: controls.order,
      min_volume: controls.minVolume === '' ? undefined : Number(controls.minVolume),
    };
  });
}
