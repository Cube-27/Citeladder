import type { ReadinessCheck, ReadinessDimension, SiteScoreSummary } from '@citeladder/contracts';

import { Absence, printed } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Pressable } from '@/components/ui/pressable';
import { scoreTone, type BarTone } from '@/components/ui/score-gauge';
import { SectionCard, TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { byPageKindRows, pageKindLabel } from '@/lib/site-health/page-kinds';
import { formatScore } from '@/lib/site-health/status';
import { cn } from '@/lib/utils';

const READABLE_CHECKS: ReadonlyArray<{ rule: string; label: string }> = [
  { rule: 'aeo.server_rendered_content', label: 'Content in the server HTML' },
  { rule: 'aeo.structured_data_present', label: 'Structured data present' },
  { rule: 'aeo.schema_required_valid', label: 'Expected schema valid' },
  { rule: 'aeo.open_graph_present', label: 'Open Graph tags' },
  { rule: 'aeo.product_answer_facts', label: 'Product price, availability, description' },
  { rule: 'aeo.product_evidence_facts', label: 'Product reviews, specs, materials' },
];

const failingPages = (check: ReadinessCheck) => check.missing_count + check.partial_count;

export function ReadableCard({
  dimensions,
}: Readonly<{ dimensions: readonly ReadinessDimension[] }>) {
  const checks = new Map(
    dimensions.flatMap((dimension) => dimension.checks).map((check) => [check.rule_id, check]),
  );
  const rows = READABLE_CHECKS.flatMap(({ rule, label }) => {
    const check = checks.get(rule);
    if (!check) return [];
    const passing = check.satisfied_count;
    const failing = failingPages(check);
    return passing + failing > 0 ? [{ rule, label, passing, failing }] : [];
  });
  return (
    <TitledSection title="What answer engines can read">
      <SectionCard>
        {rows.length === 0 ? (
          <StateBlock kind="empty" inline message="No page checks were resolved in this crawl." />
        ) : (
          <table className="w-full">
            <caption className="sr-only">Pages passing and failing each check</caption>
            <thead>
              <tr className={textRole('caption', 'text-ink-2')}>
                <th scope="col" className="pb-2 text-left font-medium">
                  Check
                </th>
                <th scope="col">
                  <span className="sr-only">Share passing</span>
                </th>
                <th scope="col" className="w-16 pb-2 text-right font-medium">
                  Passing
                </th>
                <th scope="col" className="w-16 pb-2 text-right font-medium">
                  Failing
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rule} className="border-rule h-10 border-t">
                  <th scope="row" className={textRole('body', 'pr-3 text-left font-normal')}>
                    {row.label}
                  </th>
                  <td className="w-2/5 pr-3">
                    <SplitBar passing={row.passing} failing={row.failing} />
                  </td>
                  <td className={textRole('body', 'text-right tabular-nums')}>
                    {formatCount(row.passing)}
                  </td>
                  <td
                    className={textRole(
                      'body',
                      cn('text-right tabular-nums', row.failing > 0 && 'text-negative'),
                    )}
                  >
                    {formatCount(row.failing)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </TitledSection>
  );
}

function SplitBar({ passing, failing }: Readonly<{ passing: number; failing: number }>) {
  const total = passing + failing;
  return (
    <span aria-hidden className="rounded-mark flex h-2 gap-0.5 overflow-hidden">
      {passing > 0 ? (
        <span
          className="bg-positive block h-full"
          style={{ width: `${(passing / total) * 100}%` }}
        />
      ) : null}
      {failing > 0 ? (
        <span
          className="bg-negative block h-full"
          style={{ width: `${(failing / total) * 100}%` }}
        />
      ) : null}
    </span>
  );
}

const BAR_FILL: Record<BarTone, string> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
  info: 'bg-info',
};

const DIMENSION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'dimension', label: 'Dimension', kind: 'identity' },
  { key: 'score', label: 'Score', kind: 'number', width: 'figure' },
  { key: 'bar', label: 'Score bar', hideLabel: true },
  { key: 'issues', label: 'Issues', kind: 'number', width: 'figure' },
  { key: 'pages', label: 'Pages affected', kind: 'number', width: 'metric' },
  { key: 'largest', label: 'Largest issue', priority: 'low' },
];

function dimensionIssues(dimension: ReadinessDimension): ReadinessCheck[] {
  return dimension.checks
    .filter((check) => check.failing_entity_count > 0)
    .sort((a, b) => b.failing_entity_count - a.failing_entity_count);
}

function DimensionScore({ dimension }: Readonly<{ dimension: ReadinessDimension }>) {
  if (dimension.dimension_applicability === 'not_applicable')
    return <Absence state="not_applicable" />;
  if (dimension.score === null)
    return dimension.dimension_measurement_state === 'excluded' ? (
      <Absence state="unavailable" label="Excluded" />
    ) : (
      <Absence state="not_measured" />
    );
  return printed(formatScore(dimension.score));
}

export function DimensionsTable({
  dimensions,
  onOpen,
}: Readonly<{ dimensions: readonly ReadinessDimension[]; onOpen: (key: string) => void }>) {
  return (
    <DataTable title="Dimensions" columns={DIMENSION_COLUMNS}>
      {dimensions.map((dimension) => {
        const issues = dimensionIssues(dimension);
        const open = () => onOpen(dimension.key);
        return (
          <TableRow key={dimension.key} onClick={open} className="cursor-pointer">
            <TableCell>
              <Pressable
                aria-haspopup="dialog"
                aria-label={`${dimension.label} evidence`}
                onClick={(event) => {
                  event.stopPropagation();
                  open();
                }}
                className="grid min-w-0"
              >
                <ClampText lines={1} className={textRole('emphasis')}>
                  {dimension.label}
                </ClampText>
              </Pressable>
            </TableCell>
            <TableCell numeric>
              <DimensionScore dimension={dimension} />
            </TableCell>
            <TableCell>
              <span aria-hidden className="bg-well rounded-mark block h-2 min-w-24 overflow-hidden">
                {dimension.score === null ? null : (
                  <span
                    className={cn('block h-full', BAR_FILL[scoreTone(dimension.score)])}
                    style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }}
                  />
                )}
              </span>
            </TableCell>
            <TableCell numeric>{formatCount(issues.length)}</TableCell>
            <TableCell numeric>{formatCount(dimension.failing_page_count)}</TableCell>
            <TableCell>
              {issues[0] ? <ClampText lines={1}>{issues[0].title}</ClampText> : null}
            </TableCell>
          </TableRow>
        );
      })}
    </DataTable>
  );
}

const KIND_COLUMNS: readonly DataTableColumn[] = [
  { key: 'kind', label: 'Page kind', kind: 'identity' },
  { key: 'pages', label: 'Pages', kind: 'number', width: 'metric' },
  { key: 'aeo', label: 'AEO readiness', kind: 'number', width: 'metric' },
];

const HEAT = {
  positive: 'positive',
  warning: 'warning',
  negative: 'negative',
  info: 'info',
} as const;

export function KindScoresTable({ summary }: Readonly<{ summary: SiteScoreSummary | null }>) {
  const rows = summary ? byPageKindRows(summary.by_page_kind) : [];
  if (rows.length === 0) return null;
  return (
    <DataTable title="Score by page kind" columns={KIND_COLUMNS}>
      {rows.map((row) => (
        <TableRow key={row.page_kind}>
          <TableCell>{pageKindLabel(row.page_kind)}</TableCell>
          <TableCell numeric>{formatCount(row.analyzed_count)}</TableCell>
          <TableCell numeric>
            {row.aeo_readiness_score === null ? (
              <Absence
                state={row.aeo_measurement_state === 'excluded' ? 'not_applicable' : 'not_measured'}
              />
            ) : (
              <StatusMark tone={HEAT[scoreTone(row.aeo_readiness_score)]}>
                {printed(formatScore(row.aeo_readiness_score))}
              </StatusMark>
            )}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
