import { useId } from 'react';

import { formatPercent } from '@/lib/format';

const MAX = 100;

export function ProgressMeter({ label, value }: Readonly<{ label: string; value: number }>) {
  const labelId = useId();
  const clamped = Math.min(MAX, Math.max(0, value));
  const shown = formatPercent(clamped / MAX);
  return (
    <div className="grid-cols-lead-body-end grid min-w-0 items-center gap-3">
      <span id={labelId} className="text-caption text-ink-2 truncate">
        {label}
      </span>
      <progress
        className="sr-only"
        aria-labelledby={labelId}
        max={MAX}
        value={clamped}
        aria-valuetext={shown}
      />
      <span aria-hidden className="bg-well block h-1 overflow-hidden rounded-full">
        <span
          className="bg-data-you block h-full rounded-full [transition:width_var(--transition-duration-slide)_var(--ease-standard)]"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="text-caption text-ink whitespace-nowrap tabular-nums">{shown}</span>
    </div>
  );
}
