import type { ReadinessCheck, ReadinessDimension, SiteScoreSummary } from '@citeladder/contracts';

import { Absence, printed } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PassFailBar, ScoreBar, scoreTone } from '@/components/ui/score-gauge';
import { TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { formatCount } from '@/lib/format';
import { byPageKindRows, pageKindLabel } from '@/lib/site-health/page-kinds';
import { formatScore } from '@/lib/site-health/status';

const READABLE_CHECKS: ReadonlyArray<{ rule: string; label: string }> = [
  { rule: 'aeo.server_rendered_content', label: 'Content in the server HTML' },
  { rule: 'aeo.structured_data_present', label: 'Structured data present' },
  { rule: 'aeo.schema_required_valid', label: 'Expected schema valid' },
  { rule: 'aeo.open_graph_present', label: 'Open Graph tags' },
  { rule: 'aeo.product_answer_facts', label: 'Product price, availability, description' },
  { rule: 'aeo.product_evidence_facts', label: 'Product reviews, specs, materials' },
];

const READABLE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'check', label: 'Check', kind: 'identity' },
  { key: 'share', label: 'Share passing', hideLabel: true },
  { key: 'passing', label: 'Passing', kind: 'number', width: 'figure' },
  { key: 'failing', label: 'Failing', kind: 'number', width: 'figure' },
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
      {rows.length === 0 ? (
        <StateBlock kind="empty" inline message="No page checks were resolved in this crawl." />
      ) : (
        <DataTable label="Pages passing and failing each check" columns={READABLE_COLUMNS}>
          {rows.map((row) => (
            <TableRow key={row.rule}>
              <TableCell>{row.label}</TableCell>
              <TableCell>
                <PassFailBar passing={row.passing} failing={row.failing} />
              </TableCell>
              <TableCell numeric>{formatCount(row.passing)}</TableCell>
              <TableCell numeric tone={row.failing > 0 ? 'negative' : undefined}>
                {formatCount(row.failing)}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </TitledSection>
  );
}

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
  issueHref,
}: Readonly<{
  dimensions: readonly ReadinessDimension[];
  issueHref: (ruleId: string) => string;
}>) {
  return (
    <DataTable title="Dimensions" columns={DIMENSION_COLUMNS}>
      {dimensions.map((dimension) => {
        const issues = dimensionIssues(dimension);
        const largest = issues[0];
        return (
          <TableRow key={dimension.key}>
            <TableCell>
              <ClampText lines={1}>{dimension.label}</ClampText>
            </TableCell>
            <TableCell numeric>
              <DimensionScore dimension={dimension} />
            </TableCell>
            <TableCell>
              <ScoreBar score={dimension.score} />
            </TableCell>
            <TableCell numeric>{formatCount(issues.length)}</TableCell>
            <TableCell numeric>{formatCount(dimension.failing_page_count)}</TableCell>
            <TableCell>
              {largest ? (
                <TextLink
                  text="body"
                  underline="hover"
                  href={issueHref(largest.rule_id)}
                  box="target-shrink"
                >
                  <ClampText lines={1}>{largest.title}</ClampText>
                </TextLink>
              ) : null}
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
