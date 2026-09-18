import type { ComponentPropsWithoutRef } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { availabilityLabel, type DataAvailabilityState } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Compact, explicit presentation for a product value that is not available as a number. */
export function UnavailableValue({
  state,
  className,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state: DataAvailabilityState;
  }
>) {
  return (
    <span {...props} className={cn('value-placeholder', className)}>
      {availabilityLabel(state)}
    </span>
  );
}

/**
 * The same fact as `UnavailableValue`, for a cell in a column of numbers.
 *
 * A table repeats its placeholder once per row, and a column of "Not measured"
 * says the phrase twenty times to make one point — while sitting at a
 * different size from the digits above it, so it reads as a different KIND of
 * value rather than an absent one. The mark here is quiet enough to scan past
 * and still wide enough to see, and it holds the row's rhythm.
 *
 * Nothing is lost by shortening it. The state is still announced to assistive
 * technology, and `reason` puts the specific explanation a keystroke or a
 * hover away. What it must never become is blank: an empty cell and a measured
 * zero look identical, and those are opposite findings.
 *
 * Use it for MEASUREMENTS. A workflow state a reader can act on -- "Failed",
 * "Not run" -- keeps its words in `UnavailableValue`, because that one is not
 * a missing number, it is the answer.
 */
export function MissingValue({
  state = 'not_measured',
  reason,
  className,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state?: DataAvailabilityState;
    /** Why this particular value is absent, when the column cannot say it. */
    reason?: string;
  }
>) {
  const label = availabilityLabel(state);
  const mark = (
    <span {...props} className={cn('value-placeholder', className)}>
      {/* Aria-hidden so the dash is never read as punctuation; the label
          below is what a screen reader receives in its place. */}
      <span aria-hidden>&ndash;</span>
      <span className="sr-only">{label}</span>
    </span>
  );
  if (!reason) return mark;
  return (
    <Tooltip content={reason}>
      {/* A real button, not a span with a tabindex: the reason has to be
          reachable by keyboard, and only an interactive element announces
          itself as something to reach. */}
      <button type="button" className="focus-ring rounded-full">
        {mark}
      </button>
    </Tooltip>
  );
}
