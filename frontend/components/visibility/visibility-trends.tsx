'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import { TrendChart } from '@/components/ui/trend-chart';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { RankingRowsTable, formatChange } from '@/components/visibility/ranking-rows';
import { EngineComparison } from '@/components/visibility/engine-comparison';
import { PromptMovement } from '@/components/visibility/prompt-insights';
import type { PromptMetricItem, Visibility, VisibilityTrendPoint } from '@/lib/api/types';
import { formatRate, type VisibilityFilters } from '@/lib/visibility/dashboard';
import { formatPointDate, toChartPoints, historicalSelection } from '@/lib/visibility/trends';
import { VISIBILITY_METRICS } from '@/lib/config/visibility';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';

const metricCodec = stringUrlCodec(
  VISIBILITY_METRICS.map((item) => item.value),
  'brand_mention_rate',
);

export function VisibilityTrends({
  query,
  visibilityQuery,
  promptQuery,
  engineFilter,
  onEvidence,
}: Readonly<{
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
  visibilityQuery: UseQueryResult<Visibility, unknown>;
  promptQuery: UseQueryResult<PromptMetricItem[], unknown>;
  engineFilter: VisibilityFilters['engine'];
  hasRuns: boolean;
  isFiltered: boolean;
  onEvidence?: (slice: Record<string, string | null>) => void;
}>) {
  const [metric, setMetric] = useUrlState('metric', metricCodec);
  const selected = visibilityQuery.data;
  if (visibilityQuery.isError)
    return <Alert tone="danger">Could not load the selected measurement.</Alert>;
  if (!selected) return <p aria-busy="true">Loading selected measurement…</p>;
  const count = selected.counts;
  return (
    <Stack gap="workspace" aria-busy={visibilityQuery.isFetching}>
      <SelectionContext selected={selected} />
      <HeadlineMetrics selected={selected} />
      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-2">
        <MeasurementHistory query={query} metric={metric} setMetric={setMetric} />
        <Card>
          <CardHeader>
            <CardTitle>Brand and competitors</CardTitle>
            <p className={textRole('meta', 'text-secondary')}>
              Share is among the tracked roster below.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <RankingRowsTable
              rows={selected.rankings}
              responses={count?.responses}
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
      <PromptMovement promptQuery={promptQuery} onEvidence={onEvidence} />
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

function SelectionContext({ selected }: { selected: Visibility }) {
  const count = selected.counts;
  const comparison = selected.comparison;
  return (
    <Stack gap="tight">
      <p className={textRole('emphasis')}>
        {selected.selection_mode === 'range'
          ? `Selected period · ${selected.from_at ? formatPointDate(selected.from_at) : 'All history'} to ${selected.to_at ? formatPointDate(selected.to_at) : 'now'} · ${selected.source_audit_ids?.length ?? 0} runs in this configuration`
          : `Selected measurement · ${formatPointDate(selected.created_at)}`}
      </p>
      <p className={textRole('meta', 'text-secondary')}>
        {count?.responses ?? selected.total_completed} measured / {count?.expected ?? 'unknown'}{' '}
        expected responses
        {' · '}
        {count?.failed ?? 'unknown'} failed · {count?.not_run ?? 'unknown'} not run
      </p>
      <p className={textRole('meta', 'text-secondary')}>
        {comparison?.baseline_at
          ? `Compared with ${formatPointDate(comparison.baseline_at)} · `
          : ''}
        {comparison?.status.replaceAll('_', ' ') ?? 'Comparison unavailable'}
        {comparison?.skipped_runs ? ` · ${comparison.skipped_runs} incompatible runs skipped` : ''}
      </p>
    </Stack>
  );
}

function HeadlineMetrics({ selected }: { selected: Visibility }) {
  const brand = selected.rankings.find((row) => row.is_brand);
  const count = selected.counts;
  const comparison = selected.comparison;
  const definitions = [
    {
      key: 'visibility',
      label: 'Visibility',
      value: selected.visibility_rate ?? null,
      numerator: count?.brand_responses,
      denominator: count?.responses,
      explanation: 'Responses mentioning the brand / successfully measured responses.',
    },
    {
      key: 'sov',
      label: 'Share of voice',
      value: brand?.share_of_voice ?? null,
      numerator: count?.brand_responses,
      denominator: count?.entity_presences,
      explanation:
        'Brand presence / presence across the disclosed tracked roster. Repeated words in one answer count once.',
    },
    {
      key: 'owned_citation',
      label: 'Owned citation rate',
      value: selected.owned_citation_rate ?? null,
      numerator: count?.owned_citation_responses,
      denominator: count?.responses,
      explanation:
        'Responses citing at least one owned source / successfully measured responses. Missing historical citation metadata stays unavailable.',
    },
  ];
  return (
    <MetricGroup>
      {definitions.map((item) => (
        <MetricItem
          key={item.key}
          label={item.label}
          value={count?.state === 'no_observations' ? 'No observations' : formatRate(item.value)}
          detail={
            <Stack gap="tight">
              <span>
                {item.numerator != null && item.denominator != null
                  ? `${item.numerator} of ${item.denominator}`
                  : 'Counts unavailable'}
              </span>
              {comparison?.status === 'matched_subset' ? (
                <details>
                  <summary className="focus-ring cursor-pointer">Matched subset change</summary>
                  <p>
                    {formatChange(comparison.deltas[item.key])} ·{' '}
                    {formatRate(comparison.baseline_values[item.key] ?? null)} →{' '}
                    {formatRate(comparison.current_values[item.key] ?? null)}
                  </p>
                  <p>
                    {comparison.matched_cells} matched observations out of{' '}
                    {comparison.current_cells} current / {comparison.baseline_cells} baseline
                    observations. Unmatched measurements remain in the full selected totals.
                  </p>
                </details>
              ) : (
                <span>{formatChange(comparison?.deltas[item.key])}</span>
              )}
              <details>
                <summary className="focus-ring cursor-pointer">Calculation</summary>
                <p>{item.explanation}</p>
              </details>
            </Stack>
          }
        />
      ))}
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
  const chartPoints = toChartPoints(points, metric).map((point, index) => {
    return {
      ...point,
      label: `${formatPointDate(points[index].completed_at)} · ${points[index].counts?.responses ?? 'unknown'} responses · ${points[index].run_count ?? 1} run(s)`,
      href: historicalSelection(
        points[index],
        typeof window === 'undefined' ? '' : window.location.search,
      ),
    };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Measurement history</CardTitle>
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
          <p>No history in this window. The selected measurement remains above.</p>
        ) : (
          <Stack gap="compact" aria-busy={query.isFetching}>
            {points.length > 1 ? (
              <TrendChart
                label="Measurement history; separate configurations are not connected"
                data={chartPoints}
                className="w-full"
              />
            ) : (
              <p>One measurement in this history window. No movement to plot.</p>
            )}
            <details>
              <summary className="focus-ring cursor-pointer">
                Inspect historical measurements
              </summary>
              <ul>
                {chartPoints.map((point, index) => (
                  <li key={points[index].source_snapshot_ids.join(':')}>
                    {point.href ? (
                      <a className="focus-ring text-accent-text underline" href={point.href}>
                        {point.label}
                      </a>
                    ) : (
                      <span>{point.label} · configuration bucket</span>
                    )}
                    {' · '}
                    {point.value === null ? 'No observations' : `${point.value.toFixed(1)}%`}
                  </li>
                ))}
              </ul>
            </details>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
