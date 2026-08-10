import type { HTMLAttributes } from 'react';

import { STATE_COPY, type DerivedState } from '@/components/intelligence/state-label-data';
import { cn } from '@/lib/utils';

/**
 * StateLabel — the vocabulary for "this number is not a number".
 *
 * Nine states, each with distinct TEXT (design.md: status colour never carries
 * meaning alone; WCAG 1.4.1). The whole point of this component is that the
 * states are not interchangeable: `unavailable` means we could not measure,
 * `not_applicable` means the question does not apply here, and `observed_zero`
 * means we measured and the answer was zero. Those three render as an empty
 * chart if a screen is careless, which is exactly the confusion this prevents.
 *
 * Rendering the state as a shared component rather than per-screen strings is
 * what stops the vocabulary drifting apart across the four layers.
 */
/**
 * Tone maps to the semantic status families. Colour is redundant with the
 * label by construction — never the only signal.
 */
const STATE_TONE: Record<DerivedState, string> = {
  unknown: 'bg-neutral-bg text-secondary',
  unavailable: 'bg-neutral-bg text-secondary',
  not_applicable: 'bg-neutral-bg text-secondary',
  historical: 'bg-info-bg text-info-text',
  future: 'bg-info-bg text-info-text',
  conflicting: 'bg-warning-bg text-warning-text',
  excluded: 'bg-neutral-bg text-secondary',
  failed: 'bg-danger-bg text-danger-text',
  observed_zero: 'bg-neutral-bg text-secondary',
};

export type StateLabelProps = {
  state: DerivedState;
  /** Overrides the default label. Use only when a surface has a truer word. */
  children?: string;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

export function StateLabel({ state, children, className, ...rest }: Readonly<StateLabelProps>) {
  const { label, description } = STATE_COPY[state];
  return (
    <span
      className={cn(
        'text-2xs inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-medium whitespace-nowrap',
        STATE_TONE[state],
        className,
      )}
      title={description}
      data-state={state}
      {...rest}
    >
      {children ?? label}
    </span>
  );
}
