import { useId, type ReactNode } from 'react';
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

import {
  breakBridges,
  chartRows,
  distinctTicks,
  eventsInSpan,
  gapRanges,
  isolated,
  niceTicks,
  pointXs,
  type ChartRow,
} from '@/components/ui/area-chart-data';
import {
  seriesWeight,
  CHART_HEIGHT_CLASS,
  CHART_HEIGHT_PX,
  useChartWidth,
  type ChartHeight,
} from '@/components/ui/chart';
import { ChartBreakNote, ChartFrame, ChartKey } from '@/components/ui/chart-frame';
import {
  CHART_MARKER,
  CHART_OUTLINE,
  CHART_RULE_DASH,
  CHART_TEXT_SIZE,
} from '@/components/ui/chart-geometry';
import {
  AXIS_PROPS,
  ChartTooltipCard,
  GRID_PROPS,
  LINE_CURSOR,
  seriesColor,
  ShapeMark,
} from '@/components/ui/chart-tooltip';
import {
  lastMeasured,
  plottedLines,
  SeriesTable,
  type Shown,
  shownWith,
  SingleMeasurements,
  summarise,
  type TrendEvent,
  type TrendPoint,
  type TrendSeries,
} from '@/components/ui/series-data';
import { StateBlock } from '@/components/ui/state-block';
import { isAbsent } from '@/lib/format';
import {
  EventLegend,
  MARKER_SHAPES,
  useSeriesTones,
  type MarkerShape,
  type SeriesTone,
} from '@/components/ui/series-palette';

type Line = Readonly<{
  name: string;
  mark?: ReactNode;
  values: readonly (number | null)[];
  tone: SeriesTone;
  shape?: MarkerShape;
}>;

const EVENT_COLOR = {
  panel: 'var(--color-mark-ink-2)',
  model: 'var(--color-warning)',
  action: 'var(--color-positive)',
} as const;

const defaultFormat = (value: number) => `${Math.round(value * 100) / 100}`;

export function AreaChart({
  data,
  name,
  mark,
  series = [],
  events = [],
  label,
  height: heightRole = 'md',
  yMin,
  yMax,
  yFormat = defaultFormat,
  format = yFormat,
  legend = true,
  eventsLabel,
  eventLegend = false,
  you = true,
  lonePoint = 'list',
  breakNote = 'hint',
  empty,
}: Readonly<{
  data: readonly TrendPoint[];
  name?: string;
  mark?: ReactNode;
  series?: readonly TrendSeries[];
  events?: readonly TrendEvent[];
  label: string;
  height?: ChartHeight;
  yMin?: number;
  yMax?: number;
  yFormat?: (value: number) => string;
  format?: (value: number) => string;
  legend?: boolean;
  eventsLabel?: string;
  eventLegend?: boolean;
  you?: boolean;
  lonePoint?: 'list' | 'plot';
  breakNote?: 'caption' | 'hint';
  empty?: string;
}>) {
  const plotted = plottedLines({ data, name: name ?? label, mark, series });
  const tones = useSeriesTones(plotted, you);
  const keyed = plotted.length > 1;
  const lines: Line[] = plotted.map((line, index) => ({
    name: line.name,
    mark: line.mark,
    values: line.values,
    tone: tones[index] ?? 'other',
    shape: keyed ? (MARKER_SHAPES[index % MARKER_SHAPES.length] ?? 'circle') : undefined,
  }));
  if (empty && lines.every((line) => lastMeasured(line.values) < 0))
    return <StateBlock kind="empty" inline message={empty} />;
  const shown = shownWith(format);
  const table = (
    <SeriesTable
      label={label}
      data={data}
      lines={lines}
      shown={shown}
      eventLabels={eventsInSpan(data, events).map((event) => event.label)}
    />
  );
  const [only] = data;
  if (only && data.length === 1 && lonePoint === 'list')
    return (
      <ChartFrame>
        <SingleMeasurements label={label} point={only} lines={lines} format={format} />
        {table}
      </ChartFrame>
    );
  const latestText = (line: Line) => {
    const at = lastMeasured(line.values);
    const asOf = at >= 0 && at < data.length - 1 ? data[at] : undefined;
    const value = shown(line.values[at]);
    return asOf && !isAbsent(value) ? `${value} · as of ${asOf.axisLabel ?? asOf.label}` : value;
  };
  const placed = eventsInSpan(data, events);
  const note = legend ? breakNote : 'caption';
  return (
    <ChartFrame height={heightRole} summary={summarise(label, data, lines, shown)}>
      <div className="flex min-w-0 flex-col gap-4">
        {legend ? (
          <div className="flex min-w-0 items-start justify-between gap-4">
            <ChartKey
              eventsLabel={placed.length ? eventsLabel : undefined}
              entries={lines.map((line) => ({
                name: line.name,
                mark: line.mark,
                tone: line.tone,
                shape: line.shape,
                value: latestText(line),
              }))}
            />
            {note === 'hint' ? (
              <ChartBreakNote data={data} lines={lines} placement="hint" bridged />
            ) : null}
          </div>
        ) : null}
        <AreaPlot
          label={label}
          data={data}
          lines={lines}
          events={placed}
          heightRole={heightRole}
          yMin={yMin}
          yMax={yMax}
          yFormat={yFormat}
          shown={shown}
        />
        {note === 'caption' ? (
          <ChartBreakNote data={data} lines={lines} placement="caption" bridged />
        ) : null}
        <EventLegend events={placed} shown={eventLegend} />
      </div>
      {table}
    </ChartFrame>
  );
}

function AreaPlot({
  label,
  data,
  lines,
  events,
  heightRole,
  yMin,
  yMax,
  yFormat,
  shown,
}: Readonly<{
  label: string;
  data: readonly TrendPoint[];
  lines: readonly Line[];
  events: readonly TrendEvent[];
  heightRole: ChartHeight;
  yMin?: number;
  yMax?: number;
  yFormat: (value: number) => string;
  shown: Shown;
}>) {
  const id = useId().replaceAll(':', '');
  const height = CHART_HEIGHT_PX[heightRole];
  const [plotRef, width] = useChartWidth<HTMLDivElement>();
  const xs = pointXs(data);
  const rows = chartRows(data, lines);
  const yTicks = niceTicks({
    values: lines.flatMap((line) => line.values.filter((value) => value !== null)),
    yMin,
    yMax,
  });
  const span = Math.max(1, (xs.at(-1) ?? 0) - (xs[0] ?? 0));
  const fits = (gap: { from: number; to: number }) => ((gap.to - gap.from) / span) * width >= 80;
  const axisLabel = new Map(
    xs.map((x, index) => [x, data[index]?.axisLabel ?? data[index]?.label]),
  );
  return (
    <div
      ref={plotRef}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-label={label}
      className={cn('w-full', CHART_HEIGHT_CLASS[heightRole])}
    >
      <RechartsAreaChart
        width={width}
        height={height}
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <defs>
          {lines.map((line, index) => (
            <linearGradient key={line.name} id={`${id}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={seriesColor(line.tone)}
                stopOpacity={line.tone === 'you' ? 0.28 : 0.08}
              />
              <stop offset="100%" stopColor={seriesColor(line.tone)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="x"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={distinctTicks(xs, (x) => axisLabel.get(x))}
          padding={{ left: 16, right: 16 }}
          interval="equidistantPreserveEnd"
          minTickGap={24}
          tickFormatter={(x: number) => axisLabel.get(x) ?? ''}
        />
        <YAxis
          {...AXIS_PROPS}
          width="auto"
          ticks={yTicks}
          domain={[yTicks[0] ?? 0, yTicks.at(-1) ?? 1]}
          tickFormatter={yFormat}
        />
        {gapRanges(lines[0]?.values ?? [], xs).map((gap) => (
          <ReferenceArea
            key={`gap-${gap.from}`}
            x1={gap.from}
            x2={gap.to}
            fill="var(--color-well)"
            fillOpacity={1}
            ifOverflow="hidden"
            label={
              fits(gap)
                ? {
                    value: 'No reading',
                    position: 'insideTop',
                    fill: 'var(--text-color-ink-2)',
                    fontSize: CHART_TEXT_SIZE,
                  }
                : undefined
            }
          />
        ))}
        {data.map((point, index) =>
          point.versionChange ? (
            <ReferenceLine
              key={`version-${point.label}`}
              x={xs[index]}
              stroke="var(--color-warning)"
              strokeDasharray={CHART_RULE_DASH.version}
            />
          ) : null,
        )}
        {events.map((event) => (
          <ReferenceLine
            key={event.key}
            x={event.timestamp}
            stroke={EVENT_COLOR[event.kind ?? 'action']}
            strokeDasharray={CHART_RULE_DASH.event}
          />
        ))}
        {lines.flatMap((line, at) =>
          breakBridges(line.values, data).map((bridge) => (
            <ReferenceLine
              key={`bridge-${at}-${bridge.from.x}`}
              segment={[bridge.from, bridge.to]}
              stroke={seriesColor(line.tone)}
              strokeWidth={seriesWeight(line.tone === 'you')}
              strokeDasharray={CHART_RULE_DASH.bridge}
              ifOverflow="visible"
            />
          )),
        )}
        <Tooltip
          cursor={LINE_CURSOR}
          isAnimationActive={false}
          content={<AreaTip data={data} lines={lines} shown={shown} />}
        />
        {[...lines.keys()].reverse().map((at) => {
          const line = lines[at];
          if (!line) return null;
          const color = seriesColor(line.tone);
          return (
            <Area
              key={line.name}
              dataKey={`l${at}`}
              name={line.name}
              type="monotone"
              connectNulls={false}
              isAnimationActive={false}
              stroke={color}
              strokeWidth={seriesWeight(line.tone === 'you')}
              fill={`url(#${id}-${at})`}
              activeDot={{
                r: CHART_MARKER.active,
                fill: color,
                stroke: 'var(--color-panel)',
                strokeWidth: CHART_OUTLINE,
              }}
              dot={<LineDot line={line} data={data} />}
            />
          );
        })}
      </RechartsAreaChart>
    </div>
  );
}

function LineDot({
  cx,
  cy,
  payload,
  line,
  data,
}: Readonly<{
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  line: Line;
  data: readonly TrendPoint[];
}>) {
  const index = payload && !payload.break ? payload.index : -1;
  const value = index >= 0 ? line.values[index] : null;
  if (cx === undefined || cy === undefined || value === null || value === undefined) return <g />;
  if (!line.shape && !isolated(line.values, index, data)) return <g />;
  return (
    <g data-trend-point={line.tone}>
      <ShapeMark
        x={cx}
        y={cy}
        r={CHART_MARKER.marker}
        shape={line.shape ?? 'circle'}
        color={seriesColor(line.tone)}
        outline
      />
    </g>
  );
}

function AreaTip({
  active,
  payload,
  data,
  lines,
  shown,
}: Readonly<{
  active?: boolean;
  payload?: readonly { payload?: ChartRow }[];
  data: readonly TrendPoint[];
  lines: readonly Line[];
  shown: Shown;
}>) {
  const row = payload?.[0]?.payload;
  if (!active || !row || row.break) return null;
  const point = data[row.index];
  if (!point) return null;
  return (
    <ChartTooltipCard
      title={point.label}
      note={point.versionChange?.note}
      rows={lines.map((line) => ({
        name: line.name,
        color: seriesColor(line.tone),
        shape: line.shape,
        mark: line.mark,
        value: shown(line.values[row.index]),
      }))}
    />
  );
}
