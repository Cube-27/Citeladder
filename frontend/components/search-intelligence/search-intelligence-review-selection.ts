import type { DatasetSelection } from '@/lib/api/search-intelligence';

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
    if (
      !['ranking_keywords', 'missing_keywords', 'shared_keywords', 'keyword_suggestions'].includes(
        selection.kind,
      )
    )
      return selection;
    return {
      ...selection,
      ...(selection.kind === 'keyword_suggestions' ? { seed: controls.seed } : {}),
      order: controls.order,
      min_volume: controls.minVolume === '' ? undefined : Number(controls.minVolume),
    };
  });
}
