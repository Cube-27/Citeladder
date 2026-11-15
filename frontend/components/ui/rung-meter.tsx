import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

const RUNGS = 10;

/**
 * RungMeter — ten rungs for any 0 to 100 score, a usage quota or work in
 * progress (brand direction 3.1, law 3: no rings, donuts or generic progress
 * bars). Rungs fill in `ink`, one at a time (a `steps()` fill), with the
 * value beside them in mono. Past `warnAt` (a ratio of `max`) the filled
 * rungs take the warning tone and its glyph. Without `value` the work is
 * live: one accent rung pulses.
 *
 * `value: null` is unmeasured, never zero: empty rungs and "not measured".
 */
export function RungMeter({
  label,
  value,
  max = 100,
  valueLabel,
  warnAt,
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
  /** The ratio of `max` from which the meter warns (a quota near its limit). */
  warnAt?: number;
  className?: string;
}>) {
  const labelId = useId();
  const reading = meterReading({ value, max, valueLabel, warnAt });
  const named = Boolean(label) && !headless;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {headless ? null : (
        <MeterHead
          label={label}
          labelId={labelId}
          shown={reading.shown}
          warning={reading.warning}
        />
      )}
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
  warning: boolean;
  shown: string | null;
  clamped: number | undefined;
}>;

function meterReading({
  value,
  max,
  valueLabel,
  warnAt,
}: Readonly<{
  value?: number | null;
  max: number;
  valueLabel?: string;
  warnAt?: number;
}>): MeterReading {
  const measured = typeof value === 'number';
  const ratio = measured && max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  let shown = valueLabel ?? null;
  if (shown === null && measured) shown = `${Math.round(ratio * 100)}%`;
  if (shown === null && value === null) shown = 'not measured';
  return {
    live: value === undefined,
    filled: Math.round(ratio * RUNGS),
    warning: warnAt !== undefined && measured && ratio >= warnAt,
    shown,
    clamped: measured ? Math.min(max, Math.max(0, value)) : undefined,
  };
}

function rungFill(index: number, { live, filled, warning }: MeterReading) {
  if (live) return index === 0 ? 'bg-accent animate-live-rung' : 'bg-rule';
  if (index >= filled) return 'bg-rule';
  return warning ? 'bg-warning' : 'bg-ink';
}

function MeterHead({
  label,
  labelId,
  shown,
  warning,
}: Readonly<{ label?: string; labelId: string; shown: string | null; warning: boolean }>) {
  if (!label && !shown) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      {label ? (
        <span id={labelId} className="type-body truncate">
          {label}
        </span>
      ) : null}
      {shown ? (
        <span
          className={cn(
            'type-data inline-flex items-center gap-1 whitespace-nowrap',
            warning ? 'text-warning' : 'text-ink-2',
          )}
        >
          {warning ? <Icon icon={TriangleAlert} className="my-0" /> : null}
          {shown}
        </span>
      ) : null}
    </div>
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
      <span aria-hidden className="bg-accent animate-live-rung block h-full w-6" />
    </div>
  );
}
