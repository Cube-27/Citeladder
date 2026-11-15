import type { ComponentPropsWithoutRef } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { availabilityLabel, type DataAvailabilityState, MISSING_MARK } from '@/lib/format';
import { cn } from '@/lib/utils';

type AbsenceProps = Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state?: DataAvailabilityState;
    /** Why this particular value is absent, when its column cannot say it. */
    reason?: string;
    /** The word, when the state's own word is not the reader's ("Couldn't load"). */
    label?: string;
    /** A numeric cell too narrow for the word: an en dash, the word in a tooltip and for screen readers. */
    narrow?: boolean;
  }
>;

/**
 * Absence — a missing value that says which kind it is: its word from the one
 * list of kinds (`availabilityLabel`, lib/format.ts) in `ink-2`, sentence
 * case, at the body or caption size of its context (never figure size), with
 * no container and no pattern. It is never blank, because a blank
 * and a measured zero are opposite findings; a zero is a Value. A `reason`
 * (or a narrow cell's dash) hangs its words off a real button, so they are
 * reachable by keyboard.
 */
export function Absence({
  state = 'not_measured',
  reason,
  label,
  narrow = false,
  className,
  ...props
}: AbsenceProps) {
  const word = label ?? availabilityLabel(state);
  const face = (
    <span
      {...props}
      data-absence={state}
      className={cn(
        'text-ink-2 text-[length:min(1em,var(--text-body))] whitespace-nowrap',
        !narrow && 'font-normal',
        className,
      )}
    >
      {narrow ? (
        <>
          <span aria-hidden>{MISSING_MARK}</span>
          <span className="sr-only">{word}</span>
        </>
      ) : (
        word
      )}
    </span>
  );
  const tip = reason ?? (narrow ? word : undefined);
  if (!tip) return face;
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        className="rounded-mark inline-flex min-h-6 min-w-6 items-center justify-center align-middle"
      >
        {face}
      </button>
    </Tooltip>
  );
}
