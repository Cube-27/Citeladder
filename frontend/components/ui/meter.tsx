'use client';

import { useEffect, useState } from 'react';

import { dataFillClass, type DataTone } from '@/components/ui/data-tone';
import { cn } from '@/lib/utils';

/**
 * Meter — the one horizontal bar for usage, progress and distribution.
 *
 * Run progress, Structure-depth buckets, billing usage and score bars were
 * four hand-drawn bars at three heights on three track fills, and two of them
 * painted `chart-1` — a series colour — onto something that is not a series.
 *
 *   - `kind="meter"` (default): a measurement within a known range — usage
 *     against an allowance, a score, a share of a distribution.
 *   - `kind="progress"`: completion of a task that is moving.
 *
 * The fill speaks `DataTone`: an outcome family when the bar carries a state
 * (usage nearing its limit), a series index when it carries one category's
 * identity in a distribution, `neutral` otherwise. Never accent.
 *
 * The drawing is decorative; the element carries `role`, `aria-value*` and a
 * spoken `aria-valuetext`, so the value is announced, not inferred from width.
 */
const SIZE = {
  /** 4px: inline in a row, beside a label and a value. */
  sm: 'h-1',
  /** 8px: a bar that is the row's subject. */
  md: 'h-2',
} as const;

export type MeterSize = keyof typeof SIZE;

function defaultValueText(value: number, min: number, max: number): string {
  if (min === 0 && max === 100) return `${value}%`;
  return `${value} of ${max}`;
}

export function Meter({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  kind = 'meter',
  tone = 'neutral',
  size = 'sm',
  sweep = false,
  fillClassName,
  className,
}: Readonly<{
  value: number;
  min?: number;
  max?: number;
  /** The accessible name, e.g. "Prompt runs usage". */
  label: string;
  /** Spoken value; defaults to "N%" on a 0–100 scale, else "N of max". */
  valueText?: string;
  kind?: 'meter' | 'progress';
  tone?: DataTone;
  size?: MeterSize;
  /** Grow from zero on mount (score bars). Respects reduced motion. */
  sweep?: boolean;
  /**
   * A `components/ui` owner's own fill (e.g. the score-band ladder). Feature
   * code passes `tone`.
   */
  fillClassName?: string;
  className?: string;
}>) {
  const span = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const percent = span > 0 ? ((clamped - min) / span) * 100 : 0;
  const [swept, setSwept] = useState(!sweep);

  useEffect(() => {
    if (!sweep) return;
    const frame = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(frame);
  }, [sweep]);

  return (
    <div
      role={kind === 'progress' ? 'progressbar' : 'meter'}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={valueText ?? defaultValueText(clamped, min, max)}
      className={cn('bg-well w-full overflow-hidden rounded-full', SIZE[size], className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-standard)] motion-reduce:transition-none',
          fillClassName ?? dataFillClass(tone),
        )}
        style={{ width: swept ? `${percent}%` : 0 }}
      />
    </div>
  );
}
