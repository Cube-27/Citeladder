import type { ReactNode } from 'react';
import { useId } from 'react';

import { Absence } from '@/components/ui/absence';
import { availabilityLabel, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

export type MeterTone = 'ink' | 'accent' | 'warning' | 'negative';

const METER_FILL = {
  ink: 'bg-mark-ink',
  accent: 'bg-data-you',
  warning: 'bg-warning',
  negative: 'bg-negative',
} as const satisfies Record<MeterTone, string>;

const FILL_MOTION = 'block h-full transition-meter';

function percentOf(value: number | null, max: number) {
  if (value === null || max <= 0) return null;
  return (Math.min(max, Math.max(0, value)) / max) * 100;
}

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
    <div // NOSONAR
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value === null ? undefined : Math.min(max, Math.max(0, value))}
      aria-valuetext={valueText}
      className="bg-well [[data-public-surface]_&]:bg-rule rounded-mark app:h-2 block h-1.5 w-full overflow-hidden"
    >
      {percent === null ? null : (
        <span className={cn(FILL_MOTION, 'w-share', fill)} style={{ '--share': `${percent}%` }} />
      )}
    </div>
  );
}

function MeterLabelRow({ children }: Readonly<{ children: ReactNode }>) {
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
  value: number | null;
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
          className="text-body text-ink [[data-public-surface]_&]:min-w-0 [[data-public-surface]_&]:break-words"
        >
          {label}
        </span>
        <span className="text-body text-ink-2 whitespace-nowrap tabular-nums">
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

export function CellMeter({
  label,
  value,
  max,
  valueText,
  tone,
}: Readonly<{ label: string; value: number; max: number; valueText: string; tone: MeterTone }>) {
  const shown = Math.min(max, Math.max(0, value));
  const percent = max > 0 ? (shown / max) * 100 : 100;
  return (
    <div // NOSONAR
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      data-meter-tone={tone}
      className="bg-well rounded-mark block h-2 w-30 overflow-hidden"
    >
      <span
        className={cn(FILL_MOTION, 'w-share', METER_FILL[tone])}
        style={{ '--share': `${percent}%` }}
      />
    </div>
  );
}

const ROW_FILL = { neutral: 'bg-control-line', accent: 'bg-data-you' } as const;

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
  label: string;
  tone: keyof typeof ROW_FILL;
}>) {
  const percent = percentOf(value, max);
  return (
    <div className="grid-cols-meter-row grid items-center gap-3">
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
      <span className="text-body text-ink text-right tabular-nums">{figure}</span>
    </div>
  );
}
