import { cn } from '@/lib/utils';

import { clampScore, scoreFill, type ScoreTone } from './score-bar';

const RING_STROKE = {
  ink: 'stroke-ink',
  positive: 'stroke-positive',
  warning: 'stroke-warning',
  negative: 'stroke-negative',
} as const;

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * ScoreRing — a 0–100 score as a 96px ring with the number in Cal Sans
 * (`display` 32) at its centre: the Site Health score, a page's readiness.
 * An 8px `chart-grid` track; the arc is `ink`, or banded with `tone="auto"`
 * where several scores are compared. Pair it with the failing count and the
 * crawl time beside it, never alone; shares are a `DonutChart`. It does not
 * scale and shows no percent sign.
 */
export function ScoreRing({
  value,
  label,
  tone = 'ink',
}: Readonly<{
  /** Score 0–100. */
  value: number;
  /** The accessible name, e.g. "Site Health score". */
  label: string;
  tone?: ScoreTone;
}>) {
  const score = clampScore(value);
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The ring and its numeral are one generated image; <img> cannot hold them.
      role="img" // NOSONAR -- the ring and its numeral are one generated image
      aria-label={`${label}: ${score} out of 100`}
      className="relative inline-grid size-24 shrink-0 place-items-center"
    >
      <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden className="absolute inset-0">
        <circle
          cx={48}
          cy={48}
          r={RADIUS}
          fill="none"
          strokeWidth={8}
          className="stroke-chart-grid"
        />
        {score > 0 ? (
          <circle
            cx={48}
            cy={48}
            r={RADIUS}
            fill="none"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${(CIRCUMFERENCE * score) / 100} ${CIRCUMFERENCE}`}
            transform="rotate(-90 48 48)"
            className={cn(RING_STROKE[scoreFill(tone, score)])}
          />
        ) : null}
      </svg>
      <span aria-hidden className="font-display text-display-lg text-ink relative">
        {score}
      </span>
    </div>
  );
}
