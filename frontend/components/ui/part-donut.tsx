import { useContext, type ReactNode } from 'react';

import { chartPercent } from '@/components/ui/chart';
import {
  SERIES_FILL,
  SERIES_STROKE,
  SeriesTonesContext,
  seriesTone,
  type SeriesTone,
} from '@/components/ui/step-chart-parts';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Part = Readonly<{
  label: string;
  value: number;
  /** Your own share: the accent. At most one part is you. */
  you?: boolean;
  /** The merged remainder: `data-other`, so it never reads as another brand. */
  other?: boolean;
  /** Who the part is (a rival's domain), for its page-wide colour; defaults to `label`. */
  identity?: string;
  /** A status reading (sentiment) instead of an identity: its status colour, never a series hue. */
  status?: PartStatus;
}>;

type PartStatus = 'positive' | 'neutral' | 'negative' | 'warning';

const STATUS_INK: Record<PartStatus, { stroke: string; fill: string }> = {
  positive: { stroke: 'stroke-positive', fill: 'bg-positive' },
  neutral: { stroke: 'stroke-data-other', fill: 'bg-data-other' },
  negative: { stroke: 'stroke-negative', fill: 'bg-negative' },
  warning: { stroke: 'stroke-warning', fill: 'bg-warning' },
};

/** The ring on a 100-unit box: its radius and width, and the gap between segments. */
const RADIUS = 40;
const RING = 16;
const GAP = 0.8;
/** The remainder's ink as an SVG attribute: one rule fewer in the eager CSS. */
const WELL = 'var(--color-well)';

type Row = Readonly<{
  label: string;
  value: number;
  /** Its `data-part` name and stroke and swatch classes; null inks it `well`. */
  ink: { part: string; stroke: string; fill: string } | null;
  share: number;
}>;

function partInk(status: PartStatus | undefined, tone: SeriesTone): NonNullable<Row['ink']> {
  if (status) return { part: status, ...STATUS_INK[status] };
  return { part: tone, stroke: SERIES_STROKE[tone], fill: SERIES_FILL[tone] };
}

/**
 * PartDonut — part to whole as a donut with its legend (swatch, name, share
 * and count), the whole counted in its hole. Segments run clockwise from the
 * top, divided by thin gaps; you take the accent, rivals their page-wide
 * identity colours (`SeriesTonesContext`, else in order), and the merged
 * remainder `data-other`. One image to assistive technology, named with every
 * share and count.
 *
 * When `total` exceeds the parts, the rest belongs to no part: it stays a
 * `well` segment listed as `remainderLabel`, so the parts are never stretched
 * to a whole they do not cover.
 */
export function PartDonut({
  parts,
  total,
  totalLabel,
  remainderLabel = 'Unclassified',
  format = formatCount,
  label,
}: Readonly<{
  /** At most four parts; your own first when there is one. */
  parts: readonly Part[];
  /** The whole the shares are of; defaults to the parts' sum. */
  total?: number;
  /** What the whole counts ("citations"), printed under it in the hole. */
  totalLabel?: string;
  remainderLabel?: string;
  format?: (value: number) => string;
  /** What the donut breaks down, e.g. "Source types". */
  label: string;
}>) {
  const shown = parts.slice(0, 4);
  const sum = shown.reduce((carry, part) => carry + part.value, 0);
  const whole = Math.max(total ?? sum, sum);
  const remainder = whole - sum;
  const hasYou = shown.some((part) => part.you);
  const known = useContext(SeriesTonesContext);
  const rows: Row[] = shown.map((part, index) => {
    // Rivals take their hues in order, after you and never counting the remainder.
    const rank = shown.slice(0, index).filter((before) => !before.you && !before.other).length;
    const placed = seriesTone(part, hasYou ? rank + 1 : rank, hasYou);
    let tone: SeriesTone = part.you ? 'you' : placed;
    if (!part.you && !part.other) tone = known?.get(part.identity ?? part.label) ?? placed;
    const ink = partInk(part.status, tone);
    return { label: part.label, value: part.value, ink, share: whole ? part.value / whole : 0 };
  });
  if (remainder > 0)
    rows.push({ label: remainderLabel, value: remainder, ink: null, share: remainder / whole });
  const described = [
    ...(totalLabel ? [`${format(whole)} ${totalLabel}`] : []),
    ...rows.map((row) => `${row.label} ${chartPercent(row.value, whole)} (${format(row.value)})`),
  ].join(', ');
  return (
    // The legend's floor keeps its names whole: a card too narrow for it puts the legend under the ring.
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ring and its total are one generated image; <img> cannot hold them
        role="img" // NOSONAR -- the ring and its total are one generated image
        aria-label={described ? `${label}: ${described}` : label}
        className="relative w-36 shrink-0"
      >
        <DonutRing
          segments={rows.map((row) => ({
            key: row.label,
            share: row.share,
            stroke: row.ink?.stroke ?? null,
            part: row.ink?.part ?? 'remainder',
          }))}
        />
        {totalLabel ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={textRole('figure')}>{format(whole)}</span>
            <span className={textRole('caption')}>{totalLabel}</span>
          </span>
        ) : null}
      </div>
      <ul aria-hidden className="flex min-w-44 flex-1 flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className={textRole('body', 'flex min-w-0 items-center gap-2')}>
            <span className={cn('rounded-mark size-2 shrink-0', row.ink?.fill ?? 'bg-well')} />
            <span className="text-ink min-w-0 flex-1 truncate" title={row.label}>
              {row.label}
            </span>
            <span className="text-ink shrink-0 tabular-nums">{chartPercent(row.value, whole)}</span>
            <span className="text-ink-2 w-10 shrink-0 text-right tabular-nums">
              {format(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type CountPart = Readonly<{
  key: string;
  /** Its name in the legend, e.g. a StatusMark. */
  term: ReactNode;
  value: number;
  /** A `stroke-*` class for its segment. */
  stroke: string;
}>;

/**
 * CountDonut — a few named counts, one per row, with their ring on the right.
 * The legend carries every figure, so the ring is decorative.
 */
export function CountDonut({
  parts,
  label,
}: Readonly<{ parts: readonly CountPart[]; /** Names the legend. */ label: string }>) {
  const whole = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className="flex min-w-0 items-center gap-x-6">
      <dl // NOSONAR -- a <fieldset> would add form-group semantics to a list of counts
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- as above
        role="group"
        aria-label={label}
        className="grid gap-2"
      >
        {parts.map((part) => (
          <div key={part.key} className="flex items-center justify-between gap-4">
            <dt>{part.term}</dt>
            <dd className={textRole('heading', 'tabular-nums')}>{formatCount(part.value)}</dd>
          </div>
        ))}
      </dl>
      <div className="w-24 shrink-0">
        <DonutRing
          segments={parts.map((part) => ({
            key: part.key,
            share: whole ? part.value / whole : 0,
            stroke: part.stroke,
            part: part.key,
          }))}
        />
      </div>
    </div>
  );
}

type DonutSegment = Readonly<{
  key: string;
  /** Its share of the whole, 0 to 1. */
  share: number;
  /** A `stroke-*` class; null inks the segment `well`. */
  stroke: string | null;
  /** Its `data-part`, which names the segment to tests and styles. */
  part: string;
}>;

/**
 * DonutRing — the bare ring, clockwise from the top in thin-gapped segments,
 * filling its container's width; decorative, so its caller names it. A zero
 * is left out, and an empty whole is one `well` ring.
 */
function DonutRing({ segments }: Readonly<{ segments: readonly DonutSegment[] }>) {
  const drawn = segments.filter((segment) => segment.share > 0);
  const ring = { cx: 50, cy: 50, r: RADIUS, fill: 'none', strokeWidth: RING, pathLength: 100 };
  const gap = drawn.length > 1 ? GAP : 0;
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="block w-full -rotate-90">
      {drawn.length ? (
        drawn.map((segment, index) => {
          const length = Math.max(segment.share * 100 - gap, 0.5);
          const offset = drawn.slice(0, index).reduce((sum, before) => sum + before.share * 100, 0);
          return (
            <circle
              key={segment.key}
              {...ring}
              data-part={segment.part}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-offset}
              stroke={segment.stroke ? undefined : WELL}
              className={segment.stroke ?? undefined}
            />
          );
        })
      ) : (
        <circle {...ring} stroke={WELL} />
      )}
    </svg>
  );
}
