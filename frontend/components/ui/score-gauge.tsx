import { useId, type ReactNode } from 'react';

import { Absence } from '@/components/ui/absence';
import { MeterTrack } from '@/components/ui/meter';
import { StatusMark } from '@/components/ui/status-mark';
import { scoreBand, type ScoreBand } from '@/lib/score-band';

const ARC_RADIUS = 76;
const ARC_SWEEP_DEGREES = 220;
const ARC_TILT = (((ARC_SWEEP_DEGREES - 180) / 2) * Math.PI) / 180;
const ARC_DROP = ARC_RADIUS * Math.sin(ARC_TILT);
const ARC_REACH = ARC_RADIUS * Math.cos(ARC_TILT);
const ARC = `M ${100 - ARC_REACH} ${96 + ARC_DROP} A ${ARC_RADIUS} ${ARC_RADIUS} 0 1 1 ${100 + ARC_REACH} ${96 + ARC_DROP}`;
const ARC_LENGTH = (ARC_RADIUS * ARC_SWEEP_DEGREES * Math.PI) / 180;
const ARC_WEIGHT = 20;
const FIGURE_SIZE = 40;

const GRADIENT_STOPS = [
  { offset: '0%', color: 'var(--color-score-low)' },
  { offset: '35%', color: 'var(--color-score-mid)' },
  { offset: '65%', color: 'var(--color-score-warm)' },
  { offset: '100%', color: 'var(--color-score-high)' },
] as const;

const BAND = {
  low: { tone: 'negative', label: 'Critical' },
  mid: { tone: 'warning', label: 'Needs work' },
  high: { tone: 'positive', label: 'Good' },
} as const satisfies Record<ScoreBand, { tone: BarTone; label: string }>;

const BAR_FILL = {
  positive: 'bg-score-high',
  warning: 'bg-score-mid',
  negative: 'bg-score-low',
  ink: 'bg-mark-ink',
} as const;

type BarTone = keyof typeof BAR_FILL;

export const scoreTone = (score: number) => BAND[scoreBand(Math.round(score))].tone;

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

export function ScoreGauge({
  label,
  score,
  absent,
}: Readonly<{ label: string; score: number | null; absent?: string }>) {
  const shown = score === null ? null : clampScore(score);
  const band = shown === null ? null : BAND[scoreBand(shown)];
  const spoken = shown === null ? (absent ?? 'not measured') : `${shown} of 100`;
  const gradientId = useId();
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <svg
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={`${label}: ${spoken}`}
        viewBox="0 0 200 140"
        className="h-35 w-50 max-w-full"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={100 - ARC_RADIUS}
            x2={100 + ARC_RADIUS}
            y1={0}
            y2={0}
          >
            {GRADIENT_STOPS.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <path
          d={ARC}
          fill="none"
          strokeWidth={ARC_WEIGHT}
          strokeLinecap="round"
          className="stroke-well"
        />
        {band && shown ? (
          <path
            d={ARC}
            fill="none"
            strokeWidth={ARC_WEIGHT}
            strokeLinecap="round"
            strokeDasharray={`${(shown / 100) * ARC_LENGTH} ${ARC_LENGTH}`}
            stroke={`url(#${gradientId})`}
          />
        ) : null}
        {shown === null ? null : (
          <text
            x={100}
            y={110}
            textAnchor="middle"
            fontSize={FIGURE_SIZE}
            fontWeight={600}
            className="fill-ink tabular-nums"
          >
            {shown}
          </text>
        )}
      </svg>
      <GaugeMark band={band} absent={absent} />
    </div>
  );
}

function GaugeMark({
  band,
  absent,
}: Readonly<{ band: (typeof BAND)[ScoreBand] | null; absent?: string }>) {
  if (band) return <StatusMark tone={band.tone}>{band.label}</StatusMark>;
  if (absent) return <Absence state="unavailable" label={absent} />;
  return <Absence state="not_measured" />;
}

export type BarRow = Readonly<{
  key: string;
  label: ReactNode;
  figure: ReactNode;
  share: number | null;
  tone: BarTone;
}>;

export function BarRows({ label, rows }: Readonly<{ label: string; rows: readonly BarRow[] }>) {
  return (
    <ul aria-label={label} className="flex min-w-0 flex-col">
      {rows.map((row) => (
        <li
          key={row.key}
          className="border-rule grid min-h-9 grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] items-center gap-3 border-t"
        >
          <span className="text-body text-ink min-w-0 text-pretty">{row.label}</span>
          <span className="text-body text-ink min-w-10 text-right tabular-nums">{row.figure}</span>
          <MeterTrack
            value={row.share}
            max={1}
            fill={BAR_FILL[row.tone]}
            shape="bar"
            semantics={{ kind: 'decorative' }}
          />
        </li>
      ))}
    </ul>
  );
}

export function ScoreBar({ score }: Readonly<{ score: number | null }>) {
  return (
    <MeterTrack
      value={score}
      max={100}
      fill={score === null ? '' : BAR_FILL[scoreTone(score)]}
      shape="score"
      semantics={{ kind: 'decorative' }}
    />
  );
}
