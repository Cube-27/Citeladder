'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { httpErrorStatus } from '@/lib/api/errors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { TrendChart } from '@/components/ui/trend-chart';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { RankingRowsTable } from '@/components/visibility/ranking-rows';
import { EngineComparison } from '@/components/visibility/engine-comparison';
import type { Visibility, VisibilityTrendPoint } from '@/lib/api/types';
import { formatRate, type VisibilityFilters } from '@/lib/visibility/dashboard';
import { formatPointDate, toChartPoints, toCompetitorSeries } from '@/lib/visibility/trends';
import { changeLabel, observationLabel } from '@/lib/visibility/vocabulary';
import { VISIBILITY_METRICS } from '@/lib/config/visibility';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';

const metricCodec = stringUrlCodec(
  VISIBILITY_METRICS.map((item) => item.value),
  'brand_mention_rate',
);

export function VisibilityTrends({
  query,
  visibilityQuery,
  engineFilter,
  onEvidence,
}: Readonly<{
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
  visibilityQuery: UseQueryResult<Visibility, unknown>;
  engineFilter: VisibilityFilters['engine'];
  hasRuns: boolean;
  isFiltered: boolean;
  onEvidence?: (slice: Record<string, string | null>) => void;
}>) {
  const [metric, setMetric] = useUrlState('metric', metricCodec);
  const selected = visibilityQuery.data;
  if (visibilityQuery.isError) {
    // A 404 here is not a failure: the run exists but its results have not been
    // written yet, which is the normal state for the seconds after a run ends.
    // Reporting that as an error told readers their results were lost.
    if (httpErrorStatus(visibilityQuery.error) === 404)
      return (
        <Alert tone="info">
          Results for this run are still being prepared. They appear here as soon as they are ready.
        </Alert>
      );
    return <Alert tone="danger">Could not load the selected measurement.</Alert>;
  }
  if (!selected) return <p aria-busy="true">Loading selected measurement…</p>;
  return (
    <Stack gap="workspace" aria-busy={visibilityQuery.isFetching}>
      <HeadlineMetrics selected={selected} />
      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-2">
        <MeasurementHistory query={query} metric={metric} setMetric={setMetric} />
        <Card>
          <CardHeader>
            <CardTitle>Brand and competitors</CardTitle>
            <p className={textRole('meta', 'text-secondary')}>
              How often each brand is named, across the same answers.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <RankingRowsTable
              rows={selected.rankings}
              onSelect={
                onEvidence
                  ? (name) =>
                      onEvidence({
                        run: selected.audit_id,
                        outcome: 'competitor_gap',
                        competitor: name,
                      })
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>
      <EngineComparison
        visibility={selected}
        filter={engineFilter}
        onSelect={
          onEvidence ? (engine) => onEvidence({ run: selected.audit_id, engine }) : undefined
        }
      />
    </Stack>
  );
}

function HeadlineMetrics({ selected }: { selected: Visibility }) {
  const brand = selected.rankings.find((row) => row.is_brand);
  const count = selected.counts;
  const comparison = selected.comparison;
  const unmeasured = observationLabel(count?.state);
  const definitions = [
    {
      key: 'visibility',
      label: 'Visibility',
      value: selected.visibility_rate ?? null,
      explanation: 'The share of answers that name your brand.',
    },
    {
      key: 'sov',
      label: 'Share of voice',
      value: brand?.share_of_voice ?? null,
      explanation:
        'Your share of every brand mention across the brands you track. Repeated mentions in one answer count once.',
    },
    {
      key: 'owned_citation',
      label: 'Owned citation rate',
      value: selected.owned_citation_rate ?? null,
      explanation: 'The share of answers that link to a page you own.',
    },
  ];
  // Position is a rank, not a rate, so it renders beside the rates rather than
  // through `formatRate`. Runs measured before competitor offsets were
  // persisted have none, and the tile is omitted rather than shown empty.
  const position = brand?.avg_position ?? selected.avg_position ?? null;
  return (
    <MetricGroup>
      {definitions.map((item) => {
        const change = changeLabel(comparison?.deltas[item.key]);
        return (
          <MetricItem
            key={item.key}
            label={
              <span className="inline-flex items-center gap-1.5">
                {item.label}
                <InfoHint label={item.label}>{item.explanation}</InfoHint>
              </span>
            }
            value={unmeasured ?? formatRate(item.value)}
            // No comparable run means no change line at all. The reason is the
            // one sentence above these metrics, not a placeholder repeated
            // three times.
            detail={change ? <span aria-label={`Change: ${change}`}>{change}</span> : null}
          />
        );
      })}
      {position == null ? null : (
        <MetricItem
          label={
            <span className="inline-flex items-center gap-1.5">
              Average position
              <InfoHint label="Average position">
                Where your brand tends to appear among the brands an answer names. Counted only over
                the answers that named you.
              </InfoHint>
            </span>
          }
          value={`#${position.toFixed(1)}`}
        />
      )}
    </MetricGroup>
  );
}

function MeasurementHistory({
  query,
  metric,
  setMetric,
}: {
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
  metric: (typeof VISIBILITY_METRICS)[number]['value'];
  setMetric: (value: (typeof VISIBILITY_METRICS)[number]['value']) => void;
}) {
  const points = query.data ?? [];
  const chartPoints = toChartPoints(points, metric).map((point, index) => ({
    ...point,
    label: `${formatPointDate(points[index].completed_at)} · ${formatRate(point.value)}`,
  }));
  const competitors = toCompetitorSeries(points, metric);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Over time</CardTitle>
        <AnalysisChoice
          label="Plotted metric"
          value={metric}
          options={VISIBILITY_METRICS}
          onChange={setMetric}
        />
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <Alert tone="danger">Could not load history.</Alert>
        ) : !points.length ? (
          <p className={textRole('body', 'text-secondary')}>No measurements in this period yet.</p>
        ) : (
          <Stack gap="compact" aria-busy={query.isFetching}>
            <TrendChart
              label="Visibility over time"
              data={chartPoints}
              series={competitors}
              className="w-full"
            />
            {competitors.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                <SeriesKey label="You" swatchClass="bg-accent" />
                {competitors.map((entry) => (
                  <SeriesKey
                    key={entry.label}
                    label={entry.label}
                    swatchClass={entry.strokeClass.replace('stroke-', 'bg-')}
                  />
                ))}
              </ul>
            ) : null}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/** One entry in the chart key: the brand, then each comparison line. */
function SeriesKey({ label, swatchClass }: Readonly<{ label: string; swatchClass: string }>) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block size-2 rounded-full ${swatchClass}`} aria-hidden />
      <span className={textRole('meta', 'text-secondary')}>{label}</span>
    </li>
  );
}
