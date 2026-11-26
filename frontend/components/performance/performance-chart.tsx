import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

import { printed } from '@/components/ui/absence';
import { CHART_HEIGHT_PX, chartTicks, useChartWidth } from '@/components/ui/chart';
import { ChartFrame } from '@/components/ui/chart-frame';
import { AXIS_PROPS, LINE_CURSOR } from '@/components/ui/chart-tooltip';
import { SeriesTable, shownWith, type TrendPoint } from '@/components/ui/series-data';
import { POP_FACE } from '@/components/ui/slip';
import { StateBlock } from '@/components/ui/state-block';
import { textRole } from '@/components/ui/typography';
import { formatWindowDate, pluralCount } from '@/lib/format';
import {
  formatAxisTick,
  formatMetric,
  type PerformanceChartPoint,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

const METRIC_COLOR: Record<PerformanceMetricKey, string> = {
  clicks: 'var(--color-metric-clicks)',
  impressions: 'var(--color-metric-impressions)',
  ctr: 'var(--color-metric-ctr)',
  position: 'var(--color-metric-position)',
};

export type ChartSeries = {
  key: PerformanceMetricKey;
  label: string;
  selected: PerformanceChartPoint[];
  comparison: PerformanceChartPoint[] | null;
};

type AxisPlacement = 'left' | 'right' | 'hidden';

export function axisPlacement(index: number, count: number): AxisPlacement {
  if (count > 2) return 'hidden';
  return index === 0 ? 'left' : 'right';
}

const TICK_SPACING_PX = 110;
const COMPARISON = '-comparison';

function positionCount(series: ChartSeries): number {
  return Math.max(series.selected.length, series.comparison?.length ?? 0);
}

function comparisonValues(series: ChartSeries): (number | null)[] {
  return Array.from(
    { length: positionCount(series) },
    (_, index) => series.comparison?.[index]?.value ?? null,
  );
}

function chartPoints(series: ChartSeries): TrendPoint[] {
  return Array.from({ length: positionCount(series) }, (_, index) => {
    const date = series.selected[index]?.date ?? null;
    const peer = series.comparison?.[index]?.date ?? null;
    const day = date ? formatWindowDate(date) : `Day ${index + 1}`;
    return {
      label: peer ? `${day} · vs ${formatWindowDate(peer)}` : day,
      axisLabel: date ? numericDate(date) : `Day ${index + 1}`,
      value: series.selected[index]?.value ?? null,
    };
  });
}

function numericDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}/${year?.slice(2)}`;
}

function tableLabel(series: ChartSeries): string {
  const comparing = series.comparison !== null ? ', with comparison period' : '';
  return `${series.label} over ${pluralCount(positionCount(series), 'day')}${comparing}`;
}

function spreadTicks(length: number, width: number): number[] {
  const wanted = Math.max(2, Math.floor(width / TICK_SPACING_PX));
  if (length <= wanted) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (wanted - 1);
  return Array.from({ length: wanted }, (_, index) => Math.round(index * step));
}

const AXIS_CHAR_PX = 7;

function axisWidth(labels: readonly string[]): number {
  return Math.max(...labels.map((label) => label.length), 1) * AXIS_CHAR_PX + 14;
}

function edgeAnchor(value: number, ticks: readonly number[]): 'start' | 'middle' | 'end' {
  if (value === ticks[0]) return 'start';
  if (value === ticks.at(-1)) return 'end';
  return 'middle';
}

function tooltipDate(date: string | null | undefined, index: number): string {
  if (!date) return `Day ${index + 1}`;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function PerformanceChart({ series }: Readonly<{ series: readonly ChartSeries[] }>) {
  const plotted = series.filter((entry) => entry.selected.length > 0);
  if (!series.length)
    return <StateBlock kind="empty" inline message="Select a figure above to chart it." />;
  if (!plotted.length)
    return <StateBlock kind="empty" inline message="No measured days in the selected range." />;
  return (
    <ChartFrame height="lg">
      <MetricPlot plotted={plotted} />
      {plotted.map((entry) => {
        const points = chartPoints(entry);
        return (
          <SeriesTable
            key={entry.key}
            label={tableLabel(entry)}
            data={points}
            lines={[
              { name: entry.label, values: points.map((point) => point.value) },
              ...(entry.comparison
                ? [{ name: `${entry.label} (comparison)`, values: comparisonValues(entry) }]
                : []),
            ]}
            shown={shownWith((value) => formatMetric(entry.key, value))}
            eventLabels={[]}
          />
        );
      })}
    </ChartFrame>
  );
}

function MetricPlot({ plotted }: Readonly<{ plotted: readonly ChartSeries[] }>) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const height = CHART_HEIGHT_PX.lg;
  const [anchor] = plotted;
  const length = Math.max(...plotted.map(positionCount));
  const xTicks = spreadTicks(length, width);
  const axisLabels = anchor ? chartPoints(anchor).map((point) => point.axisLabel) : [];
  const rows = Array.from({ length }, (_, x) =>
    Object.fromEntries([
      ['x', x],
      ...plotted.flatMap((entry) => [
        [entry.key, entry.selected[x]?.value ?? null],
        [`${entry.key}${COMPARISON}`, entry.comparison?.[x]?.value ?? null],
      ]),
    ]),
  );
  return (
    <div
      ref={ref}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-label={`${plotted.map((entry) => entry.label).join(', ')} by day`}
      className="w-full"
      style={{ height }}
    >
      <LineChart
        width={width}
        height={height}
        data={rows}
        margin={{ top: plotted.length <= 2 ? 28 : 8, right: 0, bottom: 0, left: 0 }}
      >
        {anchor && plotted.length <= 2 ? (
          <CartesianGrid vertical={false} stroke="var(--color-rule)" yAxisId={anchor.key} />
        ) : null}
        <XAxis
          {...AXIS_PROPS}
          dataKey="x"
          type="number"
          domain={[0, Math.max(1, length - 1)]}
          ticks={xTicks}
          interval={0}
          tick={({ x, y, payload }) => (
            <text
              x={x}
              y={y}
              dy={12}
              textAnchor={edgeAnchor(payload.value, xTicks)}
              fill="var(--color-ink-2)"
              fontSize={12}
            >
              {axisLabels[payload.value] ?? ''}
            </text>
          )}
        />
        {plotted.map((entry, index) => {
          const placement = axisPlacement(index, plotted.length);
          const values = [
            ...entry.selected.map((point) => point.value),
            ...comparisonValues(entry),
          ].filter((value) => value !== null);
          const ticks = chartTicks(0, Math.max(0, ...values), 4);
          return (
            <YAxis
              key={entry.key}
              {...AXIS_PROPS}
              yAxisId={entry.key}
              hide={placement === 'hidden'}
              orientation={placement === 'right' ? 'right' : 'left'}
              width={axisWidth(ticks.map((tick) => formatAxisTick(entry.key, tick)))}
              tickMargin={4}
              ticks={ticks}
              domain={[ticks[0] ?? 0, ticks.at(-1) ?? 1]}
              reversed={entry.key === 'position'}
              label={
                placement === 'hidden'
                  ? undefined
                  : {
                      content: ({ viewBox }) =>
                        viewBox && 'width' in viewBox ? (
                          <text
                            x={
                              placement === 'left'
                                ? viewBox.x
                                : (viewBox.x ?? 0) + (viewBox.width ?? 0)
                            }
                            y={(viewBox.y ?? 0) - 14}
                            textAnchor={placement === 'left' ? 'start' : 'end'}
                            fill="var(--color-ink-2)"
                            fontSize={12}
                          >
                            {entry.label}
                          </text>
                        ) : null,
                    }
              }
              tickFormatter={(value: number) => formatAxisTick(entry.key, value)}
            />
          );
        })}
        <Tooltip
          cursor={LINE_CURSOR}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const x = payload?.[0]?.payload?.x;
            return active && typeof x === 'number' ? (
              <MetricTip plotted={plotted} index={x} />
            ) : null;
          }}
        />
        {plotted.flatMap((entry) => [
          entry.comparison ? (
            <Line
              key={`${entry.key}${COMPARISON}`}
              yAxisId={entry.key}
              dataKey={`${entry.key}${COMPARISON}`}
              name={`${entry.label} (comparison)`}
              type="linear"
              stroke={METRIC_COLOR[entry.key]}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null,
          <Line
            key={entry.key}
            yAxisId={entry.key}
            dataKey={entry.key}
            name={entry.label}
            type="linear"
            stroke={METRIC_COLOR[entry.key]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: METRIC_COLOR[entry.key] }}
            isAnimationActive={false}
          />,
        ])}
      </LineChart>
    </div>
  );
}

function MetricTip({
  plotted,
  index,
}: Readonly<{ plotted: readonly ChartSeries[]; index: number }>) {
  const [anchor] = plotted;
  const rows = plotted.flatMap((entry) => [
    {
      key: entry.key,
      name: entry.label,
      color: METRIC_COLOR[entry.key],
      dashed: false,
      value: formatMetric(entry.key, entry.selected[index]?.value ?? null),
    },
    ...(entry.comparison
      ? [
          {
            key: `${entry.key}${COMPARISON}`,
            name: `${entry.label} · ${tooltipDate(entry.comparison[index]?.date, index)}`,
            color: METRIC_COLOR[entry.key],
            dashed: true,
            value: formatMetric(entry.key, entry.comparison[index]?.value ?? null),
          },
        ]
      : []),
  ]);
  return (
    <div className={cn(POP_FACE, 'grid min-w-56 gap-3 px-4 py-3')}>
      <p className={textRole('emphasis', 'text-ink-2')}>
        {tooltipDate(anchor?.selected[index]?.date, index)}
      </p>
      {rows.map((row) => (
        <div key={row.key} className={textRole('body', 'flex min-w-0 items-center gap-3')}>
          <span
            aria-hidden
            className={cn('w-3 shrink-0 border-t-2', row.dashed && 'border-dashed')}
            style={{ borderColor: row.color }}
          />
          <span className="text-ink-2 min-w-0 flex-1 truncate">{row.name}</span>
          <span className="text-ink font-medium tabular-nums">{printed(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
