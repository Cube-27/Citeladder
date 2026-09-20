import { Database } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { formatSearchNumber } from './search-intelligence-format';
import { SearchIntelligenceCompetitors } from './search-intelligence-competitors';

export function SearchMetrics({
  metrics,
}: Readonly<{ metrics: readonly (readonly [string, unknown])[] }>) {
  return (
    <div className="border-border bg-panel flex flex-wrap overflow-hidden rounded-[var(--radius-card)] border">
      {metrics.map(([label, value]) => (
        <div
          key={label}
          className="border-border-subtle grid min-w-40 flex-1 gap-1 border-r p-4 last:border-0"
        >
          <span className={textRole('label')}>{label}</span>
          <span className={textRole('metricSm')}>{formatSearchNumber(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function SearchIntelligenceOverview({
  datasets,
  competitors,
  ownedHostname,
  onOpen,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  competitors: SearchIntelligenceReadiness['competitors'];
  ownedHostname: string;
  onOpen: (dataset: SearchIntelligenceDataset) => void;
}>) {
  const footprint = datasets.find(
    (item) => item.dataset_kind === 'footprint' && item.target_hostname === ownedHostname,
  );
  const backlinks = datasets.find(
    (item) => item.dataset_kind === 'backlink_summary' && item.target_hostname === ownedHostname,
  );
  if (!footprint && !backlinks)
    return (
      <EmptyState
        icon={Database}
        heading="Your search-market view starts here"
        description="Review the estimated cost, then run your first analysis."
      />
    );
  return (
    <Stack gap="workspace" className="min-w-0">
      <SearchMetrics
        metrics={[
          ['Organic keywords', footprint?.summary.organic_keywords],
          ['Estimated monthly traffic', footprint?.summary.estimated_monthly_traffic],
          ['Top-10 keywords', footprint?.summary.top_10_keywords],
          ['Referring domains', backlinks?.summary.referring_main_domains],
          ['Backlinks', backlinks?.summary.backlinks],
        ]}
      />
      <SearchIntelligenceCompetitors
        datasets={datasets}
        competitors={competitors}
        onOpen={onOpen}
      />
      <p className={textRole('meta')}>
        Provider estimates and observed rankings are separate from first-party Search Demand data.
      </p>
    </Stack>
  );
}
