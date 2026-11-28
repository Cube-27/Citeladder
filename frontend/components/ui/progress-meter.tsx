import { useId } from 'react';

import { MeterTrack } from '@/components/ui/meter';
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
      <MeterTrack
        value={clamped}
        max={MAX}
        fill="bg-data-you"
        shape="progress"
        semantics={{ kind: 'decorative' }}
      />
      <span className="text-caption text-ink whitespace-nowrap tabular-nums">{shown}</span>
    </div>
  );
}
