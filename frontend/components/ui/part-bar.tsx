import { chartPercent, formatChartCount } from '@/components/ui/chart';
import { SERIES_FILL, seriesTone, type SeriesTone } from '@/components/ui/step-chart-parts';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export type Part = Readonly<{
  label: string;
  value: number;
  /** Your own share: the accent. At most one part is you. */
  you?: boolean;
  /** The merged remainder: hatched, so it never reads as another part. */
  other?: boolean;
  /**
   * A part that is a status (an issue severity), not a brand: it takes the
   * hue of that status's mark, and its direct label carries the word.
   */
  status?: keyof typeof STATUS_FILL;
}>;

/** A status part's fill: the hue its StatusMark carries, never the accent or a rival's. */
const STATUS_FILL = {
  negative: 'bg-negative',
  warning: 'bg-warning',
  info: 'bg-info',
} as const;

/** A share this wide or more is labelled under its own segment. */
const DIRECT_LABEL_SHARE = 0.18;

/**
 * PartBar — part to whole as one stacked bar with direct labels (brand
 * direction 3.3: no donuts, rings or pies). Square-ended segments start at
 * zero, divided by 2px gaps; you take the accent, the rest take ink and the
 * cool hues in order, and the merged remainder is hatched. A wide segment
 * names its share right under itself; narrow ones are named in a row after.
 * One image to assistive technology, named with every share and count.
 *
 * When `total` exceeds the parts, the rest belongs to no part: it stays an
 * unfilled `rule` track listed as `remainderLabel`, so the parts are never
 * stretched to a whole they do not cover.
 */
export function PartBar({
  parts,
  total,
  totalLabel,
  remainderLabel = 'Unclassified',
  format = formatChartCount,
  label,
  className,
}: Readonly<{
  /** At most four parts; your own first when there is one. */
  parts: readonly Part[];
  /** The whole the shares are of; defaults to the parts' sum. */
  total?: number;
  /** What the whole counts ("Citations"), printed beside it. */
  totalLabel?: string;
  remainderLabel?: string;
  format?: (value: number) => string;
  /** What the bar breaks down, e.g. "Source types". */
  label: string;
  className?: string;
}>) {
  const shown = parts.slice(0, 4);
  const sum = shown.reduce((carry, part) => carry + part.value, 0);
  const whole = Math.max(total ?? sum, sum);
  const remainder = whole - sum;
  const hasYou = shown.some((part) => part.you);
  const entries = shown.map((part, index) => {
    // Rivals take their hues in order, after you and never counting the remainder.
    const rank = shown.slice(0, index).filter((before) => !before.you && !before.other).length;
    const slot = hasYou ? rank + 1 : rank;
    const tone: SeriesTone = part.you ? 'you' : seriesTone(part, slot, hasYou);
    let fill: string = tone === 'other' ? 'hatch' : SERIES_FILL[tone];
    if (part.status) fill = STATUS_FILL[part.status];
    return { ...part, tone, fill, share: whole ? part.value / whole : 0 };
  });
  const rows = [
    ...entries,
    ...(remainder > 0
      ? [
          {
            label: remainderLabel,
            value: remainder,
            tone: null,
            fill: 'bg-rule',
            share: remainder / whole,
          },
        ]
      : []),
  ];
  const described = rows
    .map((row) => `${row.label} ${chartPercent(row.value, whole)} (${format(row.value)})`)
    .join(', ');
  const direct = new Set(rows.filter((row) => row.share >= DIRECT_LABEL_SHARE));
  const listed = rows.filter((row) => row.share < DIRECT_LABEL_SHARE);
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {totalLabel ? (
        <p className={textRole('caption')}>
          <span className="type-data text-ink">{format(whole)}</span> {totalLabel}
        </p>
      ) : null}
      <div // NOSONAR -- the segments are one picture of a whole; <img> cannot hold them
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the segments are one picture of a whole
        role="img"
        aria-label={described ? `${label}: ${described}` : label}
        className="flex h-4 gap-0.5 overflow-hidden"
      >
        {rows.map((row) =>
          // A zero is left out of the bar, never drawn as a sliver.
          row.value > 0 ? (
            <span
              key={row.label}
              data-part={row.tone ?? 'remainder'}
              className={cn('rounded-mark block h-full min-w-0.5 basis-0', row.fill)}
              style={{ flexGrow: row.value }}
            />
          ) : null,
        )}
        {whole === 0 ? <span className="bg-rule block h-full grow" /> : null}
      </div>
      <div aria-hidden className="flex min-w-0 gap-0.5">
        {rows.map((row) =>
          row.value > 0 ? (
            <span key={row.label} className="min-w-0 basis-0" style={{ flexGrow: row.value }}>
              {direct.has(row) ? (
                <PartLabel
                  label={row.label}
                  share={chartPercent(row.value, whole)}
                  value={format(row.value)}
                />
              ) : null}
            </span>
          ) : null,
        )}
      </div>
      {listed.length ? (
        <ul aria-hidden className="flex flex-wrap gap-x-6 gap-y-1">
          {listed.map((row) => (
            <li key={row.label}>
              <PartLabel
                label={row.label}
                share={chartPercent(row.value, whole)}
                value={format(row.value)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PartLabel({
  label,
  share,
  value,
}: Readonly<{ label: string; share: string; value: string }>) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className={textRole('caption', 'truncate')} title={label}>
        {label}
      </span>
      <span className="type-data-sm text-ink whitespace-nowrap">
        {share} <span className="text-ink-2">{value}</span>
      </span>
    </span>
  );
}
