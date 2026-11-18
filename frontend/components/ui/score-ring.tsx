import { scoreBand, type ScoreBand } from '@/lib/score-band';
import { cn } from '@/lib/utils';

/**
 * A score's tone: `ink` for a single score; `auto` colours by band where
 * scores are compared — `positive` from 80, `warning` from 50, `negative`
 * below. The numeral inside the ring keeps the foreground ink.
 */
export type ScoreTone = 'ink' | 'auto';

type ScoreFill = 'ink' | 'positive' | 'warning' | 'negative';

const BAND_FILL = {
  high: 'positive',
  mid: 'warning',
  low: 'negative',
} as const satisfies Record<ScoreBand, ScoreFill>;

function scoreFill(tone: ScoreTone, value: number): ScoreFill {
  return tone === 'ink' ? 'ink' : BAND_FILL[scoreBand(value)];
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const RING_STROKE = {
  ink: 'stroke-ink',
  positive: 'stroke-positive',
  warning: 'stroke-warning',
  negative: 'stroke-negative',
} as const satisfies Record<ScoreFill, string>;

/** `figure`: 64px, room for "100" in the 24px figure; `inline`: 20px, a mark on a text line. */
const RING = {
  figure: { size: 64, stroke: 5, box: 'size-16' },
  inline: { size: 20, stroke: 3, box: 'size-5' },
} as const;

/**
 * ScoreRing — a 0–100 score as a ring, the app's only score graphic (never a
 * bar, meter or rungs). At `figure` size (64px) the number sits at its centre
 * in the `figure` role; at `inline` size (20px, a FigureStrip value) the ring
 * is a mark and the caller prints the number beside it. A `rule` track; the
 * arc is `ink`, or banded with `tone="auto"` where scores are compared. It
 * draws no percent sign; `unit="%"` names a share as one for assistive tech.
 */
export function ScoreRing({
  value,
  label,
  tone = 'ink',
  unit,
  size = 'figure',
}: Readonly<{
  /** Score 0–100. */
  value: number;
  /** The accessible name, e.g. "Site Health score". */
  label: string;
  tone?: ScoreTone;
  /** A share out of 100 rather than a score. */
  unit?: '%';
  size?: keyof typeof RING;
}>) {
  const score = clampScore(value);
  const { size: SIZE, stroke: STROKE, box } = RING[size];
  const centre = SIZE / 2;
  const radius = centre - STROKE / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The ring and its numeral are one generated image; <img> cannot hold them.
      role="img" // NOSONAR -- the ring and its numeral are one generated image
      aria-label={unit ? `${label}: ${score}%` : `${label}: ${score} out of 100`}
      className={cn('relative inline-grid shrink-0 place-items-center self-center', box)}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
        className="absolute inset-0"
      >
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-rule"
        />
        {score > 0 ? (
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
            transform={`rotate(-90 ${centre} ${centre})`}
            className={cn(RING_STROKE[scoreFill(tone, score)])}
          />
        ) : null}
      </svg>
      {size === 'figure' ? (
        <span aria-hidden className="type-figure relative">
          {score}
        </span>
      ) : null}
    </div>
  );
}
