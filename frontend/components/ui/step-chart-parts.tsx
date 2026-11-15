import type { TrendScale } from '@/components/ui/trend-geometry';
import { cn } from '@/lib/utils';

/**
 * Series ink by role (brand direction 2.5): you are the accent, rivals one to
 * four take ink and the cool hues in rank order, and a merged remainder is
 * `data-other`. The accent is never a rival's colour.
 */
export type SeriesTone = 'you' | 'rival-1' | 'rival-2' | 'rival-3' | 'rival-4' | 'other';

export const SERIES_STROKE: Record<SeriesTone, string> = {
  you: 'stroke-data-you',
  'rival-1': 'stroke-data-rival-1',
  'rival-2': 'stroke-data-rival-2',
  'rival-3': 'stroke-data-rival-3',
  'rival-4': 'stroke-data-rival-4',
  other: 'stroke-data-other',
};

export const SERIES_FILL: Record<SeriesTone, string> = {
  you: 'fill-data-you bg-data-you',
  'rival-1': 'fill-data-rival-1 bg-data-rival-1',
  'rival-2': 'fill-data-rival-2 bg-data-rival-2',
  'rival-3': 'fill-data-rival-3 bg-data-rival-3',
  'rival-4': 'fill-data-rival-4 bg-data-rival-4',
  other: 'fill-data-other bg-data-other',
};

/** A series' name in text: its own hue where that hue holds 4.5:1, else ink. */
const SERIES_TEXT: Record<SeriesTone, string> = {
  you: 'fill-accent-text',
  'rival-1': 'fill-ink',
  'rival-2': 'fill-data-rival-2',
  'rival-3': 'fill-data-rival-3',
  'rival-4': 'fill-data-rival-4',
  other: 'fill-ink-2',
};

const RIVALS = ['rival-1', 'rival-2', 'rival-3', 'rival-4'] as const;

/** The tone of the line at `index`: the first is you unless the chart has no "you". */
export function seriesTone(
  line: Readonly<{ other?: boolean }>,
  index: number,
  firstIsYou: boolean,
): SeriesTone {
  if (line.other) return 'other';
  if (firstIsYou) return index === 0 ? 'you' : (RIVALS[index - 1] ?? 'rival-4');
  return RIVALS[index] ?? 'rival-4';
}

/** Axis and label text inside a chart's SVG: mono `data-sm` in `ink-2`. */
export const AXIS_TEXT = 'fill-ink-2 type-data-sm';

/** The vertical room one end label needs, so two labels never overprint. */
const END_LABEL_GAP = 16;
/** A `data-sm` mono glyph's advance. */
export const LABEL_CHAR_WIDTH = 7.3;

export type EndLabel = Readonly<{
  key: string;
  text: string;
  tone: SeriesTone;
  x: number;
  y: number;
}>;

/**
 * Each line's label at the right end of the plot, at its latest value. When
 * two would sit closer than one line of text the chart shows a key instead,
 * so null means "use the key".
 */
export function placeEndLabels(
  ends: readonly Omit<EndLabel, 'x'>[],
  right: number,
): EndLabel[] | null {
  const sorted = [...ends].sort((a, b) => a.y - b.y);
  for (let index = 1; index < sorted.length; index += 1) {
    const above = sorted[index - 1];
    const below = sorted[index];
    if (above && below && below.y - above.y < END_LABEL_GAP) return null;
  }
  return sorted.map((end) => ({ ...end, x: right + 8 }));
}

export function EndLabels({ labels }: Readonly<{ labels: readonly EndLabel[] }>) {
  return (
    <g data-end-labels="">
      {labels.map((label) => (
        <text
          key={label.key}
          x={label.x}
          y={label.y}
          dominantBaseline="middle"
          className={cn('type-data-sm', SERIES_TEXT[label.tone])}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}

/** A run of missing periods, as the x span it covers. */
export type GapBand = Readonly<{ from: number; to: number }>;

/**
 * The missing periods of the primary series, each run as one band reaching
 * halfway to its measured neighbours. Nothing is interpolated across it.
 */
export function gapBands(values: readonly (number | null)[], scale: TrendScale): GapBand[] {
  const bands: GapBand[] = [];
  let start: number | null = null;
  const edge = (index: number, side: -1 | 1) => {
    const here = scale.x(index);
    const next = values[index + side] === undefined ? null : scale.x(index + side);
    return next === null ? here + side * 12 : (here + next) / 2;
  };
  values.forEach((value, index) => {
    if (value === null && start === null) start = index;
    if (value !== null && start !== null) {
      bands.push({ from: edge(start, -1), to: edge(index - 1, 1) });
      start = null;
    }
  });
  if (start !== null) bands.push({ from: edge(start, -1), to: edge(values.length - 1, 1) });
  return bands;
}

/** The hatch of an absent period: `control-line` lines at 45° on `well` (law 1), held at 3:1. */
export function HatchPattern({ id }: Readonly<{ id: string }>) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} className="fill-well" />
      <line x1={0} y1={0} x2={0} y2={6} strokeWidth={1} className="stroke-control-line" />
    </pattern>
  );
}

export function GapBands({
  bands,
  top,
  bottom,
  hatch,
  word,
}: Readonly<{
  bands: readonly GapBand[];
  top: number;
  bottom: number;
  hatch: string;
  word: string;
}>) {
  return (
    <g data-gap-bands="">
      {bands.map((band) => {
        const width = Math.max(4, band.to - band.from);
        return (
          <g key={band.from}>
            <rect
              x={band.from}
              y={top}
              width={width}
              height={bottom - top}
              fill={`url(#${hatch})`}
            />
            {width >= word.length * LABEL_CHAR_WIDTH + 16 ? (
              <text
                x={band.from + width / 2}
                y={top + 14}
                textAnchor="middle"
                paintOrder="stroke"
                strokeWidth={4}
                className={cn(AXIS_TEXT, 'stroke-well')}
              >
                {word}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** An event: a solid ink tick on the time axis with its flag and, when room allows, its label. */
export function EventTicks({
  events,
  bottom,
  labelled,
}: Readonly<{
  events: readonly Readonly<{ key: string; label: string; x: number }>[];
  bottom: number;
  labelled: boolean;
}>) {
  return (
    <g data-event-ticks="">
      {events.map((event) => (
        <g key={event.key} data-event-marker="">
          <line
            x1={event.x}
            x2={event.x}
            y1={bottom - 16}
            y2={bottom}
            strokeWidth={1.5}
            className="stroke-ink"
          />
          <rect x={event.x} y={bottom - 16} width={8} height={5} className="fill-ink" />
          {labelled ? (
            <text
              x={event.x + 12}
              y={bottom - 12}
              dominantBaseline="middle"
              className="fill-ink type-data-sm"
            >
              {event.label.length > 28 ? `${event.label.slice(0, 27)}…` : event.label}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}

/**
 * A stepped path through the points: each measurement holds until the next,
 * so the line moves in steps, never on a curve. A null lifts the pen.
 */
export function stepPath(points: readonly (readonly [number, number] | null)[]): string {
  let path = '';
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    const [x, y] = point;
    path += pen ? `H${x.toFixed(1)}V${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return path;
}

/**
 * A series' marker shape. Square for every line while end labels name them;
 * once a key replaces the labels each line takes its own shape, so no series
 * is told apart by colour alone (brand direction 3.3).
 */
export const MARKER_SHAPES = ['square', 'diamond', 'triangle', 'circle'] as const;
export type MarkerShape = (typeof MARKER_SHAPES)[number];

/** One marker centred on (x, y), about 5px across. */
export function MarkerMark({
  x,
  y,
  shape,
  className,
}: Readonly<{ x: number; y: number; shape: MarkerShape; className: string }>) {
  switch (shape) {
    case 'square':
      return (
        <rect
          x={x - 2.5}
          y={y - 2.5}
          width={5}
          height={5}
          strokeWidth={1.5}
          className={className}
        />
      );
    case 'diamond':
      return (
        <path
          d={`M${x} ${y - 3.5}L${x + 3.5} ${y}L${x} ${y + 3.5}L${x - 3.5} ${y}Z`}
          strokeWidth={1.5}
          className={className}
        />
      );
    case 'triangle':
      return (
        <path
          d={`M${x} ${y - 3.5}L${x + 3.5} ${y + 3}L${x - 3.5} ${y + 3}Z`}
          strokeWidth={1.5}
          className={className}
        />
      );
    case 'circle':
      return <circle cx={x} cy={y} r={3} strokeWidth={1.5} className={className} />;
    default: {
      const unknown: never = shape;
      return unknown;
    }
  }
}

/** A line's markers, filled for you and hollow for everyone else. */
export function Markers({
  points,
  tone,
  shape = 'square',
}: Readonly<{
  points: readonly (readonly [number, number] | null)[];
  tone: SeriesTone;
  shape?: MarkerShape;
}>) {
  const className = cn(SERIES_STROKE[tone], tone === 'you' ? SERIES_FILL[tone] : 'fill-ground');
  return points.map((point, index) =>
    point ? (
      // A marker's position is its identity on the line.
      <g key={`${index}-${point[0]}`} data-marker-shape={shape}>
        <MarkerMark x={point[0]} y={point[1]} shape={shape} className={className} />
      </g>
    ) : null,
  );
}
