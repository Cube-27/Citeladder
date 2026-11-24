import type { ReactNode } from 'react';

import type { SiteHealthOverview } from '@citeladder/contracts';

import { Absence, printed } from '@/components/ui/absence';
import { Stack } from '@/components/ui/layout';
import { BarRows, ScoreGauge, scoreTone, type BarRow } from '@/components/ui/score-gauge';
import { SectionCard, TitledSection } from '@/components/ui/section';
import { StatusMark } from '@/components/ui/status-mark';
import { formatCount } from '@/lib/format';
import { formatScore } from '@/lib/site-health/status';

type Dimension = Pick<
  SiteHealthOverview['aeo_dimensions'][number],
  'key' | 'label' | 'score' | 'dimension_applicability'
>;
type Area = SiteHealthOverview['web_fundamentals']['areas'][number];

function scoreRow(key: string, label: ReactNode, score: number | null, absent: ReactNode): BarRow {
  return {
    key,
    label,
    figure: score === null ? absent : printed(formatScore(score)),
    share: score === null ? null : score / 100,
    tone: score === null ? 'info' : scoreTone(score),
  };
}

const dimensionRow = (dimension: Dimension) =>
  scoreRow(
    dimension.key,
    dimension.label,
    dimension.score,
    <Absence
      state={
        dimension.dimension_applicability === 'not_applicable' ? 'not_applicable' : 'not_measured'
      }
    />,
  );

function areaRow(area: Area) {
  const judged = area.passed_count + area.missing_count;
  return scoreRow(
    area.key,
    <span className="capitalize">{area.key}</span>,
    judged > 0 ? (area.passed_count / judged) * 100 : null,
    <Absence state="not_measured" />,
  );
}

export function ScoreCard({
  title,
  score,
  rows,
  actions,
}: Readonly<{
  title: string;
  score: number | null;
  rows: readonly BarRow[];
  actions?: ReactNode;
}>) {
  return (
    <TitledSection title={title} actions={actions}>
      <SectionCard>
        <Stack gap="item">
          <ScoreGauge label={title} score={score} />
          <BarRows label={`${title} breakdown`} rows={rows} />
        </Stack>
      </SectionCard>
    </TitledSection>
  );
}

export function AeoScoreCard({
  score,
  dimensions,
  actions,
}: Readonly<{ score: number | null; dimensions: readonly Dimension[]; actions?: ReactNode }>) {
  return (
    <ScoreCard
      title="AEO readiness"
      score={score}
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
  const counts = SEVERITIES.map((severity) => data.severity_counts[severity.key] ?? 0);
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
