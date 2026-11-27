import type { ReactNode } from 'react';

import { Absence } from '@/components/ui/absence';
import { StatusMark } from '@/components/ui/status-mark';
import { scoreBand, type ScoreBand } from '@/lib/score-band';
import { cn } from '@/lib/utils';

const ARC = 'M 22 100 A 78 78 0 0 1 178 100';
const ARC_LENGTH = Math.PI * 78;
const ARC_WEIGHT = 18;
const FIGURE_SIZE = 36;

const BAND = {
  low: { stroke: 'stroke-negative', tone: 'negative', label: 'Critical' },
  mid: { stroke: 'stroke-warning', tone: 'warning', label: 'Needs work' },
  high: { stroke: 'stroke-positive', tone: 'positive', label: 'Good' },
} as const satisfies Record<ScoreBand, { stroke: string; tone: BarTone; label: string }>;

const BAR_FILL = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
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
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <svg
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={`${label}: ${spoken}`}
        viewBox="0 0 200 112"
        className="h-28 w-50 max-w-full"
      >
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
            className={band.stroke}
          />
        ) : null}
        {shown === null ? null : (
          <text
            x={100}
            y={98}
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
          className="border-rule grid-cols-score-gauge grid min-h-9 items-center gap-3 border-t"
        >
          <span className="text-body text-ink min-w-0 text-pretty">{row.label}</span>
          <span className="text-body text-ink min-w-10 text-right tabular-nums">{row.figure}</span>
          <span className="bg-well rounded-mark block h-2 overflow-hidden" aria-hidden>
            {row.share === null ? null : (
              <span
                className={cn('block h-full w-share', BAR_FILL[row.tone])}
                style={{ '--share': `${Math.max(0, Math.min(1, row.share)) * 100}%` }}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const percent = (share: number) => `${share * 100}%`;

export function ScoreBar({ score }: Readonly<{ score: number | null }>) {
  return (
    <span aria-hidden className="bg-well rounded-mark block h-2 min-w-24 overflow-hidden">
      {score === null ? null : (
        <span
          className={cn('block h-full w-(--fill)', BAR_FILL[scoreTone(score)])}
          style={{ '--fill': percent(Math.max(0, Math.min(100, score)) / 100) }}
        />
      )}
    </span>
  );
}
