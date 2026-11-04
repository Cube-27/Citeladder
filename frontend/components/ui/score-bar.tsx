import { cn } from '@/lib/utils';

/**
 * A score's tone: `ink` for a single score; `auto` colours by band where
 * scores are compared — `positive` from 80, `warning` from 50, `negative`
 * below. The numeral beside a mark keeps the foreground ink.
 */
export type ScoreTone = 'ink' | 'auto';

type ScoreFill = 'ink' | 'positive' | 'warning' | 'negative';

export function scoreFill(tone: ScoreTone, value: number): ScoreFill {
  if (tone === 'ink') return 'ink';
  if (value >= 80) return 'positive';
  return value >= 50 ? 'warning' : 'negative';
}

const SEGMENT_FILL = {
  ink: 'bg-ink',
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
} as const satisfies Record<ScoreFill, string>;

export const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * ScoreBar — a 0–100 score as a 12px bar of 20 segments with the number
 * beside it, for scores in rows: page health, per-check results. Its width
 * follows its column, so give the column a fixed width and every row's bar is
 * the same length. Progress through a task is a `ProgressBar`; usage against a
 * limit a `Meter`.
 */
export function ScoreBar({
  value,
  label,
  tone = 'ink',
  showValue = true,
}: Readonly<{
  /** Score 0–100. */
  value: number;
  /** The accessible name, e.g. "Readiness score". */
  label: string;
  tone?: ScoreTone;
  /** Hide the number when it is already printed beside the bar. */
  showValue?: boolean;
}>) {
  const score = clampScore(value);
  const lit = Math.round((score / 100) * 20);
  const fill = SEGMENT_FILL[scoreFill(tone, score)];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <meter> cannot draw twenty segments.
        role="meter" // NOSONAR -- a native <meter> cannot draw twenty segments
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score} out of 100`}
        className="flex h-3 min-w-0 flex-1 gap-0.5"
      >
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={cn('min-w-0.5 flex-1 rounded-2xs', index < lit ? fill : 'bg-chart-grid')}
          />
        ))}
      </span>
      {showValue ? (
        <span aria-hidden className="text-label text-ink w-[3ch] text-right tabular-nums">
          {score}
        </span>
      ) : null}
    </div>
  );
}
