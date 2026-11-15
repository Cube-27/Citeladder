import { useId, useState, type ComponentProps, type KeyboardEvent } from 'react';

import { CHART_HEIGHT_PX, useChartWidth } from '@/components/ui/chart';
import {
  ChartFrame,
  ChartKey,
  ChartTable,
  ChartTipSheet,
  type FrameHeight,
} from '@/components/ui/chart-frame';
import {
  AXIS_TEXT,
  EndLabels,
  EventTicks,
  GapBands,
  HatchPattern,
  LABEL_CHAR_WIDTH,
  MARKER_SHAPES,
  Markers,
  SERIES_STROKE,
  gapBands,
  placeEndLabels,
  seriesTone,
  stepPath,
  type MarkerShape,
  type SeriesTone,
} from '@/components/ui/step-chart-parts';
import {
  labelledIndexes,
  linePoints,
  trendScale,
  type TrendScale,
} from '@/components/ui/trend-geometry';
import { availabilityLabel } from '@/lib/format';

export type TrendPoint = {
  /** The point in full ("10 Sep 2026 · run 4"): the tooltip's title and the table's column. */
  label: string;
  /** The short form under the axis, when `label` is too long to sit there. */
  axisLabel?: string;
  /** Null is a missing period: a hatched band, never a drop to zero. */
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
};

/** Something that happened at a moment: an ink tick on the time axis with its flag. */
export type TrendEvent = { key: string; timestamp: number; label: string };

type Line = {
  name: string;
  values: readonly (number | null)[];
  tone: SeriesTone;
  shape: MarkerShape;
};

const TIP_WIDTH = 216;
/** Markers are drawn while every one still has room. */
const MARKER_LIMIT = 40;
const defaultFormat = (value: number) => `${Math.round(value * 100) / 100}`;

/**
 * The chart's keys: the series key when end labels would collide, and the
 * event ticks' key beside end labels or a single line.
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
 * StepChart — a time series as steps (brand direction 3.3): each measurement
 * holds until the next, with a square marker per point up to 40. Your line
 * is the accent at 2px with filled markers; rivals take ink and the cool hues
 * at 1.5px with hollow markers. A missing period breaks the line and shows a
 * hatched band with its word; nothing is interpolated. Lines are named at
 * their right end, and a key appears only when those labels would collide.
 * At most four gridlines; events are ink ticks on the time axis. The tooltip
 * is a sheet, read with the pointer or the arrow keys, and a summary and a
 * table carry every value to assistive technology.
 */
export function StepChart({
  data,
  name,
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
  you = true,
}: Readonly<{
  /** The first line, one entry per point; its labels and timestamps place every line. */
  data: readonly TrendPoint[];
  /** The first line's name; defaults to `label`. */
  name?: string;
  /** Up to three further lines on the same points, leader first. */
  series?: readonly TrendSeries[];
  events?: readonly TrendEvent[];
  /** What the chart shows, e.g. "Mention rate over time". */
  label: string;
  height?: FrameHeight;
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
  /** The first line is your brand (the accent); false draws it as the first rival. */
  you?: boolean;
}>) {
  const [plotRef, width] = useChartWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const hatch = `gap-hatch-${useId().replaceAll(':', '')}`;
  const height = CHART_HEIGHT_PX[heightRole];
  const plotted: readonly Readonly<{
    name: string;
    values: readonly (number | null)[];
    other?: boolean;
  }>[] = [
    { name: name ?? label, values: data.map((point) => point.value) },
    ...series
      .slice(0, 3)
      .map((entry) => ({ name: entry.label, values: entry.values, other: entry.other })),
  ];
  const toned = plotted.map((line, index) => ({
    name: line.name,
    values: line.values,
    tone: seriesTone(line, index, you),
  }));
  const shown = (value: number | null | undefined) =>
    value === null || value === undefined ? availabilityLabel('not_measured') : format(value);
  const latestOf = (line: Pick<Line, 'values'>) => line.values[lastMeasured(line.values)] ?? null;
  const labelText = (line: Pick<Line, 'name' | 'values'>) =>
    toned.length === 1 ? shown(latestOf(line)) : `${line.name} ${shown(latestOf(line))}`;
  const gutter = Math.min(
    Math.round(width * 0.35),
    Math.max(...toned.map((line) => labelText(line).length)) * LABEL_CHAR_WIDTH + 16,
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
      tickWidth: (ticks) => Math.max(...ticks.map((tick) => yFormat(tick).length)),
    });
  const labelled = scaleFor(gutter);
  const endLabels = placeEndLabels(
    toned.flatMap((line) => {
      const latest = latestOf(line);
      return latest === null
        ? []
        : [{ key: line.name, text: labelText(line), tone: line.tone, y: labelled.y(latest) }];
    }),
    labelled.right,
  );
  const scale = endLabels ? labelled : scaleFor(24);
  const keyed = !endLabels && toned.length > 1;
  const lines: Line[] = toned.map((line, index) => ({
    ...line,
    shape: keyed ? (MARKER_SHAPES[index % MARKER_SHAPES.length] ?? 'square') : 'square',
  }));
  const count = data.length;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? count - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive(event.key === 'ArrowRight' ? Math.min(count - 1, from + 1) : Math.max(0, from - 1));
    } else if (event.key === 'Escape') setActive(null);
  };
  const placed = placedEvents(data, events, scale);
  const point = active === null ? undefined : data[active];

  return (
    <ChartFrame height={heightRole} summary={summarise(label, data, lines, shown)}>
      <div className="flex min-w-0 flex-col gap-4">
        <StepChartKeys
          keyed={legend && keyed}
          labelled={Boolean(endLabels) || lines.length === 1}
          eventsLabel={placed.length ? eventsLabel : undefined}
          entries={lines.map((line) => ({
            name: line.name,
            tone: line.tone,
            shape: line.shape,
            value: shown(latestOf(line)),
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
            hatch={hatch}
            endLabels={endLabels}
            events={placed}
          />
          {active === null || !point ? null : (
            <ChartTipSheet
              title={point.label}
              top={scale.padTop}
              left={tipLeft(scale.x(active), width)}
              note={point.versionChange?.note}
              rows={lines.map((line) => ({
                name: line.name,
                tone: line.tone,
                shape: keyed ? line.shape : undefined,
                value: shown(line.values[active]),
              }))}
            />
          )}
        </div>
      </div>
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
          ...placed.map((event) => event.label),
        ]}
      />
    </ChartFrame>
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

/** The index of the latest measured value, or -1. */
function lastMeasured(values: readonly (number | null)[]) {
  for (let index = values.length - 1; index >= 0; index -= 1)
    if (values[index] !== null) return index;
  return -1;
}

/** Beside the crosshair, flipped to its left where it would run off the plot. */
function tipLeft(x: number, width: number) {
  return x + 16 + TIP_WIDTH > width ? x - 16 - TIP_WIDTH : x + 16;
}

function StepPlot({
  data,
  lines,
  scale,
  width,
  height,
  active,
  yFormat,
  hatch,
  endLabels,
  events,
}: Readonly<{
  data: readonly TrendPoint[];
  lines: readonly Line[];
  scale: TrendScale;
  width: number;
  height: number;
  active: number | null;
  yFormat: (value: number) => string;
  hatch: string;
  endLabels: ReturnType<typeof placeEndLabels>;
  events: ReturnType<typeof placedEvents>;
}>) {
  const breaks = data.map((point) => point.breakBefore === true);
  const bottom = scale.padTop + scale.plotHeight;
  const markers = data.length <= MARKER_LIMIT;
  // Past the limit a keyed chart still marks its labelled points: the shape names the line.
  const sparse = new Set(labelledIndexes(scale, data.length));
  const keyed = lines.some((line) => line.shape !== 'square');
  return (
    <svg
      aria-hidden
      focusable="false"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
    >
      <defs>
        <HatchPattern id={hatch} />
      </defs>
      <GapBands
        bands={gapBands(lines[0]?.values ?? [], scale)}
        top={scale.padTop}
        bottom={bottom}
        hatch={hatch}
        word={availabilityLabel('not_measured').toLowerCase()}
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
      <EventTicks events={events} bottom={bottom} labelled={events.length <= 3} />
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
            <path
              d={stepPath(points)}
              fill="none"
              strokeWidth={line.tone === 'you' ? 2 : 1.5}
              strokeLinejoin="miter"
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
    return [{ key: event.key, label: event.label, x: scale.xAt(offset / span) }];
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
