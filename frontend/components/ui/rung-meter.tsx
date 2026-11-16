import { useId } from 'react';

import { MeterLabelRow } from '@/components/ui/meter';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const RUNGS = 10;

/**
 * RungMeter — ten rungs for usage against a limit or work in progress; a 0
 * to 100 score is a `ScoreRing`, never rungs. Rungs fill in `ink` on a `well` track, the label above them and the
 * value beside the label while both fit (else under it). Without `value` the
 * work is live: one ink rung pulses.
 *
 * `value: null` is unmeasured, never zero: empty rungs and "not measured".
 */
export function RungMeter({
  label,
  value,
  max = 100,
  valueLabel,
  headless = false,
  className,
}: Readonly<{
  /** The visible name of what is measured; omit only when a heading beside it says it. */
  label?: string;
  /** A Figure prints the label and value beside the meter: its row is kept for assistive technology only. */
  headless?: boolean;
  /** The measured value; null when not measured; omit while the work is live. */
  value?: number | null;
  max?: number;
  /** The shown and spoken value ("48 of 120 prompts"); defaults to a percentage. */
  valueLabel?: string;
  className?: string;
}>) {
  const labelId = useId();
  const reading = meterReading({ value, max, valueLabel });
  const named = Boolean(label) && !headless;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {headless ? null : <MeterHead label={label} labelId={labelId} shown={reading.shown} />}
      {/* The native bar carries the value to assistive technology (no value
          is live); the drawn rungs beside it are decoration. */}
      <progress
        className="sr-only"
        aria-labelledby={named ? labelId : undefined}
        aria-label={named ? undefined : (label ?? 'Progress')}
        max={max}
        value={reading.clamped}
        aria-valuetext={reading.shown ?? undefined}
        aria-busy={reading.live || undefined}
      />
      <span aria-hidden className="grid grid-cols-10 gap-0.5">
        {Array.from({ length: RUNGS }, (_, index) => (
          <span key={index} className={cn('rounded-mark h-2', rungFill(index, reading))} />
        ))}
      </span>
    </div>
  );
}

type MeterReading = Readonly<{
  live: boolean;
  filled: number;
  shown: string | null;
  clamped: number | undefined;
}>;

function meterReading({
  value,
  max,
  valueLabel,
}: Readonly<{
  value?: number | null;
  max: number;
  valueLabel?: string;
}>): MeterReading {
  const measured = typeof value === 'number';
  const ratio = measured && max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  let shown = valueLabel ?? null;
  if (shown === null && measured) shown = formatPercent(ratio);
  if (shown === null && value === null) shown = 'not measured';
  return {
    live: value === undefined,
    filled: Math.round(ratio * RUNGS),
    shown,
    clamped: measured ? Math.min(max, Math.max(0, value)) : undefined,
  };
}

/** Rungs fill in ink on the `well` track; live work is one ink rung pulsing, never the accent. */
function rungFill(index: number, { live, filled }: MeterReading) {
  if (live) return index === 0 ? 'bg-ink animate-live-rung' : 'bg-well';
  return index >= filled ? 'bg-well' : 'bg-ink';
}

function MeterHead({
  label,
  labelId,
  shown,
}: Readonly<{ label?: string; labelId: string; shown: string | null }>) {
  if (!label && !shown) return null;
  return (
    <MeterLabelRow>
      {label ? (
        // The name never breaks inside a word; the value wraps under it first.
        <span id={labelId} className="type-body">
          {label}
        </span>
      ) : null}
      {shown ? (
        <span className="type-body text-ink-2 whitespace-nowrap tabular-nums">{shown}</span>
      ) : null}
    </MeterLabelRow>
  );
}

/**
 * BusyRung — a background refresh over content that stays visible: the live
 * rung on the region's top edge, positioned so appearing and disappearing
 * never moves the content.
 */
export function BusyRung({ active, label }: Readonly<{ active: boolean; label: string }>) {
  if (!active) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-1 h-0.5">
      <progress className="sr-only" aria-label={label} aria-busy />
      <span aria-hidden className="bg-ink animate-live-rung block h-full w-6" />
    </div>
  );
}
