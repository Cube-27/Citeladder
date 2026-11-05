import { cn } from '@/lib/utils';

/**
 * A score's tone: `ink` for a single score; `auto` colours by band where
 * scores are compared — `positive` from 80, `warning` from 50, `negative`
 * below. The numeral inside the ring keeps the foreground ink.
 */
export type ScoreTone = 'ink' | 'auto';

type ScoreFill = 'ink' | 'positive' | 'warning' | 'negative';

export function scoreFill(tone: ScoreTone, value: number): ScoreFill {
  if (tone === 'ink') return 'ink';
  if (value >= 80) return 'positive';
  return value >= 50 ? 'warning' : 'negative';
}

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const RING_STROKE = {
  ink: 'stroke-ink',
  positive: 'stroke-positive',
  warning: 'stroke-warning',
  negative: 'stroke-negative',
} as const satisfies Record<ScoreFill, string>;

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * ScoreRing — a 0–100 score as a 96px ring with the number in the `figure`
 * role (Geist 500) at its centre: the Site Health score, a page's readiness,
 * a score Stat (never a bar, decision D8).
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
      <span aria-hidden className="type-figure relative">
        {score}
      </span>
    </div>
  );
}
