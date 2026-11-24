import type { SiteScoreSummary } from '@citeladder/contracts';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { printed } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { mutedWhenMissing, TableCell, TableRow } from '@/components/ui/table';
import { formatCount, formatPercent } from '@/lib/format';
import { formatScore } from '@/lib/site-health/status';

export function SiteShareScores({ summary }: Readonly<{ summary: SiteScoreSummary | null }>) {
  const weighting = summary?.score_weighting;
  if (weighting?.kind !== 'site_share') return null;
  return (
    <Section data-testid="site-share-scores">
      <SectionHeader>
        <SectionTitle>Score weighting by share of known URLs</SectionTitle>
      </SectionHeader>
      <DataTable label="Score weighting by share of known URLs" columns={COLUMNS}>
        {weighting.strata.map((row) => (
          <TableRow key={row.page_kind}>
            <TableCell className="whitespace-nowrap">
              <PageKindBadge pageKind={row.page_kind} />
            </TableCell>
            <TableCell numeric>
              {formatPercent(row.known_url_count / weighting.known_url_count)}
            </TableCell>
            <TableCell numeric>{formatCount(row.analyzed_count)}</TableCell>
            <TableCell numeric className={mutedWhenMissing(row.web_fundamentals_score)}>
              {printed(formatScore(row.web_fundamentals_score))}
            </TableCell>
            <TableCell numeric className={mutedWhenMissing(row.aeo_readiness_score)}>
              {printed(formatScore(row.aeo_readiness_score))}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </Section>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'kind', label: 'Page kind', kind: 'identity' },
  { key: 'share', label: 'Share of known URLs', kind: 'number' },
  { key: 'analyzed', label: 'Pages analyzed', kind: 'number', priority: 'low' },
  { key: 'web', label: 'Web fundamentals', kind: 'number' },
  { key: 'aeo', label: 'AEO readiness', kind: 'number' },
];
