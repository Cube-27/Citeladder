import { ChartAxes } from '@/components/ui/chart-axes';
import { cn } from '@/lib/utils';

export type TrendPoint = {
  label: string;
  /**
   * The short form for an x-axis tick, when `label` is too long to sit under
   * the plot. A point's `label` describes it in full ("10 Sep · 38%") because
   * that is what a reader hovers to see; an axis tick has room for the date.
   */
  axisLabel?: string;
  /** Null is unavailable and renders as a gap, never as zero. */
  value: number | null;
  versionChange?: { note: string } | null;
  timestamp?: number;
  breakBefore?: boolean;
  href?: string;
};

/**
 * A second, third, … line drawn behind the primary series.
 *
 * Comparison series carry no marks, links or version markers: they exist to
 * give the primary line something to be read against, and every affordance they
 * borrowed from it would compete with it.
 */
export type TrendSeries = {
  label: string;
  values: readonly (number | null)[];
  /** Stroke class from the categorical chart tokens, e.g. `stroke-chart-2`. */
  strokeClass: string;
};

const toLinePath = (segment: { x: number; y: number }[]) =>
  segment
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

const valueText = (value: number | null) => (value === null ? 'unavailable' : `${value}`);

/** Token-only chart for cross-run visibility trends. */
/**
 * One plotted point, wrapped in a link only when it HAS somewhere to go.
 *
 * A point whose measurement carries no evidence route was still wrapped in an
 * `<a>` carrying its label; an anchor with no `href` announces as a link that
 * leads nowhere, which is worse than the plain mark it should have been.
 */
function TrendPointMark({ x, y, point }: Readonly<{ x: number; y: number; point: TrendPoint }>) {
  const description = `${point.label}: ${point.value}`;
  const mark = (
    <circle cx={x} cy={y} r={2.5} className="fill-accent" aria-label={description}>
      <title>{description}</title>
    </circle>
  );
  if (!point.href) return mark;
  return (
    <a href={point.href} aria-label={description}>
      {mark}
    </a>
  );
}

type PlottedPoint = { x: number; y: number | null; breakBefore?: boolean };

/**
 * The drawn runs of line, split wherever the series stops being continuous.
 *
 * A gap is either a point with no value or one explicitly marked as measured
 * under different conditions — joining across either would draw a change that
 * was never observed. A run of one point has no line to draw, only its mark.
 */
function lineSegmentsOf(points: readonly PlottedPoint[]): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const close = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  for (const point of points) {
    if (point.breakBefore) close();
    if (point.y === null) close();
    else current.push({ x: point.x, y: point.y });
  }
  close();
  return segments.filter((segment) => segment.length > 1);
}

/** What the chart says to a reader who cannot see it. */
function chartDescription(data: readonly TrendPoint[], label?: string): string {
  const last = data.at(-1);
  let summary = 'No trend data';
  if (data.length === 1) {
    summary = `Single point ${data[0].label} (${valueText(data[0].value)})`;
  } else if (data.length > 1) {
    summary =
      `Trend from ${data[0].label} (${valueText(data[0].value)}) ` +
      `to ${last?.label} (${valueText(last?.value ?? null)})`;
  }
  const gapNote = data.some((entry) => entry.value === null)
    ? ' Some points are unavailable and shown as gaps.'
    : '';
  return label ? `${label}: ${summary}${gapNote}` : `${summary}${gapNote}`;
}

/** Gutters exist only to hold text, so each is sized by the text it holds. */
function plotBox({
  width,
  height,
  xAxisLabel,
  yAxisLabel,
}: Readonly<{ width: number; height: number; xAxisLabel?: string; yAxisLabel?: string }>) {
  const padding = 8;
  const axes = Boolean(xAxisLabel || yAxisLabel);
  // No axis title means no rotated-label column, and no axes at all means the
  // chart keeps the symmetric padding it has always drawn with — which is what
  // makes this change invisible to every caller that names no axis.
  const gutterLeft = axes ? (yAxisLabel ? 30 : 22) : padding;
  const gutterBottom = axes ? (xAxisLabel ? 24 : 14) : padding;
  return {
    padding,
    gutterLeft,
    innerWidth: width - gutterLeft - padding,
    innerHeight: height - padding - gutterBottom,
  };
}

/**
 * Floor, midpoint and ceiling — not a dense grid.
 *
 * Those three are what a reader needs to place a point; every line beyond them
 * competes with the series for attention.
 */
function yAxisTicks(
  padding: number,
  innerHeight: number,
  domainMax: number,
  formatTick: (value: number) => string,
) {
  return [0, 0.5, 1].map((fraction) => ({
    at: padding + innerHeight * (1 - fraction),
    text: formatTick(domainMax * fraction),
  }));
}

/** First, middle and last, anchored so the outer two stay inside the plot. */
function xAxisTicks(data: readonly TrendPoint[], points: readonly { x: number }[]) {
  if (!data.length) return [];
  const indexes =
    data.length > 2
      ? [0, Math.floor((data.length - 1) / 2), data.length - 1]
      : [0, data.length - 1];
  const unique = [...new Set(indexes)];
  return unique.map((index, order) => ({
    at: points[index].x,
    text: data[index].axisLabel ?? data[index].label,
    // A lone tick sits over its point; a set is pulled inward at both ends.
    anchor: xTickAnchor(order, unique.length),
  }));
}

function xTickAnchor(order: number, total: number): 'start' | 'middle' | 'end' {
  if (total === 1) return 'middle';
  if (order === 0) return 'start';
  return order === total - 1 ? 'end' : 'middle';
}

/**
 * A stable React key per point, because labels are NOT identities.
 *
 * A series can hold several points that format to the same label (two runs on
 * the same day both render "1 Aug"), which made React collapse them onto one
 * key. EVERY point carries its occurrence suffix, including the first:
 * suffixing only repeats left the bare label in play, so a series holding both
 * "1 Aug" and a literal "1 Aug#1" collided on the second "1 Aug".
 */
function uniquePointKeys(data: readonly TrendPoint[]): string[] {
  const seenCount = new Map<string, number>();
  return data.map((entry) => {
    const seen = seenCount.get(entry.label) ?? 0;
    seenCount.set(entry.label, seen + 1);
    return `${entry.label}#${seen}`;
  });
}

/** Project each point into plot coordinates; a null value stays a gap. */
function plotPoints(
  data: readonly TrendPoint[],
  box: Readonly<{
    padding: number;
    gutterLeft: number;
    innerWidth: number;
    innerHeight: number;
    domainMax: number;
  }>,
): PlottedPoint[] {
  const { padding, gutterLeft, innerWidth, innerHeight, domainMax } = box;
  const positions = xPositions(data, gutterLeft, innerWidth);
  return data.map((entry, index) => ({
    x: positions[index],
    breakBefore: entry.breakBefore,
    y:
      entry.value === null
        ? null
        : padding + innerHeight * (1 - clampTo(entry.value, domainMax) / domainMax),
  }));
}

const clampTo = (value: number, domainMax: number) => Math.max(0, Math.min(domainMax, value));

/**
 * Real time on the x axis when every point carries a timestamp.
 *
 * Falling back to even spacing would draw a run three months late as though it
 * followed the previous one immediately.
 */
function xPositions(data: readonly TrendPoint[], gutterLeft: number, innerWidth: number): number[] {
  const stamps = data.map((entry) => entry.timestamp);
  const timed = stamps.every((value) => value !== undefined && Number.isFinite(value));
  const first = timed ? Math.min(...(stamps as number[])) : 0;
  const span = timed ? Math.max(...(stamps as number[])) - first : 0;
  if (timed && span > 0) {
    return data.map((entry) => gutterLeft + ((entry.timestamp! - first) / span) * innerWidth);
  }
  if (data.length < 2) return data.map(() => gutterLeft + innerWidth / 2);
  const stepX = innerWidth / (data.length - 1);
  return data.map((_entry, index) => gutterLeft + index * stepX);
}

export function TrendChart({
  data,
  series = [],
  width = 320,
  height = 96,
  label,
  className,
  domainMax = 100,
  xAxisLabel,
  yAxisLabel,
  formatTick = (value) => `${Math.round(value)}`,
}: Readonly<{
  data: TrendPoint[];
  /** Comparison lines sharing this chart's x positions and scale. */
  series?: readonly TrendSeries[];
  width?: number;
  height?: number;
  label?: string;
  className?: string;
  domainMax?: number;
  /** Naming either axis draws both, with ticks and gridlines. */
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Renders a y-axis tick value — `42` as `42%`, `1.2k`, and so on. */
  formatTick?: (value: number) => string;
}>) {
  const axes = Boolean(xAxisLabel || yAxisLabel);
  const { padding, gutterLeft, innerWidth, innerHeight } = plotBox({
    width,
    height,
    xAxisLabel,
    yAxisLabel,
  });
  const effectiveDomainMax = domainMax > 0 ? domainMax : 100;
  const pointKeys = uniquePointKeys(data);
  const points = plotPoints(data, {
    padding,
    gutterLeft,
    innerWidth,
    innerHeight,
    domainMax: effectiveDomainMax,
  });

  const yTicks = axes ? yAxisTicks(padding, innerHeight, effectiveDomainMax, formatTick) : [];
  const xTicks = axes ? xAxisTicks(data, points) : [];

  const lineSegments = lineSegmentsOf(points);
  // Comparison lines reuse the primary series' x positions, so the two are read
  // against one scale rather than two charts drawn side by side. A value the
  // series never measured stays a gap here exactly as it does above.
  const comparisonSegments = series.map((entry) =>
    lineSegmentsOf(
      points.map((point, index) => ({
        x: point.x,
        breakBefore: point.breakBefore,
        y:
          entry.values[index] === null || entry.values[index] === undefined
            ? null
            : padding +
              innerHeight *
                (1 - clampTo(entry.values[index], effectiveDomainMax) / effectiveDomainMax),
      })),
    ),
  );
  // Comparison lines carry no marks, so without naming them here a screen
  // reader is told about one series on a chart that draws several.
  const described = series.length
    ? `${chartDescription(data, label)} Compared with ${series
        .map((entry) => entry.label)
        .join(', ')}.`
    : chartDescription(data, label);
  // The axis layer is `aria-hidden`, so without this a screen-reader user gets
  // the shape and none of the scale -- strictly less than the sighted reader,
  // on the very chart the axes were added to make readable.
  const scaleNote = axes
    ? ` ${yAxisLabel ?? 'Value'} from ${formatTick(0)} to ${formatTick(effectiveDomainMax)}${
        xAxisLabel ? `, by ${xAxisLabel.toLowerCase()}` : ''
      }.`
    : '';
  const ariaLabel = `${described}${scaleNote}`;

  return (
    <svg
      role={data.some((entry) => entry.href) ? 'group' : 'img'}
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
    >
      <title>{ariaLabel}</title>
      {axes ? (
        <ChartAxes
          x={gutterLeft}
          y={padding}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          ticks={yTicks}
          xTicks={xTicks}
          xAxisLabel={xAxisLabel}
          yAxisLabel={yAxisLabel}
          height={height}
        />
      ) : null}
      {comparisonSegments.map((segments, seriesIndex) =>
        segments.map((segment, index) => (
          <path
            key={`series-${series[seriesIndex].label}-${index}`}
            d={toLinePath(segment)}
            fill="none"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(series[seriesIndex].strokeClass, 'opacity-70')}
            aria-hidden
          >
            <title>{series[seriesIndex].label}</title>
          </path>
        )),
      )}
      {lineSegments.map((segment, index) => (
        <path
          key={`line-${index}`}
          d={toLinePath(segment)}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-accent"
        />
      ))}
      {points.map((point, index) =>
        data[index].versionChange ? (
          <g key={`marker-${pointKeys[index]}`} data-version-marker="">
            <line
              x1={point.x}
              y1={padding}
              x2={point.x}
              y2={padding + innerHeight}
              strokeWidth={1}
              strokeDasharray="4 3"
              className="stroke-warning opacity-60"
              aria-hidden
            />
            <circle cx={point.x} cy={padding} r={3} className="fill-warning">
              <title>{`Version change at ${data[index].label}: ${data[index].versionChange?.note}`}</title>
            </circle>
          </g>
        ) : null,
      )}
      {points.map((point, index) =>
        point.y === null ? null : (
          <TrendPointMark
            key={`point-${pointKeys[index]}`}
            x={point.x}
            y={point.y}
            point={data[index]}
          />
        ),
      )}
    </svg>
  );
}
