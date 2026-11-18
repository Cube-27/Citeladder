import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';

import { CHART_HEIGHT_PX, chartPath, useChartWidth, type ChartHeight } from '@/components/ui/chart';
import { ChartFrame, ChartKey, ChartTable, ChartTipSheet } from '@/components/ui/chart-frame';
import {
  AXIS_TEXT,
  EndLabels,
  EventLegend,
  EventTicks,
  GapBands,
  LABEL_CHAR_WIDTH,
  MARKER_SHAPES,
  Markers,
  SERIES_STROKE,
  YouFill,
  areaPath,
  gapBands,
  placeEndLabels,
  useSeriesTones,
  type EventKind,
  type MarkerShape,
  type SeriesTone,
} from '@/components/ui/step-chart-parts';
import {
  labelledIndexes,
  linePoints,
  onGrid,
  trendScale,
  type TrendScale,
} from '@/components/ui/trend-geometry';
import { textRole } from '@/components/ui/typography';
import { Value } from '@/components/ui/value';
import { availabilityLabel } from '@/lib/format';

export type TrendPoint = {
  /** The point in full ("10 Sep 2026 · run 4"): the tooltip's title and the table's column. */
  label: string;
  /** The short form under the axis, when `label` is too long to sit there. */
  axisLabel?: string;
  /** Null is a missing period: a `well` band with its word, never a drop to zero. */
  value: number | null;
  /** Measured under a changed method: marked across the plot, with its note. */
  versionChange?: { note: string } | null;
  /** When the point was measured; with every point stamped the x axis is real time. */
  timestamp?: number;
  /** Not comparable with the point before it: every line breaks here. */
  breakBefore?: boolean;
};

/** A further line read against the first: a rival, a second rate, "Other". */
export type TrendSeries = {
  label: string;
  values: readonly (number | null)[];
  /** The merged remainder, in `data-other`, so it never reads as a brand. */
  other?: boolean;
  /** Who the line is (a rival's domain), for its page-wide colour; defaults to `label`. */
  identity?: string;
  /** The brand's logo beside its name in the key and tooltip. */
  mark?: ReactNode;
};

/** Something that happened at a moment: an ink tick on the time axis with its flag. */
export type TrendEvent = { key: string; timestamp: number; label: string; kind?: EventKind };

type Line = {
  name: string;
  mark?: ReactNode;
  values: readonly (number | null)[];
  tone: SeriesTone;
  shape: MarkerShape;
};

/** Markers are drawn while every one still has room. */
const MARKER_LIMIT = 40;
/** At most four gridlines, the floor included. */
const MAX_GRIDLINES = 4;
const defaultFormat = (value: number) => `${Math.round(value * 100) / 100}`;

/**
 * The chart's keys: the series key when end labels cannot name every line,
 * and the event ticks' key beside end labels or a single line.
 */
function StepChartKeys({
  keyed,
  labelled,
  eventsLabel,
  entries,
}: Readonly<{
  keyed: boolean;
  labelled: boolean;
  eventsLabel?: string;
  entries: ComponentProps<typeof ChartKey>['entries'];
}>) {
  if (keyed) return <ChartKey eventsLabel={eventsLabel} entries={entries} />;
  if (labelled && eventsLabel) return <ChartKey entries={[]} eventsLabel={eventsLabel} />;
  return null;
}

/**
 * StepChart — a time series as straight segments between measurements, on a
 * time axis proportional to the dates, with a round marker per point up to
 * 40. Your line is the accent at 2px with filled markers and a soft accent
 * fill under it; rivals take their page-wide identity colours
 * (`SeriesTonesContext`) at 1.5px with hollow markers. A missing period breaks
 * the line and shows a `well` band with its word; nothing is interpolated.
 * By default a chart of one period is no chart: each line prints as a compact
 * row under one date (`lonePoint="plot"` marks the points instead). Lines are named at
 * their right end with their latest value (dated when it is older than the
 * last point), and a key replaces the labels when they would collide or a
 * line has no value to label.
 * At most four gridlines; events are ink ticks on the time axis. The tooltip
 * is a sheet, read with the pointer or the arrow keys, and a summary and a
 * table carry every value to assistive technology.
 */
export function StepChart({
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
}: Readonly<{
  /** The first line, one entry per point; its labels and timestamps place every line. */
  data: readonly TrendPoint[];
  /** The first line's name; defaults to `label`. */
  name?: string;
  /** The first line's brand logo in the key and tooltip. */
  mark?: ReactNode;
  /** Up to three further lines on the same points, leader first. */
  series?: readonly TrendSeries[];
  events?: readonly TrendEvent[];
  /** What the chart shows, e.g. "Mention rate over time". */
  label: string;
  height?: ChartHeight;
  yMin?: number;
  yMax?: number;
  /** An axis tick: `42` as `42%`. */
  yFormat?: (value: number) => string;
  /** A value in the labels, tooltip and table; defaults to `yFormat`. */
  format?: (value: number) => string;
  /** False never shows a key, even when end labels collide. */
  legend?: boolean;
  /** The key's name for the event ticks, e.g. "Marked implemented". */
  eventsLabel?: string;
  /** List the events in words under the plot rather than label them on it. */
  eventLegend?: boolean;
  /** The first line is your brand (the accent); false draws it as the first rival. */
  you?: boolean;
  /** One period: `list` prints each line's value as a row; `plot` marks each line's point under a key. */
  lonePoint?: 'list' | 'plot';
}>) {
  const [plotRef, width] = useChartWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const fillId = `you-fill-${useId().replaceAll(':', '')}`;
  const height = CHART_HEIGHT_PX[heightRole];
  const plotted = plottedLines({ data, name: name ?? label, mark, series });
  const tones = useSeriesTones(plotted, you);
  const toned = plotted.map((line, index) => ({
    name: line.name,
    mark: line.mark,
    values: line.values,
    tone: tones[index] ?? 'other',
  }));
  const shown = shownWith(format);
  const [only] = data;
  const lone = lonePointMode(lonePoint, data.length);
  if (only && lone.list) {
    return (
      <ChartFrame>
        <SingleMeasurements label={label} point={only} lines={toned} format={format} />
        <StepChartTable
          label={label}
          data={data}
          lines={toned}
          shown={shown}
          eventLabels={events.map((event) => event.label)}
        />
      </ChartFrame>
    );
  }
  const latestOf = (line: Pick<Line, 'values'>) => line.values[lastMeasured(line.values)] ?? null;
  const latestText = (line: Pick<Line, 'values'>) => {
    const at = lastMeasured(line.values);
    const asOf = at >= 0 && at < data.length - 1 ? data[at] : undefined;
    const value = shown(line.values[at]);
    return asOf ? `${value} · as of ${asOf.axisLabel ?? asOf.label}` : value;
  };
  const labelText = (line: Pick<Line, 'name' | 'values'>) =>
    toned.length === 1 ? latestText(line) : `${line.name} ${latestText(line)}`;
  const gutter = onGrid(
    Math.min(
      width * 0.35,
      Math.max(...toned.map((line) => labelText(line).length)) * LABEL_CHAR_WIDTH + 16,
    ),
  );
  const scaleFor = (padRight: number) =>
    trendScale({
      width,
      height,
      lines: toned.map((line) => line.values),
      timestamps: data.map((point) => point.timestamp),
      yMin,
      yMax,
      padRight,
      tickCount: 3,
      maxTicks: MAX_GRIDLINES,
      tickWidth: (ticks) => Math.max(...ticks.map((tick) => yFormat(tick).length)),
    });
  const labelled = scaleFor(gutter);
  const ends = toned.flatMap((line) => {
    const latest = latestOf(line);
    return latest === null
      ? []
      : [{ key: line.name, text: labelText(line), tone: line.tone, y: labelled.y(latest) }];
  });
  const endLabels = lone.endLabels(ends, toned.length, labelled.right);
  const scale = endLabels ? labelled : scaleFor(24);
  const keyed = !endLabels && toned.length >= lone.keyedFrom;
  const lines = shapedLines(toned, keyed);
  const count = data.length;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyedPoint(event, active, count);
    if (next !== undefined) setActive(next);
  };
  const placed = placedEvents(data, events, scale);

  return (
    <ChartFrame height={heightRole} summary={summarise(label, data, lines, shown)}>
      <div className="flex min-w-0 flex-col gap-4">
        <StepChartKeys
          keyed={legend && keyed}
          labelled={Boolean(endLabels) || lines.length === 1}
          eventsLabel={placed.length ? eventsLabel : undefined}
          entries={lines.map((line) => ({
            name: line.name,
            mark: line.mark,
            tone: line.tone,
            shape: line.shape,
            value: latestText(line),
          }))}
        />
        {/* A focusable group: the arrow keys read the points one by one. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the plot is a keyboard-readable group */}
        <div // NOSONAR -- a keyboard-readable plot has no native element
          ref={plotRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- no native element reads a plot point by point
          role="group"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the arrow keys need focus on the plot
          tabIndex={count ? 0 : undefined} // NOSONAR -- the arrow keys need focus on the plot
          aria-label={`${label}. Use the left and right arrow keys to read each point.`}
          onKeyDown={onKeyDown}
          onMouseMove={(event) =>
            count &&
            setActive(
              scale.nearest(event.clientX - event.currentTarget.getBoundingClientRect().left),
            )
          }
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          className="focus-ring rounded-control relative w-full"
          style={{ height }}
        >
          <StepPlot
            data={data}
            lines={lines}
            scale={scale}
            width={width}
            height={height}
            active={active}
            yFormat={yFormat}
            fillId={fillId}
            endLabels={endLabels}
            events={placed}
            eventLegend={eventLegend}
          />
          <StepChartTip
            data={data}
            lines={lines}
            active={active}
            scale={scale}
            width={width}
            keyed={keyed}
            shown={shown}
          />
        </div>
        <EventLegend events={placed} shown={eventLegend} />
      </div>
      <StepChartTable
        label={label}
        data={data}
        lines={lines}
        shown={shown}
        eventLabels={placed.map((event) => event.label)}
      />
    </ChartFrame>
  );
}

/**
 * How one period draws: `list` as rows of values; `plot` as points whose lines
 * all end at one x, so a key names even a single line rather than end labels.
 */
function lonePointMode(lonePoint: 'list' | 'plot', count: number) {
  const plot = count === 1 && lonePoint === 'plot';
  return {
    list: count === 1 && !plot,
    keyedFrom: plot ? 1 : 2,
    /** End labels when every line has a latest value to name, else null and a key. */
    endLabels: (ends: Parameters<typeof placeEndLabels>[0], lines: number, right: number) =>
      !plot && ends.length === lines ? placeEndLabels(ends, right) : null,
  };
}

/** The first line from `data`, then up to three further lines, each with the identity its colour follows. */
function plottedLines({
  data,
  name,
  mark,
  series,
}: Readonly<{
  data: readonly TrendPoint[];
  name: string;
  mark: ReactNode;
  series: readonly TrendSeries[];
}>) {
  return [
    { name, mark, identity: name, values: data.map((point) => point.value), other: false },
    ...series.slice(0, 3).map((entry) => ({
      name: entry.label,
      mark: entry.mark,
      identity: entry.identity ?? entry.label,
      values: entry.values,
      other: entry.other ?? false,
    })),
  ];
}

/** Round markers while end labels name the lines; once a key does, each line its own shape. */
function shapedLines(lines: readonly Omit<Line, 'shape'>[], keyed: boolean): Line[] {
  return lines.map((line, index) => ({
    ...line,
    shape: keyed ? (MARKER_SHAPES[index % MARKER_SHAPES.length] ?? 'circle') : 'circle',
  }));
}

/** A value as the chart prints it, its absence in words. */
function shownWith(format: (value: number) => string) {
  return (value: number | null | undefined) =>
    value === null || value === undefined ? availabilityLabel('not_measured') : format(value);
}

/** The point the arrow keys move to (`null` on Escape), or undefined for any other key. */
function keyedPoint(
  event: KeyboardEvent<HTMLDivElement>,
  active: number | null,
  count: number,
): number | null | undefined {
  const from = active ?? count - 1;
  if (event.key === 'Escape') return null;
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return undefined;
  event.preventDefault();
  return event.key === 'ArrowRight' ? Math.min(count - 1, from + 1) : Math.max(0, from - 1);
}

/** Every value, method change and event of the chart, for a reader who cannot see it. */
/** The hovered or focused point's values, one row per line. */
function StepChartTip({
  data,
  lines,
  active,
  scale,
  width,
  keyed,
  shown,
}: Readonly<{
  data: readonly TrendPoint[];
  lines: readonly Line[];
  active: number | null;
  scale: TrendScale;
  width: number;
  keyed: boolean;
  shown: (value: number | null | undefined) => string;
}>) {
  const point = active === null ? undefined : data[active];
  if (active === null || !point) return null;
  return (
    <ChartTipSheet
      title={point.label}
      top={scale.padTop}
      x={scale.x(active)}
      frameWidth={width}
      note={point.versionChange?.note}
      rows={lines.map((line) => ({
        name: line.name,
        mark: line.mark,
        tone: line.tone,
        shape: keyed ? line.shape : undefined,
        value: shown(line.values[active]),
      }))}
    />
  );
}

function StepChartTable({
  label,
  data,
  lines,
  shown,
  eventLabels,
}: Readonly<{
  label: string;
  data: readonly TrendPoint[];
  lines: readonly Readonly<{ name: string; values: readonly (number | null)[] }>[];
  shown: (value: number | null | undefined) => string;
  eventLabels: readonly string[];
}>) {
  return (
    <ChartTable
      label={label}
      columns={data.map((entry) => entry.label)}
      rows={lines.map((line) => ({
        name: line.name,
        values: data.map((_, index) => shown(line.values[index])),
      }))}
      notes={[
        ...data.flatMap((entry) =>
          entry.versionChange
            ? [`Method changed at ${entry.label}: ${entry.versionChange.note}`]
            : [],
        ),
        ...eventLabels,
      ]}
    />
  );
}

/** Each line from its first measured point to its latest, in one sentence. */
function summarise(
  label: string,
  data: readonly TrendPoint[],
  lines: readonly Line[],
  shown: (value: number | null | undefined) => string,
) {
  const parts = lines.flatMap((line) => {
    const first = line.values.findIndex((value) => value !== null);
    const last = lastMeasured(line.values);
    if (first < 0) return [`${line.name}: not measured`];
    return [
      `${line.name}: ${shown(line.values[first])} on ${data[first]?.label ?? ''} to ${shown(line.values[last])} on ${data[last]?.label ?? ''}`,
    ];
  });
  return `${label}. ${parts.join('; ')}.`;
}

/**
 * One period draws no line: each line is a compact row (name left, value
 * right) under one date for the set, and the frame drops its plot height
 * (`ChartFrame`). Over several periods the chart stays.
 */
function SingleMeasurements({
  label,
  point,
  lines,
  format,
}: Readonly<{
  label: string;
  point: TrendPoint;
  lines: readonly Readonly<{ name: string; values: readonly (number | null)[] }>[];
  format: (value: number) => string;
}>) {
  return (
    <div data-single-measurement="" className="flex min-w-0 flex-col gap-2">
      <ul aria-label={label} className="flex min-w-0 flex-col">
        {lines.map((line) => {
          const value = line.values[0];
          return (
            <li key={line.name} className="flex min-w-0 items-center justify-between gap-4 py-1">
              <span className={textRole('body', 'text-ink-2 min-w-0 truncate')} title={line.name}>
                {line.name}
              </span>
              <Value
                className="shrink-0"
                value={value === null || value === undefined ? null : format(value)}
              />
            </li>
          );
        })}
      </ul>
      <p className={textRole('caption')}>{`Measured ${point.label}`}</p>
    </div>
  );
}

/** The index of the latest measured value, or -1. */
function lastMeasured(values: readonly (number | null)[]) {
  for (let index = values.length - 1; index >= 0; index -= 1)
    if (values[index] !== null) return index;
  return -1;
}

function StepPlot({
  data,
  lines,
  scale,
  width,
  height,
  active,
  yFormat,
  fillId,
  endLabels,
  events,
  eventLegend,
}: Readonly<{
  data: readonly TrendPoint[];
  lines: readonly Line[];
  scale: TrendScale;
  width: number;
  height: number;
  active: number | null;
  yFormat: (value: number) => string;
  fillId: string;
  endLabels: ReturnType<typeof placeEndLabels>;
  events: ReturnType<typeof placedEvents>;
  eventLegend: boolean;
}>) {
  const breaks = data.map((point) => point.breakBefore === true);
  const bottom = scale.padTop + scale.plotHeight;
  const markers = data.length <= MARKER_LIMIT;
  // Past the limit a keyed chart still marks its labelled points: the shape names the line.
  const sparse = new Set(labelledIndexes(scale, data.length));
  const keyed = lines.some((line) => line.shape !== 'circle');
  return (
    <svg
      aria-hidden
      focusable="false"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
    >
      <GapBands
        bands={gapBands(lines[0]?.values ?? [], scale)}
        top={scale.padTop}
        bottom={bottom}
        word="No reading"
      />
      {scale.ticks.map((tick) => {
        const y = Math.round(scale.y(tick)) + 0.5;
        return (
          <g key={`tick-${tick}`}>
            <line
              x1={scale.padLeft}
              x2={scale.right}
              y1={y}
              y2={y}
              shapeRendering="crispEdges"
              className="stroke-rule"
            />
            <text
              x={scale.padLeft - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className={AXIS_TEXT}
            >
              {yFormat(tick)}
            </text>
          </g>
        );
      })}
      {labelledIndexes(scale, data.length).map((index) => (
        <text
          key={`date-${index}`}
          x={scale.x(index)}
          y={height - 8}
          textAnchor="middle"
          className={AXIS_TEXT}
        >
          {data[index]?.axisLabel ?? data[index]?.label}
        </text>
      ))}
      {data.map((point, index) =>
        point.versionChange ? (
          <line
            key={`version-${point.label}-${index}`}
            data-version-marker=""
            x1={scale.x(index)}
            x2={scale.x(index)}
            y1={scale.padTop}
            y2={bottom}
            strokeDasharray="4 3"
            className="stroke-warning"
          />
        ) : null,
      )}
      <EventTicks events={events} top={scale.padTop} bottom={bottom} legend={eventLegend} />
      {active === null ? null : (
        <line
          x1={Math.round(scale.x(active)) + 0.5}
          x2={Math.round(scale.x(active)) + 0.5}
          y1={scale.padTop}
          y2={bottom}
          shapeRendering="crispEdges"
          className="stroke-control-line"
        />
      )}
      {[...lines].reverse().map((line) => {
        const points = linePoints(line.values, breaks, scale);
        const marked = markedPoints(points, { markers, keyed, sparse });
        return (
          <g key={line.name} data-trend-line={line.tone}>
            {line.tone === 'you' ? <YouFill id={fillId} d={areaPath(points, bottom)} /> : null}
            <path
              d={chartPath(points)}
              fill="none"
              strokeWidth={line.tone === 'you' ? 2 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={SERIES_STROKE[line.tone]}
            />
            {marked ? <Markers points={marked} tone={line.tone} shape={line.shape} /> : null}
          </g>
        );
      })}
      {endLabels ? <EndLabels labels={endLabels} /> : null}
    </svg>
  );
}

/** Events inside the plotted time span, at their place on the axis. */
function placedEvents(
  data: readonly TrendPoint[],
  events: readonly TrendEvent[],
  scale: TrendScale,
) {
  const stamps = data.flatMap((point) => (point.timestamp === undefined ? [] : [point.timestamp]));
  if (stamps.length < 2 || stamps.length !== data.length) return [];
  const first = Math.min(...stamps);
  const span = Math.max(...stamps) - first;
  if (span <= 0) return [];
  return events.flatMap((event) => {
    const offset = event.timestamp - first;
    if (!Number.isFinite(offset) || offset < 0 || offset > span) return [];
    return [{ key: event.key, label: event.label, kind: event.kind, x: scale.xAt(offset / span) }];
  });
}

/** A line's markers: every point when asked or when one stands alone, the labelled ones in a keyed chart. */
function markedPoints(
  points: ReturnType<typeof linePoints>,
  {
    markers,
    keyed,
    sparse,
  }: Readonly<{ markers: boolean; keyed: boolean; sparse: ReadonlySet<number> }>,
) {
  if (markers || points.filter(Boolean).length === 1) return points;
  return keyed ? points.map((at, index) => (sparse.has(index) ? at : null)) : null;
}
