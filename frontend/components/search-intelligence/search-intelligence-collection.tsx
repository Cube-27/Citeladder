import { useState, type ReactNode } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { textRole } from '@/components/ui/typography';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { SearchIntelligenceDatasetView } from './search-intelligence-dataset-view';
import {
  SearchIntelligenceCompetitors,
  matchesCompetitor,
} from './search-intelligence-competitors';
import { SearchMetrics } from './search-intelligence-overview';

const VIEWS = {
  keywords: [
    { value: 'ranking_keywords', label: 'Ranking keywords' },
    { value: 'keyword_suggestions', label: 'Keyword ideas' },
  ],
  backlinks: [
    { value: 'referring_domains', label: 'Referring domains' },
    { value: 'destination_pages', label: 'Linked pages' },
    { value: 'citation_matches', label: 'Citation matches' },
  ],
  competitors: [
    { value: 'missing_keywords', label: 'Missing keywords' },
    { value: 'shared_keywords', label: 'Shared keywords' },
  ],
};

export function SearchIntelligenceCollection({
  tab,
  datasets,
  competitors,
  selected,
  onSelect,
  action,
}: Readonly<{
  tab: keyof typeof VIEWS;
  datasets: SearchIntelligenceDataset[];
  competitors: SearchIntelligenceReadiness['competitors'];
  selected: SearchIntelligenceDataset | null;
  onSelect: (dataset: SearchIntelligenceDataset | null) => void;
  action?: ReactNode;
}>) {
  const [kind, setKind] = useState(VIEWS[tab][0].value);
  const [selectedId, setSelectedId] = useState('');
  const activeKind = selected?.dataset_kind ?? kind;
  const candidates = datasets.filter((item) => item.dataset_kind === activeKind);
  const dataset =
    candidates.find((item) => item.id === selected?.id || item.id === selectedId) ?? candidates[0];
  if (tab === 'competitors' && !selected)
    return (
      <SearchIntelligenceCompetitors
        datasets={datasets}
        competitors={competitors}
        onOpen={onSelect}
      />
    );
  const title = VIEWS[tab].find((item) => item.value === activeKind)?.label ?? 'Saved results';
  function changeKind(value: string) {
    setKind(value);
    if (tab === 'competitors' && selected) {
      const next = datasets.find(
        (item) =>
          item.dataset_kind === value && item.comparison_origin === selected.comparison_origin,
      );
      if (next) onSelect(next);
    }
  }
  const label = (item: SearchIntelligenceDataset) => {
    const competitor = competitors.find((entry) =>
      matchesCompetitor(item.comparison_origin, entry.registrable_domain),
    );
    return competitor?.label ?? item.target_hostname;
  };
  return (
    <div className="grid min-w-0 gap-4">
      {tab === 'backlinks' ? (
        <BacklinkMetrics datasets={datasets} targetOrigin={dataset?.target_origin} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {tab === 'competitors' ? (
            <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
              All competitors
            </Button>
          ) : null}
          <SegmentedControl
            ariaLabel={`${tab} view`}
            value={activeKind}
            onChange={changeKind}
            options={VIEWS[tab].filter(
              (item) =>
                item.value !== 'citation_matches' ||
                datasets.some((entry) => entry.dataset_kind === item.value),
            )}
          />
          {candidates.length > 1 ? (
            <Select
              ariaLabel={tab === 'competitors' ? 'Competitor' : 'Saved results'}
              value={dataset?.id}
              onValueChange={(id) => {
                setSelectedId(id);
                if (tab === 'competitors')
                  onSelect(candidates.find((item) => item.id === id) ?? null);
              }}
              options={candidates.map((item) => ({ value: item.id, label: label(item) }))}
            />
          ) : null}
        </div>
        {action}
      </div>
      <CollectionResult
        dataset={dataset}
        title={title}
        comparison={tab === 'competitors'}
        label={label}
      />
    </div>
  );
}

function BacklinkMetrics({
  datasets,
  targetOrigin,
}: Readonly<{ datasets: SearchIntelligenceDataset[]; targetOrigin?: string }>) {
  const summary = datasets.find(
    (item) =>
      item.dataset_kind === 'backlink_summary' &&
      (!targetOrigin || item.target_origin === targetOrigin),
  );
  return (
    <SearchMetrics
      metrics={[
        ['Backlinks', summary?.summary.backlinks],
        ['Referring domains', summary?.summary.referring_main_domains],
        ['Domain rank', summary?.summary.rank],
      ]}
    />
  );
}

function CollectionResult({
  dataset,
  title,
  comparison,
  label,
}: Readonly<{
  dataset?: SearchIntelligenceDataset;
  title: string;
  comparison: boolean;
  label: (dataset: SearchIntelligenceDataset) => string;
}>) {
  return (
    <div className="grid min-w-0 gap-4">
      {' '}
      {comparison && dataset ? (
        <p className={textRole('bodyStrong')}>
          {label(dataset)} compared with {dataset.target_hostname}
        </p>
      ) : null}
      {dataset ? (
        <SearchIntelligenceDatasetView key={dataset.id} dataset={dataset} title={title} />
      ) : (
        <EmptyState
          icon={Database}
          heading={`No saved ${title.toLowerCase()}`}
          description="Choose this data in Analysis settings, then review the cost before fetching."
        />
      )}
    </div>
  );
}
