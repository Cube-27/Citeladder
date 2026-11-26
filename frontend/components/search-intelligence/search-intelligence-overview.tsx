import { Disclosure } from '@/components/ui/disclosure';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { Section, SectionStack } from '@/components/ui/section';
import { textRole } from '@/components/ui/typography';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import type { BacklinkFigureKey } from '@citeladder/contracts/search-intelligence';
import { Database } from '@/lib/icons';
import { formatWindowDate } from '@/lib/format';
import { SEARCH_DATASET_LABELS } from '@/lib/config/search-intelligence';
import { SearchIntelligenceCompetitors } from './search-intelligence-competitors';
import { SearchValue } from './search-intelligence-value';
import { StateBlock } from '@/components/ui/state-block';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

type BacklinkFigures = SearchIntelligenceReadiness['backlink_figures'][number];

export type SearchMetric = Readonly<{
  label: string;
  value: unknown;
  fetched: boolean;
  asOf?: string | null;
  sub?: FigureSegment['sub'];
}>;

const datasetMetric = (
  label: string,
  dataset: SearchIntelligenceDataset | undefined,
  field: string,
  options: Readonly<{ asOf?: boolean; sub?: FigureSegment['sub'] }> = {},
): SearchMetric => ({
  label,
  value: dataset?.summary[field],
  fetched: Boolean(dataset),
  asOf: options.asOf ? dataset?.collection_ended_at : null,
  sub: options.sub,
});

export const figureMetric = (
  label: string,
  figures: BacklinkFigures | undefined,
  key: BacklinkFigureKey,
): SearchMetric => {
  const figure = figures?.[key];
  return { label, value: figure?.value, fetched: Boolean(figure), asOf: figure?.as_of };
};

export const figureDatasets = (
  figures: BacklinkFigures | undefined,
  datasets: readonly SearchIntelligenceDataset[],
) => {
  const ids = new Set(
    [figures?.backlinks, figures?.referring_domains, figures?.referring_main_domains, figures?.rank]
      .filter((figure) => figure != null)
      .map((figure) => figure.dataset_id),
  );
  return datasets.filter((dataset) => ids.has(dataset.id));
};

export function SearchMetrics({
  metrics,
  label,
}: Readonly<{ metrics: readonly SearchMetric[]; label?: string }>) {
  return (
    <FigureStrip
      label={label}
      segments={metrics.map((metric) => ({
        key: metric.label,
        label: metric.label,
        value: <SearchValue value={metric.value} fetched={metric.fetched} />,
        sub:
          metric.sub ??
          (metric.asOf ? (
            <>
              as of{' '}
              {DAY.test(metric.asOf) ? (
                formatWindowDate(metric.asOf)
              ) : (
                <DisplayTime value={metric.asOf} dateOnly />
              )}
            </>
          ) : undefined),
      }))}
    />
  );
}

export function SearchIntelligenceOverview({
  datasets,
  backlinkFigures,
  competitors,
  ownedHostname,
  onOpen,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  backlinkFigures: SearchIntelligenceReadiness['backlink_figures'];
  competitors: SearchIntelligenceReadiness['competitors'];
  ownedHostname: string;
  onOpen: (dataset: SearchIntelligenceDataset) => void;
}>) {
  const footprint = datasets.find(
    (item) => item.dataset_kind === 'footprint' && item.target_hostname === ownedHostname,
  );
  const backlinks = backlinkFigures.find((item) => item.target_hostname === ownedHostname);
  if (!footprint && !backlinks)
    return (
      <StateBlock
        kind="empty"
        icon={Database}
        heading="See where you rank and where competitors outrank you"
      />
    );
  const share = footprint?.summary.top_10_percentage;
  return (
    <SectionStack>
      <SearchMetrics
        label="Your search footprint"
        metrics={[
          datasetMetric('Organic keywords', footprint, 'organic_keywords', { asOf: true }),
          datasetMetric('Estimated monthly traffic', footprint, 'estimated_monthly_traffic'),
          datasetMetric('Top-10 keywords', footprint, 'top_10_keywords', {
            sub:
              footprint && share != null ? (
                <>
                  <SearchValue value={share} digits={1} />% of ranking keywords
                </>
              ) : undefined,
          }),
          figureMetric('Referring domains', backlinks, 'referring_domains'),
          figureMetric('Backlinks', backlinks, 'backlinks'),
        ]}
      />
      <SearchIntelligenceCompetitors
        datasets={datasets}
        backlinkFigures={backlinkFigures}
        competitors={competitors}
        onOpen={onOpen}
      />
      <SearchSummaryEvidence
        datasets={[...(footprint ? [footprint] : []), ...figureDatasets(backlinks, datasets)]}
      />
    </SectionStack>
  );
}

export function SearchSummaryEvidence({
  datasets,
}: Readonly<{ datasets: SearchIntelligenceDataset[] }>) {
  return (
    <Section aria-label="Metric definitions and sources">
      <Disclosure title="Metric definitions and sources">
        <p className={textRole('caption')}>
          Organic positions exclude other result types; absolute position includes them. Estimated
          traffic and CPC (USD) are provider estimates. Difficulty is organic keyword difficulty.
          DataForSEO Rank uses a 0–100 scale for the named object. Referring domains and referring
          root domains are distinct totals.
        </p>
        <Stack as="ul" gap="tight" className={textRole('caption')}>
          {datasets.map((dataset) => (
            <li key={dataset.id}>
              {SEARCH_DATASET_LABELS[dataset.dataset_kind] ?? dataset.dataset_kind} for{' '}
              {dataset.target_hostname}, collected{' '}
              <DisplayTime
                value={dataset.collection_ended_at}
                dateOnly
                fallback="at an unknown time"
              />
            </li>
          ))}
        </Stack>
      </Disclosure>
    </Section>
  );
}
