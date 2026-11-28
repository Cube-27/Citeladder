import { createContext, useContext } from 'react';

import { CHART_MARKER, SERIES_WEIGHT } from '@/components/ui/chart-geometry';
import { cn } from '@/lib/utils';

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

const RIVALS = ['rival-1', 'rival-2', 'rival-3', 'rival-4'] as const;

export const SeriesTonesContext = createContext<ReadonlyMap<string, SeriesTone> | null>(null);

export function seriesTones(identities: readonly string[]): ReadonlyMap<string, SeriesTone> {
  return new Map(identities.map((identity, index) => [identity, RIVALS[index] ?? 'other']));
}

export function seriesTone(
  line: Readonly<{ other?: boolean }>,
  index: number,
  firstIsYou: boolean,
): SeriesTone {
  if (line.other) return 'other';
  if (firstIsYou) return index === 0 ? 'you' : (RIVALS[index - 1] ?? 'rival-4');
  return RIVALS[index] ?? 'rival-4';
}

export function useSeriesTones(
  lines: readonly Readonly<{ identity: string; other?: boolean }>[],
  firstIsYou: boolean,
): SeriesTone[] {
  const known = useContext(SeriesTonesContext);
  return lines.map((line, index) => {
    if (line.other || (firstIsYou && index === 0)) return seriesTone(line, index, firstIsYou);
    return known?.get(line.identity) ?? seriesTone(line, index, firstIsYou);
  });
}

export type EventKind = 'panel' | 'model' | 'action';

const EVENT_FILL: Record<EventKind, string> = {
  panel: 'fill-ink-2',
  model: 'fill-warning',
  action: 'fill-positive',
};

type LegendEvent = Readonly<{ key: string; label: string; kind?: EventKind }>;

const diamond = (x: number, y: number, r: number) =>
  `M${x} ${y - r}l${r} ${r}-${r} ${r}-${r}-${r}z`;

export function EventLegend({
  events,
  shown,
}: Readonly<{ events: readonly LegendEvent[]; shown: boolean }>) {
  if (!shown || !events.length) return null;
  return (
    <ul aria-hidden className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
      {events.map((event) => (
        <li
          key={event.key}
          className="text-caption text-ink-2 inline-flex min-w-0 items-center gap-2"
        >
          <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0">
            <path d={diamond(5, 5, 5)} className={EVENT_FILL[event.kind ?? 'action']} />
          </svg>
          <span className="min-w-0">{event.label}</span>
        </li>
      ))}
    </ul>
  );
}

export const MARKER_SHAPES = ['circle', 'square', 'diamond', 'triangle'] as const;
export type MarkerShape = (typeof MARKER_SHAPES)[number];

export function MarkerMark({
  x,
  y,
  shape,
  tone,
}: Readonly<{ x: number; y: number; shape: MarkerShape; tone: SeriesTone }>) {
  const className = cn(SERIES_STROKE[tone], tone === 'you' ? SERIES_FILL[tone] : 'fill-panel');
  switch (shape) {
    case 'square':
      return (
        <rect
          x={x - 2.5}
          y={y - 2.5}
          width={5}
          height={5}
          strokeWidth={SERIES_WEIGHT.series}
          className={className}
        />
      );
    case 'diamond':
      return (
        <path
          d={`M${x} ${y - 3.5}L${x + 3.5} ${y}L${x} ${y + 3.5}L${x - 3.5} ${y}Z`}
          strokeWidth={SERIES_WEIGHT.series}
          className={className}
        />
      );
    case 'triangle':
      return (
        <path
          d={`M${x} ${y - 3.5}L${x + 3.5} ${y + 3}L${x - 3.5} ${y + 3}Z`}
          strokeWidth={SERIES_WEIGHT.series}
          className={className}
        />
      );
    case 'circle':
      return (
        <circle
          cx={x}
          cy={y}
          r={CHART_MARKER.marker}
          strokeWidth={SERIES_WEIGHT.series}
          className={className}
        />
      );
    default: {
      const unknown: never = shape;
      return unknown;
    }
  }
}
