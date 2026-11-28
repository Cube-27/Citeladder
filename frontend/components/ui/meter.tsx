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

const FILL_MOTION = 'block h-full fill-share transition-meter';

function percentOf(value: number | null, max: number) {
  if (value === null || max <= 0) return null;
  return (Math.min(max, Math.max(0, value)) / max) * 100;
}

const TRACK_SHAPE = {
  meter: 'rounded-mark app:h-2 h-1.5 w-full [[data-public-surface]_&]:bg-rule',
  cell: 'rounded-mark h-2 w-30',
  bar: 'rounded-mark h-2',
  score: 'rounded-mark h-2 min-w-24',
  progress: 'rounded-full h-1',
} as const;

type TrackSemantics =
  | Readonly<{ kind: 'meter'; labelledBy?: string; label?: string; valueText: string }>
  | Readonly<{ kind: 'decorative' }>;

export function MeterTrack({
  value,
  max,
  fill,
  shape,
  semantics,
  toneName,
}: Readonly<{
  value: number | null;
  max: number;
  fill: string;
  shape: keyof typeof TRACK_SHAPE;
  semantics: TrackSemantics;
  toneName?: string;
}>) {
  const percent = percentOf(value, max);
  const bar = (
    <>
      {percent === null ? null : (
        <span className={cn(FILL_MOTION, fill)} style={{ '--share': `${percent}%` }} />
      )}
    </>
  );
  const track = cn('bg-well block overflow-hidden', TRACK_SHAPE[shape]);
  if (semantics.kind === 'decorative')
    return (
      <span aria-hidden className={track}>
        {bar}
      </span>
    );
  return (
    <div // NOSONAR
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-labelledby={semantics.labelledBy}
      aria-label={semantics.labelledBy ? undefined : semantics.label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value === null ? undefined : Math.min(max, Math.max(0, value))}
      aria-valuetext={semantics.valueText}
      data-meter-tone={toneName}
      className={track}
    >
      {bar}
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
        shape="meter"
        semantics={{ kind: 'meter', labelledBy: labelId, valueText: shown }}
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
  return (
    <MeterTrack
      value={value}
      max={max}
      fill={METER_FILL[tone]}
      shape="cell"
      semantics={{ kind: 'meter', label, valueText }}
      toneName={tone}
    />
  );
}

const ROW_FILL = { neutral: 'bg-data-other', accent: 'bg-data-you' } as const;

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
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-caption text-ink-2">{name}</span>
      <MeterTrack
        value={value}
        max={max}
        fill={ROW_FILL[tone]}
        shape="meter"
        semantics={{
          kind: 'meter',
          label,
          valueText:
            percent === null ? availabilityLabel('not_measured') : formatPercent(percent / 100),
        }}
      />
      <span className="text-body text-ink text-right tabular-nums">{figure}</span>
    </div>
  );
}
