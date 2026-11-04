import { useId } from 'react';

import { cn } from '@/lib/utils';

/** The busy segment: 36% of the track sliding across (slower under reduced motion). */
const BUSY_FILL = 'bg-ink absolute top-0 left-0 h-full w-[36%] rounded-full animate-progress-busy';

/**
 * ProgressBar — a thin bar for work that takes more than a few seconds: a
 * prompt run, a crawl, an export. A 6px `radius-full` track in `line` with an
 * `ink` fill growing in 200ms; without `value` it is busy. The label (14/20
 * medium `ink`) sits left and the value (mono 13 `ink-secondary`) right; count
 * in the product's units with `valueLabel` ("48 of 120 prompts") when you can.
 * Never coloured by status.
 */
export function ProgressBar({
  label,
  value,
  max = 100,
  valueLabel,
  className,
}: Readonly<{
  label?: string;
  /** Omit for busy. */
  value?: number;
  max?: number;
  valueLabel?: string;
  className?: string;
}>) {
  const labelId = useId();
  const busy = value === undefined;
  const percent = busy ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const shown = valueLabel ?? (busy ? null : `${Math.round(percent)}%`);
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {label || shown ? (
        <div className="flex items-baseline justify-between gap-3">
          <span id={labelId} className="text-label text-ink">
            {label}
          </span>
          {shown ? (
            <span className="text-ink-secondary text-data font-mono whitespace-nowrap">
              {shown}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <progress> cannot hold the sliding busy segment or the 200ms fill.
        role="progressbar"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Progress'}
        aria-valuemin={busy ? undefined : 0}
        aria-valuemax={busy ? undefined : max}
        aria-valuenow={busy ? undefined : value}
        aria-valuetext={valueLabel}
        aria-busy={busy || undefined}
        className="bg-line relative h-1.5 overflow-hidden rounded-full"
      >
        {busy ? (
          <span className={BUSY_FILL} />
        ) : (
          <span
            className="bg-ink block h-full rounded-full transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-standard)]"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * BusyBar — a background refresh over content that stays visible: the
 * ProgressBar's busy segment on a 2px track along the region's top edge,
 * positioned so appearing and disappearing never moves the content.
 */
export function BusyBar({ active, label }: Readonly<{ active: boolean; label: string }>) {
  if (!active) return null;
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <progress> cannot hold the sliding busy segment.
      role="progressbar"
      aria-label={label}
      aria-busy
      className="bg-line absolute inset-x-0 top-0 z-1 h-0.5 overflow-hidden"
    >
      <span className={BUSY_FILL} />
    </div>
  );
}
