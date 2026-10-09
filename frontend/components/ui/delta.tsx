import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

import { MissingValue } from '@/components/ui/unavailable-value';
import { textRole } from '@/components/ui/typography';
import type { DataAvailabilityState } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Delta — the one change indicator.
 *
 * Three treatments had grown apart: "+1.2 vs previous" in secondary ink on the
 * dashboard, "+0.5 pp" with no direction mark on Visibility and Prompts, and an
 * arrow glyph beside a rounded number on Site Health. None of them said
 * whether the movement was good, and one used colour alone.
 *
 * Here the direction is always carried three ways — the sign, the arrow and
 * (where the metric has one) the outcome tone — so colour is never the only
 * signal. The tone is a policy, not a guess: `higher-is-better` paints a rise
 * as success, `lower-is-better` (rank, latency, errors) paints it as danger,
 * and `neutral` stays in secondary ink because the movement is a fact, not a
 * verdict. Accent is never a delta colour.
 *
 * The sign is decided from the value the reader SEES, after rounding, so a
 * movement of +0.04 never prints as "+0.0" claiming a direction it does not
 * have; a displayed zero is flat and muted.
 *
 * A missing or non-comparable change is not zero. It renders the availability
 * vocabulary (`MissingValue`: the muted dash, the state as its accessible name,
 * and the optional reason on hover/focus).
 */
export type DeltaPolicy = 'higher-is-better' | 'lower-is-better' | 'neutral';

type Direction = 'up' | 'down' | 'flat';

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** What the movement means under the policy; `data-outcome` exposes it. */
type Outcome = 'improved' | 'worsened' | 'changed' | 'unchanged';

function outcomeOf(direction: Direction, policy: DeltaPolicy): Outcome {
  if (direction === 'flat') return 'unchanged';
  if (policy === 'neutral') return 'changed';
  return (direction === 'up') === (policy === 'higher-is-better') ? 'improved' : 'worsened';
}

const OUTCOME_INK: Record<Outcome, string> = {
  improved: 'text-success-text',
  worsened: 'text-danger-text',
  changed: 'text-secondary',
  unchanged: 'text-muted',
};

/** A true minus sign, so a screen reader says "minus" rather than "dash". */
const SIGNS = { up: '+', down: '−', flat: '' } as const;

function roundedChange(value: number, precision: number) {
  const rounded = Number(value.toFixed(precision));
  let direction: Direction = 'flat';
  if (rounded > 0) direction = 'up';
  else if (rounded < 0) direction = 'down';
  return { direction, magnitude: Math.abs(rounded) };
}

function defaultFormat(magnitude: number, precision: number): string {
  return magnitude.toFixed(precision);
}

export function Delta({
  value,
  policy = 'higher-is-better',
  precision = 1,
  unit = '',
  format,
  comparable = true,
  missingState = 'not_measured',
  missingReason,
  context,
  className,
}: Readonly<{
  /** The signed change, or null when there is nothing to compare against. */
  value: number | null | undefined;
  /** Which direction is good. Decides the tone, never the sign. */
  policy?: DeltaPolicy;
  /** Decimal places the change is rounded to before its sign is decided. */
  precision?: number;
  /** Appended to the magnitude, e.g. `' pp'`, `'%'`. */
  unit?: string;
  /** Formats the (already rounded, non-negative) magnitude. */
  format?: (magnitude: number) => string;
  /** False when the two windows cannot be compared (different cohort, engine set). */
  comparable?: boolean;
  /** The availability state shown when there is no comparable change. */
  missingState?: DataAvailabilityState;
  /** Why there is no change, e.g. "No comparable run" — shown on hover/focus. */
  missingReason?: string;
  /** A trailing qualifier in the same run, e.g. "vs previous". */
  context?: string;
  className?: string;
}>) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !comparable) {
    return (
      <span className={textRole('delta', cn('text-muted', className))}>
        <MissingValue state={missingState} reason={missingReason} />
      </span>
    );
  }
  const { direction, magnitude } = roundedChange(value, precision);
  const text = format ? format(magnitude) : defaultFormat(magnitude, precision);
  const Icon = ICONS[direction];
  const outcome = outcomeOf(direction, policy);
  return (
    <span
      data-direction={direction}
      data-outcome={outcome}
      className={textRole(
        'delta',
        cn('inline-flex items-center gap-1 whitespace-nowrap', OUTCOME_INK[outcome], className),
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span>
        {SIGNS[direction]}
        {text}
        {unit}
        {context ? ` ${context}` : null}
      </span>
    </span>
  );
}
