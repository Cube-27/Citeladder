import { choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { menuFieldKeys } from '@/components/ui/filter-chip';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/tabs';
import type { SearchCollection } from './search-intelligence-collection-state';

export function CollectionViewControl({ collection }: Readonly<{ collection: SearchCollection }>) {
  return (
    <SegmentedControl
      ariaLabel={`${collection.tab} view`}
      value={collection.kind}
      onChange={collection.changeKind}
      options={collection.views}
    />
  );
}

export function collectionFilters(collection: SearchCollection): FilterDefinition[] {
  const filters: FilterDefinition[] = [];
  const { target, dataset } = collection;
  if (collection.targets.length && target)
    filters.push(
      choiceFilter({
        id: 'target',
        label: 'Website',
        value: target,
        defaultValue: target,
        groups: [{ options: collection.targets }],
        onChange: collection.changeTarget,
      }),
    );
  if (collection.candidates.length > 1 && dataset)
    filters.push(
      choiceFilter({
        id: 'dataset',
        label: collection.comparison ? 'Competitor' : 'Saved results',
        value: dataset.id,
        defaultValue: dataset.id,
        groups: [
          {
            options: collection.candidates.map((item) => ({
              value: item.id,
              label: collection.label(item),
            })),
          },
        ],
        onChange: collection.changeDataset,
      }),
    );
  if (collection.keywordDataset)
    filters.push(
      ...keywordFilters({
        minVolume: collection.keywordFilters.minVolume,
        setMinVolume: collection.setMinVolume,
        intent: collection.keywordFilters.intent,
        setIntent: collection.setIntent,
      }),
    );
  return filters;
}

const INTENT_OPTIONS = [
  { value: 'any', label: 'Any intent' },
  { value: 'informational', label: 'Informational' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'navigational', label: 'Navigational' },
  { value: 'transactional', label: 'Transactional' },
] as const;

export function keywordFilters({
  minVolume,
  setMinVolume,
  intent,
  setIntent,
}: Readonly<{
  minVolume: string;
  setMinVolume: (value: string) => void;
  intent: string;
  setIntent: (value: string) => void;
}>): FilterDefinition[] {
  return [
    {
      kind: 'custom',
      id: 'min-volume',
      label: 'Min. search volume',
      valueLabel: minVolume || 'Any volume',
      isDefault: minVolume === '',
      defaultLabel: 'Any volume',
      reset: () => setMinVolume(''),
      content: (
        <Input
          aria-label="Minimum search volume"
          placeholder="Min. search volume"
          type="number"
          min={0}
          value={minVolume}
          step={1}
          onKeyDown={menuFieldKeys}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '' || (Number.isInteger(Number(value)) && Number(value) >= 0))
              setMinVolume(value);
          }}
        />
      ),
    },
    choiceFilter({
      id: 'intent',
      label: 'Intent',
      value: intent || 'any',
      defaultValue: 'any',
      groups: [{ options: INTENT_OPTIONS }],
      onChange: (value) => setIntent(value === 'any' ? '' : value),
    }),
  ];
}
