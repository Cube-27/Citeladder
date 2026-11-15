import type { ComponentPropsWithoutRef } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { availabilityLabel, type DataAvailabilityState } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * How each absence is drawn (hatched is absent,
 * no line is not applicable). A real zero is never an absence: it is a Value.
 *   - hatched: not measured, unavailable, not connected, and the workflow
 *     answers (not run, being prepared, not set, unknown): a hatched tag with
 *     the mono word.
 *   - plain: not applicable, `n/a` in `ink-2` mono, no hatch.
 *   - struck: excluded, a hairline tag with the word struck through.
 */
type AbsenceForm = 'hatched' | 'plain' | 'struck';

function formOf(state: DataAvailabilityState): AbsenceForm {
  if (state === 'not_applicable') return 'plain';
  if (state === 'excluded') return 'struck';
  return 'hatched';
}

const TAG =
  'type-data-sm inline-flex min-h-[var(--tag-height)] max-w-full shrink-0 items-center rounded-mark px-2 align-middle whitespace-nowrap lowercase';

type AbsenceProps = Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    state?: DataAvailabilityState;
    /** Why this particular value is absent, when its column cannot say it. */
    reason?: string;
    /** The word, when the state's own word is not the reader's ("Couldn't load"). */
    label?: string;
    /** A narrow cell: a 16px hatched square, its word in a tooltip and for screen readers. */
    narrow?: boolean;
  }
>;

function AbsenceFace({
  state,
  label,
  narrow,
  className,
  ...props
}: Readonly<Omit<AbsenceProps, 'reason'> & { state: DataAvailabilityState }>) {
  const word = label ?? availabilityLabel(state);
  const form = formOf(state);
  if (form === 'plain') {
    return (
      <span {...props} data-absence={state} className={cn('type-data-sm text-ink-2', className)}>
        <span aria-hidden>n/a</span>
        <span className="sr-only">{word}</span>
      </span>
    );
  }
  if (narrow && form === 'hatched') {
    return (
      <span
        {...props}
        data-absence={state}
        className={cn('hatch rounded-mark inline-block size-4 shrink-0 align-middle', className)}
      >
        <span className="sr-only">{word}</span>
      </span>
    );
  }
  return (
    <span
      {...props}
      data-absence={state}
      className={cn(
        TAG,
        form === 'hatched' ? 'hatch text-ink-2' : 'border-rule text-ink-2 border line-through',
        className,
      )}
    >
      {word}
    </span>
  );
}

/**
 * Absence — a missing value that says which kind it is (the
 * absence tag). It must never become blank: an empty cell and a
 * measured zero look identical, and those are opposite findings. A `reason`
 * (or a narrow square) hangs its explanation off a real button, so it is
 * reachable by keyboard.
 */
export function Absence({
  state = 'not_measured',
  reason,
  label,
  narrow = false,
  ...props
}: AbsenceProps) {
  const face = <AbsenceFace {...props} state={state} label={label} narrow={narrow} />;
  const tip = reason ?? (narrow ? (label ?? availabilityLabel(state)) : undefined);
  if (!tip) return face;
  return (
    <Tooltip content={tip}>
      <button
        type="button"
        className="focus-ring rounded-mark inline-flex min-h-6 min-w-6 items-center justify-center align-middle"
      >
        {face}
      </button>
    </Tooltip>
  );
}
