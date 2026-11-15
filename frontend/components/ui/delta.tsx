import { Absence } from '@/components/ui/absence';
import { cn } from '@/lib/utils';

/**
 * Delta — a change: `data-sm` at 500, an arrow glyph,
 * the signed number and its unit, in the tone its meaning takes, with an
 * optional basis ("vs 7 Nov") in `ink-2`.
 *
 * Colour follows meaning, not direction: `higher-is-better` paints a rise
 * `positive`, `lower-is-better` (rank, latency, errors) paints it
 * `negative`, and `neutral` stays `ink-2` because the movement is a fact,
 * not a verdict. A displayed zero is flat: `→ 0` in `ink-2`. The arrow, the
 * sign and the hidden word carry the direction without colour; only the word
 * is spoken.
 *
 * The direction is decided from the value the reader SEES, after rounding, so
 * a movement of +0.04 never claims a direction it does not show.
 *
 * A change that cannot be compared (null, undefined or non-finite) is not
 * zero: it is an Absence, with the optional reason on hover and focus.
 */
export type DeltaPolicy = 'higher-is-better' | 'lower-is-better' | 'neutral';

type Direction = 'up' | 'down' | 'flat';

const TREND = {
  up: { arrow: '↑', word: 'up' },
  down: { arrow: '↓', word: 'down' },
  flat: { arrow: '→', word: 'no change' },
} as const satisfies Record<Direction, { arrow: string; word: string }>;

/** What the movement means under the policy; `data-outcome` exposes it. */
type Outcome = 'improved' | 'worsened' | 'changed' | 'unchanged';

function outcomeOf(direction: Direction, policy: DeltaPolicy): Outcome {
  if (direction === 'flat') return 'unchanged';
  if (policy === 'neutral') return 'changed';
  return (direction === 'up') === (policy === 'higher-is-better') ? 'improved' : 'worsened';
}

const OUTCOME_INK: Record<Outcome, string> = {
  improved: 'text-positive',
  worsened: 'text-negative',
  changed: 'text-ink-2',
  unchanged: 'text-ink-2',
};

function roundedChange(value: number, precision: number) {
  const rounded = Number(value.toFixed(precision));
  let direction: Direction = 'flat';
  if (rounded > 0) direction = 'up';
  else if (rounded < 0) direction = 'down';
  return { direction, magnitude: Math.abs(rounded) };
}

// The website's product screens keep their unsigned 400 change line.
const DELTA_FACE =
  'type-data-sm inline-flex items-baseline gap-1 font-medium whitespace-nowrap [[data-public-surface]_&]:font-normal';

const SIGN = { up: '+', down: '-', flat: '' } as const satisfies Record<Direction, string>;

export function Delta({
  value,
  policy = 'higher-is-better',
  precision = 1,
  unit = '',
  missingReason,
  context,
  className,
}: Readonly<{
  /** The signed change, or null when there is nothing to compare against. */
  value: number | null | undefined;
  /** Which direction is good. Decides the colour, never the arrow. */
  policy?: DeltaPolicy;
  /** Decimal places the change is rounded to before its direction is decided. */
  precision?: number;
  /** Appended to the magnitude, e.g. `' pts'`, `'%'`. */
  unit?: string;
  /** Why there is no change, e.g. "No comparable run" — shown on hover/focus. */
  missingReason?: string;
  /** The basis the change is measured against, e.g. "vs 7 Nov", in `ink-2`. */
  context?: string;
  className?: string;
}>) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return <Absence state="not_measured" reason={missingReason} className={className} />;
  }
  const { direction, magnitude } = roundedChange(value, precision);
  const outcome = outcomeOf(direction, policy);
  return (
    <span
      data-direction={direction}
      data-outcome={outcome}
      className={cn(DELTA_FACE, OUTCOME_INK[outcome], className)}
    >
      <span aria-hidden className="inline-block w-[1ch]">
        {TREND[direction].arrow}
      </span>
      <span className="sr-only">{`${TREND[direction].word} `}</span>
      <span>
        <span aria-hidden className="[[data-public-surface]_&]:hidden">
          {SIGN[direction]}
        </span>
        {magnitude.toFixed(direction === 'flat' ? 0 : precision)}
        {unit}
      </span>
      {context ? <span className="text-ink-2 ms-0.5 font-normal">{context}</span> : null}
    </span>
  );
}
