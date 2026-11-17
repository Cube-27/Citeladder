import { useContext } from 'react';

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
}>;

/** The ring on a 100-unit box: its radius and width, and the gap between segments. */
const RADIUS = 40;
const RING = 16;
const GAP = 0.8;

type Row = Readonly<{
  label: string;
  value: number;
  tone: SeriesTone | null;
  share: number;
}>;

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
    return { label: part.label, value: part.value, tone, share: whole ? part.value / whole : 0 };
  });
  if (remainder > 0)
    rows.push({ label: remainderLabel, value: remainder, tone: null, share: remainder / whole });
  const described = rows
    .map((row) => `${row.label} ${chartPercent(row.value, whole)} (${format(row.value)})`)
    .join(', ');
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-4">
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ring and its total are one generated image; <img> cannot hold them
        role="img" // NOSONAR -- the ring and its total are one generated image
        aria-label={described ? `${label}: ${described}` : label}
        className="relative size-36 shrink-0"
      >
        <svg aria-hidden viewBox="0 0 100 100" className="block size-full -rotate-90">
          <DonutSegments rows={rows} />
        </svg>
        {totalLabel ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={textRole('figure')}>{format(whole)}</span>
            <span className={textRole('caption')}>{totalLabel}</span>
          </span>
        ) : null}
      </div>
      <ul aria-hidden className="flex min-w-0 flex-1 basis-40 flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className={textRole('body', 'flex min-w-0 items-center gap-2')}>
            <span
              className={cn(
                'rounded-mark size-2 shrink-0',
                row.tone ? SERIES_FILL[row.tone] : 'bg-well',
              )}
            />
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

/** The ring's segments; a zero is left out, and an empty whole is one `well` ring. */
function DonutSegments({ rows }: Readonly<{ rows: readonly Row[] }>) {
  const drawn = rows.filter((row) => row.share > 0);
  const ring = { cx: 50, cy: 50, r: RADIUS, fill: 'none', strokeWidth: RING, pathLength: 100 };
  if (!drawn.length) return <circle {...ring} className="stroke-well" />;
  const gap = drawn.length > 1 ? GAP : 0;
  return drawn.map((row, index) => {
    const length = Math.max(row.share * 100 - gap, 0.5);
    const offset = drawn.slice(0, index).reduce((sum, before) => sum + before.share * 100, 0);
    return (
      <circle
        key={row.label}
        {...ring}
        data-part={row.tone ?? 'remainder'}
        strokeDasharray={`${length} ${100 - length}`}
        strokeDashoffset={-offset}
        className={row.tone ? SERIES_STROKE[row.tone] : 'stroke-well'}
      />
    );
  });
}
