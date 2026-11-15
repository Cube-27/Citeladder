import { Users } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { searchDatasetKindsWith } from '@citeladder/contracts/search-intelligence';
import { SEARCH_DATASET_LABELS } from '@/lib/config/search-intelligence';

const COMPARISON_KINDS = searchDatasetKindsWith('comparison');
import { datasetCount } from './search-intelligence-format';
import { SearchValue } from './search-intelligence-value';

// A reviewed canonical host may be www while saved competitor identities use apex domains.
export function matchesCompetitor(origin: string, domain: string): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === domain || host === `www.${domain}`;
  } catch {
    return false;
  }
}

export function SearchIntelligenceCompetitors({
  datasets,
  competitors,
  onOpen,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  competitors: SearchIntelligenceReadiness['competitors'];
  onOpen: (dataset: SearchIntelligenceDataset) => void;
}>) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Competitive footprint</SectionTitle>
      </SectionHeader>
      <DataTable
        label="Competitive footprint"
        columns={COMPETITOR_COLUMNS}
        state={
          competitors.length
            ? undefined
            : {
                kind: 'empty',
                icon: Users,
                heading: 'No competitors saved for this project',
                headingLevel: 3,
              }
        }
      >
        {competitors.map((competitor) => {
          const footprint = datasets.find(
            (item) =>
              item.dataset_kind === 'footprint' &&
              matchesCompetitor(item.target_origin, competitor.registrable_domain),
          );
          const comparison = (kind: string) =>
            datasets.find(
              (item) =>
                item.dataset_kind === kind &&
                matchesCompetitor(item.comparison_origin, competitor.registrable_domain),
            );
          return (
            <TableRow key={competitor.identity}>
              <TableCell>
                <div className="grid max-w-sm min-w-0">
                  <ClampText lines={1} className={textRole('body')}>
                    {competitor.label}
                  </ClampText>
                  <ClampText lines={1} className={textRole('caption')}>
                    {footprint?.target_hostname ?? competitor.hostname}
                  </ClampText>
                </div>
              </TableCell>
              <TableCell numeric>
                <SearchValue
                  value={footprint?.summary.organic_keywords}
                  fetched={Boolean(footprint)}
                />
              </TableCell>
              <TableCell numeric>
                <SearchValue
                  value={footprint?.summary.estimated_monthly_traffic}
                  fetched={Boolean(footprint)}
                />
              </TableCell>
              {COMPARISON_KINDS.map((kind) => {
                const dataset = comparison(kind);
                return (
                  <TableCell numeric key={kind}>
                    {dataset ? (
                      <TextLink asChild text="body">
                        <Pressable
                          className="min-h-6 w-auto min-w-6 text-center"
                          // The visible count leads the name, so a speech user can say it.
                          aria-label={`${datasetCount(dataset)} ${SEARCH_DATASET_LABELS[kind]}: ${competitor.label}`}
                          onClick={() => onOpen(dataset)}
                        >
                          {datasetCount(dataset)}
                        </Pressable>
                      </TextLink>
                    ) : (
                      <SearchValue value={null} fetched={false} />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </DataTable>
    </Section>
  );
}

const COMPETITOR_COLUMNS: readonly DataTableColumn[] = [
  { key: 'competitor', label: 'Competitor', kind: 'identity' },
  { key: 'organic', label: 'Organic keywords', kind: 'number' },
  { key: 'traffic', label: 'Est. monthly traffic', kind: 'number' },
  { key: 'missing', label: 'Missing keywords', kind: 'number' },
  { key: 'shared', label: 'Shared keywords', kind: 'number' },
];
