import { Stack } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { Database } from '@/lib/icons';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { SearchIntelligenceDatasetView } from './search-intelligence-dataset-view';
import { SearchIntelligenceCompetitors } from './search-intelligence-competitors';
import {
  figureDatasets,
  figureMetric,
  SearchMetrics,
  SearchSummaryEvidence,
} from './search-intelligence-overview';
import { SearchIntelligenceHistory } from './search-intelligence-history';
import { SearchValue } from './search-intelligence-value';
import type { SearchCollection } from './search-intelligence-collection-state';
import { StateBlock } from '@/components/ui/state-block';

export function SearchIntelligenceCollection({
  collection,
  datasets,
  backlinkFigures,
  competitors,
  onSelect,
}: Readonly<{
  collection: SearchCollection;
  datasets: SearchIntelligenceDataset[];
  backlinkFigures: SearchIntelligenceReadiness['backlink_figures'];
  competitors: SearchIntelligenceReadiness['competitors'];
  onSelect: (dataset: SearchIntelligenceDataset | null) => void;
}>) {
  if (collection.listingCompetitors)
    return (
      <SearchIntelligenceCompetitors
        datasets={datasets}
        competitors={competitors}
        onOpen={onSelect}
      />
    );
  return (
    <Stack gap="workspace" className="min-w-0">
      {collection.tab === 'backlinks' ? (
        <BacklinkMetrics
          datasets={datasets}
          backlinkFigures={backlinkFigures}
          targetOrigin={collection.target}
        />
      ) : null}
      <CollectionResult collection={collection} />
    </Stack>
  );
}

function BacklinkMetrics({
  datasets,
  backlinkFigures,
  targetOrigin,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  backlinkFigures: SearchIntelligenceReadiness['backlink_figures'];
  targetOrigin?: string;
}>) {
  const ofTarget = (item: { target_origin: string }) =>
    !targetOrigin || item.target_origin === targetOrigin;
  const figures = backlinkFigures.find(ofTarget);
  const summary = datasets.find(
    (item) =>
      item.dataset_kind === 'backlink_summary' && item.target_origin === figures?.target_origin,
  );
  const history = datasets.find(
    (item) => item.dataset_kind === 'backlink_history' && ofTarget(item),
  );
  const sources = figureDatasets(figures, datasets);
  return (
    <>
      <Section aria-labelledby="backlink-summary">
        <SectionHeader>
          <SectionTitle id="backlink-summary">Backlink summary</SectionTitle>
          {summary ? (
            <SectionDescription>
              Referring pages: <SearchValue value={summary.summary.referring_pages} /> · Broken
              backlinks: <SearchValue value={summary.summary.broken_backlinks} /> · Target spam:{' '}
              <SearchValue value={summary.summary.target_spam_score} />
            </SectionDescription>
          ) : null}
        </SectionHeader>
        <SearchMetrics
          metrics={[
            figureMetric('Backlinks', figures, 'backlinks'),
            figureMetric('Referring domains', figures, 'referring_domains'),
            figureMetric('Referring root domains', figures, 'referring_main_domains'),
            figureMetric('Domain rank', figures, 'rank'),
          ]}
        />
      </Section>
      {history ? <SearchIntelligenceHistory dataset={history} /> : null}
      {sources.length ? <SearchSummaryEvidence datasets={sources} /> : null}
    </>
  );
}

function CollectionResult({ collection }: Readonly<{ collection: SearchCollection }>) {
  const { dataset, title } = collection;
  if (!dataset)
    return <StateBlock kind="empty" icon={Database} heading={`No saved ${title.toLowerCase()}`} />;
  return (
    <SearchIntelligenceDatasetView
      key={dataset.id}
      dataset={dataset}
      title={title}
      description={
        collection.tab === 'competitors'
          ? `${collection.label(dataset)} compared with ${dataset.target_hostname}`
          : undefined
      }
      keywordFilters={collection.keywordDataset ? collection.keywordFilters : undefined}
    />
  );
}
