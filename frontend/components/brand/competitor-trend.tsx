import type { UseQueryResult } from '@tanstack/react-query';
import type { VisibilityTrendPoint } from '@citeladder/contracts';

import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { AreaChart } from '@/components/ui/area-chart';
import { RankedBrandMark } from '@/components/visibility/ranked-brand-mark';
import { SegmentedControl } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { VISIBILITY_METRICS } from '@/lib/config/visibility';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  toChartPoints,
  toNamedChartPoints,
  toTrendEvents,
  trendAxis,
} from '@/lib/visibility/trends';

type Metric = (typeof VISIBILITY_METRICS)[number]['value'];

const metricCodec = stringUrlCodec(
  VISIBILITY_METRICS.map((item) => item.value),
  'brand_mention_rate',
);

/** "<Competitor> against you": the competitor's line and yours, with the trend's markers. */
export function CompetitorTrend({
  name,
  query,
}: Readonly<{ name: string; query: UseQueryResult<VisibilityTrendPoint[], unknown> }>) {
  const [metric, setMetric] = useUrlState('metric', metricCodec);
  return (
    <Section aria-labelledby="competitor-trend">
      <SectionHeader
        actions={
          <SegmentedControl
            ariaLabel="Plotted metric"
            value={metric}
            options={VISIBILITY_METRICS}
            onChange={setMetric}
          />
        }
      >
        <SectionTitle id="competitor-trend">{name} against you</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <TrendBody name={name} metric={metric} query={query} />
      </SectionContent>
    </Section>
  );
}

function TrendBody({
  name,
  metric,
  query,
}: Readonly<{
  name: string;
  metric: Metric;
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
}>) {
  if (query.isPending)
    return <StateBlock kind="loading" label="Loading the history…" shape={{ kind: 'chart' }} />;
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title="Couldn't load the history"
        fallback="Check your connection and try again."
      />
    );
  if (!query.data.length)
    return <StateBlock kind="empty" inline message="No runs in this period." />;
  return <TrendChart name={name} metric={metric} points={query.data} busy={query.isFetching} />;
}

function TrendChart({
  name,
  metric,
  points,
  busy,
}: Readonly<{
  name: string;
  metric: Metric;
  points: readonly VisibilityTrendPoint[];
  busy: boolean;
}>) {
  const timeZone = useDisplayTimeZone();
  const { label: engineLabel } = useEngineCatalog();
  const metricLabel =
    VISIBILITY_METRICS.find((item) => item.value === metric)?.label ?? 'Visibility';
  // Your line is the chart's first (the "you" tone); a point that did not
  // measure the competitor is a gap in theirs, never a zero.
  const yours = toChartPoints(points, metric, timeZone);
  const theirs = toNamedChartPoints(points, metric, name, timeZone).map((point) => point.value);
  const axis = trendAxis(metric, [yours.map((point) => point.value), theirs]);
  const events = toTrendEvents(points, { timeZone, engineLabel });
  return (
    <Stack aria-busy={busy}>
      <AreaChart
        label={`${metricLabel} over time`}
        name="You"
        mark={<RankedBrandMark rows={points.at(-1)?.rankings} name={null} />}
        data={yours.map((point) => ({
          ...point,
          value: axis.plot(point.value),
          label: `${point.dateLabel} · ${axis.format(point.value)}`,
          axisLabel: point.label,
        }))}
        series={[
          {
            label: name,
            mark: <RankedBrandMark rows={points.at(-1)?.rankings} name={name} />,
            values: theirs.map(axis.plot),
          },
        ]}
        events={events}
        eventLegend
        yMin={axis.yMin}
        yMax={axis.yMax}
        yFormat={axis.tick}
        format={(plotted) => axis.format(axis.unplot(plotted))}
      />
      <p className={textRole('caption')}>
        A line breaks where two runs are not comparable, so a run with no comparable run beside it
        shows as a lone mark.
        {events.some((event) => event.kind === 'action')
          ? ' A marker shows when work went live, not that it changed these rates.'
          : ''}
      </p>
    </Stack>
  );
}
