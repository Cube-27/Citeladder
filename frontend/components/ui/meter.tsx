import type { ReactNode } from 'react';
import { useId } from 'react';

import { Absence } from '@/components/ui/absence';
import { availabilityLabel, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Meter — a labelled value against a maximum on a thin bar: plan usage,
 * credits, a brand's share of answers. The label (14/20 `ink`) sits left and
 * the value (14/20 `ink-2`, tabular) beside it while both fit, else under it,
 * over a 6px `well` track, out of 100.
 *
 * `tone` is `ink` by default; `accent` only for your own brand's share;
 * `warning` from about 90% of a limit and `negative` when a limit is hit.
 * A score out of 100 is a printed figure; work in progress is a `RungMeter`.
 *
 * `value: null` is an unmeasured value, never zero: an empty track, no
 * `aria-valuenow`, the Absence mark as its value and "Not measured" spoken.
 */
export type MeterTone = 'ink' | 'accent' | 'warning' | 'negative';

const METER_FILL = {
  ink: 'bg-ink',
  accent: 'bg-data-you',
  warning: 'bg-warning',
  negative: 'bg-negative',
} as const satisfies Record<MeterTone, string>;

/** A fill eases to its new width (300ms) and its tone (200ms). */
const FILL_MOTION =
  'block h-full [transition:width_var(--motion-slide)_var(--ease-standard),background-color_var(--motion-open)_var(--ease-standard)]';

function percentOf(value: number | null, max: number) {
  if (value === null || max <= 0) return null;
  return (Math.min(max, Math.max(0, value)) / max) * 100;
}

/** The 6px track and its fill, labelled by the caller. */
function MeterTrack({
  value,
  max,
  fill,
  labelledBy,
  label,
  valueText,
}: Readonly<{
  value: number | null;
  max: number;
  fill: string;
  labelledBy?: string;
  label?: string;
  valueText: string;
}>) {
  const percent = percentOf(value, max);
  return (
    <div // NOSONAR -- a native <meter> cannot draw the token fill or the unmeasured state
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <meter> cannot draw the token fill or the unmeasured state.
      role="meter"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value === null ? undefined : Math.min(max, Math.max(0, value))}
      aria-valuetext={valueText}
      className="bg-well [[data-public-surface]_&]:bg-rule rounded-mark block h-1.5 w-full overflow-hidden"
    >
      {percent === null ? null : (
        <span className={cn(FILL_MOTION, fill)} style={{ width: `${percent}%` }} />
      )}
    </div>
  );
}

/**
 * The label and the value over the track. The label never shrinks below its
 * longest word (its min-content width); the value sits beside it while both
 * fit and wraps under it when they do not. The website keeps one row.
 */
export function MeterLabelRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 [[data-public-surface]_&]:flex-nowrap">
      {children}
    </div>
  );
}

const METER_MAX = 100;

export function Meter({
  label,
  value,
  valueLabel,
  tone = 'ink',
}: Readonly<{
  label: string;
  /** The measured value, or null when it was not measured. */
  value: number | null;
  /** The shown and spoken value, e.g. "42%"; defaults to "N / 100". */
  valueLabel?: string;
  tone?: MeterTone;
}>) {
  const labelId = useId();
  const shown =
    valueLabel ?? (value === null ? availabilityLabel('not_measured') : `${value} / ${METER_MAX}`);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <MeterLabelRow>
        <span
          id={labelId}
          className="text-body-sm text-ink [[data-public-surface]_&]:min-w-0 [[data-public-surface]_&]:break-words"
        >
          {label}
        </span>
        <span className="text-body-sm text-ink-2 whitespace-nowrap tabular-nums">
          {valueLabel === undefined && value === null ? <Absence state="not_measured" /> : shown}
        </span>
      </MeterLabelRow>
      <MeterTrack
        value={value}
        max={METER_MAX}
        fill={METER_FILL[tone]}
        labelledBy={labelId}
        valueText={shown}
      />
    </div>
  );
}

/**
 * A quota's use in a table cell: a 120px bar, 8 tall, radius 4, the tone's
 * fill on a `well` track, no label of its own (the row names it). The fill
 * clamps at full; `valueText` says the real figures.
 */
export function CellMeter({
  label,
  value,
  max,
  valueText,
  tone,
}: Readonly<{ label: string; value: number; max: number; valueText: string; tone: MeterTone }>) {
  const shown = Math.min(max, Math.max(0, value));
  // A zero allowance with any use is at its limit: a full bar.
  const percent = max > 0 ? (shown / max) * 100 : 100;
  return (
    <div // NOSONAR -- a native <meter> cannot draw the token fill
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <meter> cannot draw the token fill.
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      data-meter-tone={tone}
      className="bg-well rounded-mark block h-2 w-30 overflow-hidden"
    >
      <span className={cn(FILL_MOTION, METER_FILL[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

const ROW_FILL = { neutral: 'bg-control-line', accent: 'bg-data-you' } as const;

/**
 * One row of a distribution: the bucket's name, its track and its figure, in
 * three columns every row of the list shares, so the tracks start and end on
 * one line. The fill is neutral, or the accent for your own brand.
 */
export function MeterRow({
  name,
  figure,
  value,
  max = 100,
  label,
  tone,
}: Readonly<{
  name: ReactNode;
  figure: ReactNode;
  value: number | null;
  max?: number;
  /** The accessible name of the track, e.g. "Depth 2 share of pages". */
  label: string;
  tone: keyof typeof ROW_FILL;
}>) {
  const percent = percentOf(value, max);
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-caption text-ink-2">{name}</span>
      <MeterTrack
        value={value}
        max={max}
        fill={ROW_FILL[tone]}
        label={label}
        valueText={
          percent === null ? availabilityLabel('not_measured') : formatPercent(percent / 100)
        }
      />
      <span className="text-body-sm text-ink text-right tabular-nums">{figure}</span>
    </div>
  );
}
