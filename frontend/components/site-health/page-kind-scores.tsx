import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { mutedWhenMissing, TableCell, TableRow } from '@/components/ui/table';
import { Absence, printed } from '@/components/ui/absence';
import { ICONS } from '@/lib/icons';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { MeasurementValue } from '@/components/site-health/measurement-value';
import type { SiteCrawl, SiteHealthDashboard } from '@citeladder/contracts';
import { byPageKindRows } from '@/lib/site-health/page-kinds';
import { formatCount, formatPercent } from '@/lib/format';

function emptyState(unmeasured: boolean, rowCount: number) {
  if (rowCount > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.siteHealth,
    headingLevel: 3,
    heading: unmeasured ? 'No analysis yet' : 'Pages not classified yet',
  } as const;
}

export function PageKindScores({
  crawl,
  dashboard,
}: Readonly<{
  crawl: SiteCrawl | null;
  dashboard: SiteHealthDashboard | undefined;
}>) {
  const summary = dashboard?.score_summary ?? crawl?.score_summary ?? null;
  const rows = summary === null ? [] : byPageKindRows(summary.by_page_kind);
  const weighting = summary?.score_weighting.kind === 'site_share' ? summary.score_weighting : null;
  const share = (pageKind: string) => {
    const known = weighting?.strata.find((row) => row.page_kind === pageKind)?.known_url_count;
    return weighting && known !== undefined ? known / weighting.known_url_count : null;
  };

  return (
    <DataTable
      title="Scores by page kind"
      columns={weighting ? COLUMNS : COLUMNS.filter((column) => column.key !== 'share')}
      state={emptyState(summary === null, rows.length)}
    >
      {rows.map((row) => (
        <TableRow key={row.page_kind}>
          <TableCell className="whitespace-nowrap">
            <PageKindBadge pageKind={row.page_kind} />
          </TableCell>
          {weighting ? (
            <TableCell numeric>{printed(formatPercent(share(row.page_kind)))}</TableCell>
          ) : null}
          <TableCell numeric>{formatCount(row.analyzed_count)}</TableCell>
          <TableCell numeric tone={mutedWhenMissing(row.web_fundamentals_score)}>
            <MeasurementValue
              score={row.web_fundamentals_score}
              checks={row.web_fundamentals_checks}
              state={row.web_fundamentals_state}
            />
          </TableCell>
          <TableCell numeric tone={mutedWhenMissing(row.aeo_readiness_score)}>
            <MeasurementValue
              score={row.aeo_readiness_score}
              checks={row.aeo_readiness_checks}
              state={row.aeo_measurement_state}
            />
          </TableCell>
          <TableCell numeric>
            {row.aeo_measurement_coverage === null ? (
              <Absence state="not_measured" />
            ) : (
              formatPercent(row.aeo_measurement_coverage)
            )}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'kind', label: 'Page kind', kind: 'identity' },
  { key: 'share', label: 'Share of known URLs', kind: 'number' },
  { key: 'analyzed', label: 'Pages analyzed', kind: 'number', priority: 'low' },
  { key: 'web', label: 'Web fundamentals', kind: 'number' },
  { key: 'aeo', label: 'AEO readiness', kind: 'number' },
  { key: 'coverage', label: 'AEO checklist completion', kind: 'number', width: 'metric' },
];
