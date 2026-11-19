import type { ComponentPropsWithoutRef } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { ABSENCE_MARK, availabilityLabel, type DataAvailabilityState } from '@/lib/format';
import { cn } from '@/lib/utils';

type AbsenceProps = Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state?: DataAvailabilityState;
    /** Why this particular value is absent, when its column cannot say it. */
    reason?: string;
    /** The word, when the state's own word is not the reader's ("Couldn't load"). */
    label?: string;
  }
>;

/**
 * Absence — a missing value in a value position: the muted em dash in `ink-2`
 * whatever the kind (owner 2026-11-18), its word from the one list
 * (`availabilityLabel`, lib/format.ts) kept as its tooltip and accessible name
 * so the kinds stay distinct. Never blank: a blank and a zero are opposite
 * findings. A `reason` hangs off a real button, so it is reachable by keyboard.
 */
export function Absence({
  state = 'not_measured',
  reason,
  label,
  className,
  ...props
}: AbsenceProps) {
  const word = label ?? availabilityLabel(state);
  const face = (
    <span
      {...props}
      data-absence={state}
      title={reason ? undefined : word}
      className={cn('text-ink-2 font-normal whitespace-nowrap', className)}
    >
      <span aria-hidden>{ABSENCE_MARK}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
  if (!reason) return face;
  return (
    <Tooltip content={reason}>
      <button
        type="button"
        className="rounded-mark hit-area inline-flex min-h-6 min-w-6 items-center justify-center align-middle"
      >
        {face}
      </button>
    </Tooltip>
  );
}
