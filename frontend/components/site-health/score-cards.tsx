import type { ReactNode } from 'react';

import type { SiteHealthOverview } from '@citeladder/contracts';

import { Absence, printed } from '@/components/ui/absence';
import { Stack } from '@/components/ui/layout';
import { BarRows, ScoreGauge, scoreTone, type BarRow } from '@/components/ui/score-gauge';
import { SectionCard, TitledSection } from '@/components/ui/section';
import { StatusMark } from '@/components/ui/status-mark';
import { textRole } from '@/components/ui/typography';
import { availabilityLabel, formatCount, pluralCount } from '@/lib/format';
import { severityCount } from '@/lib/site-health/issues';
import { formatScore, statusLabel } from '@/lib/site-health/status';

type Dimension = Pick<
  SiteHealthOverview['aeo_dimensions'][number],
  | 'key'
  | 'label'
  | 'score'
  | 'dimension_applicability'
  | 'dimension_measurement_state'
  | 'reason'
  | 'unresolved_count'
>;

const MEASUREMENT_LABELS: Record<string, string> = {
  measured: 'Measured',
  limited_evidence: 'Not every check ran',
  not_measured: 'Not checked',
  excluded: 'Excluded',
  not_applicable: availabilityLabel('not_applicable'),
};

function measurementLabel(state: string): string {
  return MEASUREMENT_LABELS[state] ?? statusLabel(state);
}

function Unscored({ state, label }: Readonly<{ state: string; label?: string }>) {
  if (state === 'not_applicable' || state === 'not_measured') return <Absence state={state} />;
  return <Absence state="unavailable" label={label ?? measurementLabel(state)} />;
}
type Area = SiteHealthOverview['web_fundamentals']['areas'][number];

function scoreRow({
  key,
  label,
  score,
  absent,
}: {
  key: string;
  label: ReactNode;
  score: number | null;
  absent: ReactNode;
}): BarRow {
  return {
    key,
    label,
    figure: score === null ? absent : printed(formatScore(score)),
    share: score === null ? null : score / 100,
    tone: score === null ? 'info' : scoreTone(score),
  };
}

const dimensionRow = (dimension: Dimension) =>
  scoreRow({
    key: dimension.key,
    label: dimension.label,
    score: dimension.score,
    absent: (
      <Unscored
        state={
          dimension.dimension_applicability === 'not_applicable'
            ? 'not_applicable'
            : dimension.dimension_measurement_state
        }
        label={dimension.reason === 'measured_at_site_scope' ? 'Site-scoped evidence' : undefined}
      />
    ),
  });

function areaRow(area: Area) {
  const judged = area.passed_count + area.missing_count;
  return scoreRow({
    key: area.key,
    label: <span className="capitalize">{area.key}</span>,
    score: judged > 0 ? (area.passed_count / judged) * 100 : null,
    absent: <Unscored state={area.state} />,
  });
}

export function ScoreCard({
  title,
  score,
  state,
  rows,
  actions,
}: Readonly<{
  title: string;
  score: number | null;
  state: string;
  rows: readonly BarRow[];
  actions?: ReactNode;
}>) {
  return (
    <TitledSection title={title} actions={actions}>
      <SectionCard>
        <Stack gap="item">
          <ScoreGauge
            label={title}
            score={score}
            absent={state === 'not_measured' ? undefined : measurementLabel(state)}
          />
          <BarRows label={`${title} breakdown`} rows={rows} />
        </Stack>
      </SectionCard>
    </TitledSection>
  );
}

export function AeoScoreCard({
  score,
  state,
  dimensions,
  actions,
}: Readonly<{
  score: number | null;
  state: string;
  dimensions: readonly Dimension[];
  actions?: ReactNode;
}>) {
  return (
    <ScoreCard
      title="AEO readiness"
      score={score}
      state={state}
      rows={dimensions.map(dimensionRow)}
      actions={actions}
    />
  );
}

export function WebFundamentalsScoreCard({
  data,
  actions,
}: Readonly<{ data: SiteHealthOverview; actions?: ReactNode }>) {
  return (
    <ScoreCard
      title="Web fundamentals"
      score={data.web_fundamentals_score}
      state={data.web_fundamentals_state}
      rows={data.web_fundamentals.areas.map(areaRow)}
      actions={actions}
    />
  );
}

const SEVERITIES = [
  { key: 'high', label: 'High', tone: 'negative' },
  { key: 'medium', label: 'Medium', tone: 'warning' },
  { key: 'low', label: 'Low', tone: 'info' },
] as const;

export function SeverityCard({
  data,
  actions,
}: Readonly<{ data: SiteHealthOverview; actions?: ReactNode }>) {
  const counts = SEVERITIES.map((severity) => severityCount(data.severity_counts, severity.key));
  const largest = Math.max(...counts);
  const audited = data.audited_page_count;
  const pages = (key: string, label: string, count: number): BarRow => ({
    key,
    label,
    figure: formatCount(count),
    share: audited > 0 ? count / audited : null,
    tone: 'negative',
  });
  return (
    <TitledSection title="Issues by severity" actions={actions}>
      <SectionCard>
        <Stack gap="item">
          <span className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span className={textRole('figure')}>
              {formatCount(counts.reduce((sum, count) => sum + count, 0))}
            </span>
            <span className={textRole('caption')}>
              across {pluralCount(data.issue_count, 'issue')}
            </span>
          </span>
          <BarRows
            label="Issues by severity"
            rows={SEVERITIES.map((severity, index) => ({
              key: severity.key,
              label: (
                <StatusMark variant="severity" value={severity.key}>
                  {severity.label}
                </StatusMark>
              ),
              figure: formatCount(counts[index]!),
              share: largest > 0 ? counts[index]! / largest : null,
              tone: severity.tone,
            }))}
          />
          <BarRows
            label="Pages affected"
            rows={[
              pages(
                'technical',
                'Pages with a technical issue',
                data.technical_defect_affected_page_count,
              ),
              pages('aeo', 'Pages with an AEO gap', data.aeo_readiness_gap_affected_page_count),
            ]}
          />
        </Stack>
      </SectionCard>
    </TitledSection>
  );
}
