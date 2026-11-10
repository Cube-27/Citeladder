import { Button } from '@/components/ui/button';
import { FilterField } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/tabs';
import type { SearchCollection } from './search-intelligence-collection-state';

/**
 * The collection's view switcher, leading the page's control strip; on a
 * competitor comparison, the way back to every competitor comes first.
 */
export function CollectionViewControl({ collection }: Readonly<{ collection: SearchCollection }>) {
  if (collection.listingCompetitors) return null;
  const views = (
    <SegmentedControl
      ariaLabel={`${collection.tab} view`}
      value={collection.kind}
      onChange={collection.changeKind}
      options={collection.views}
    />
  );
  if (collection.tab !== 'competitors') return views;
  return (
    <Inline gap="compact">
      <Button variant="ghost" onClick={collection.showAllCompetitors}>
        All competitors
      </Button>
      {views}
    </Inline>
  );
}

/**
 * The collection's pickers and keyword filters, each one of the control
 * strip's filters: the website, the saved result (or competitor) when there
 * is more than one, then minimum volume and intent for keyword datasets.
 */
export function CollectionFilters({ collection }: Readonly<{ collection: SearchCollection }>) {
  if (collection.listingCompetitors) return null;
  const competitors = collection.tab === 'competitors';
  return (
    <>
      {collection.targets.length ? (
        <FilterField>
          <Select
            ariaLabel="Saved target"
            options={collection.targets}
            value={collection.target}
            onValueChange={collection.changeTarget}
          />
        </FilterField>
      ) : null}
      {collection.candidates.length > 1 ? (
        <FilterField>
          <Select
            ariaLabel={competitors ? 'Competitor' : 'Saved results'}
            value={collection.dataset?.id}
            onValueChange={collection.changeDataset}
            options={collection.candidates.map((item) => ({
              value: item.id,
              label: collection.label(item),
            }))}
          />
        </FilterField>
      ) : null}
      {collection.keywordDataset ? (
        <KeywordFilters
          minVolume={collection.keywordFilters.minVolume}
          setMinVolume={collection.setMinVolume}
          intent={collection.keywordFilters.intent}
          setIntent={collection.setIntent}
        />
      ) : null}
    </>
  );
}

const INTENT_OPTIONS = [
  { value: 'any', label: 'Any intent' },
  { value: 'informational', label: 'Informational' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'navigational', label: 'Navigational' },
  { value: 'transactional', label: 'Transactional' },
] as const;

/** Minimum search volume (a nonnegative whole number) and search intent. */
export function KeywordFilters({
  minVolume,
  setMinVolume,
  intent,
  setIntent,
}: Readonly<{
  minVolume: string;
  setMinVolume: (value: string) => void;
  intent: string;
  setIntent: (value: string) => void;
}>) {
  return (
    <>
      <FilterField>
        <Input
          aria-label="Minimum search volume"
          placeholder="Min. search volume"
          type="number"
          min={0}
          value={minVolume}
          step={1}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '' || (Number.isInteger(Number(value)) && Number(value) >= 0))
              setMinVolume(value);
          }}
        />
      </FilterField>
      <FilterField>
        <Select
          ariaLabel="Saved keyword intent"
          value={intent || 'any'}
          onValueChange={(value) => setIntent(value === 'any' ? '' : value)}
          options={INTENT_OPTIONS}
        />
      </FilterField>
    </>
  );
}
