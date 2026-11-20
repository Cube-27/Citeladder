import { useId } from 'react';

import { MeterLabelRow } from '@/components/ui/meter';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const RUNGS = 10;
const MAX = 100;

/**
 * RungMeter — ten rungs for work in progress out of 100; a 0 to 100 score is
 * a printed figure, never rungs. Rungs fill in `ink` on a `well` track, the label
 * above them and the percentage beside the label while both fit (else under it).
 */
export function RungMeter({ label, value }: Readonly<{ label: string; value: number }>) {
  const labelId = useId();
  const clamped = Math.min(MAX, Math.max(0, value));
  const shown = formatPercent(clamped / MAX);
  const filled = Math.round((clamped / MAX) * RUNGS);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <MeterLabelRow>
        {/* The name never breaks inside a word; the value wraps under it first. */}
        <span id={labelId} className="type-body">
          {label}
        </span>
        <span className="type-body text-ink-2 whitespace-nowrap tabular-nums">{shown}</span>
      </MeterLabelRow>
      {/* The native bar carries the value to assistive technology; the drawn rungs beside it are decoration. */}
      <progress
        className="sr-only"
        aria-labelledby={labelId}
        max={MAX}
        value={clamped}
        aria-valuetext={shown}
      />
      <span aria-hidden className="grid grid-cols-10 gap-0.5">
        {Array.from({ length: RUNGS }, (_, index) => (
          <span
            key={index}
            className={cn('rounded-mark h-2', index >= filled ? 'bg-well' : 'bg-ink')}
          />
        ))}
      </span>
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
      <span aria-hidden className="bg-ink animate-live-rung block h-full w-6" />
    </div>
  );
}
