import { cn } from '@/lib/utils';

/**
 * Spinner — the live rung: one rung in the text's ink (`on-ink` inside a
 * primary button), the logo's
 * bar, pulsing its opacity every 1.2s while work is live. Motion says
 * "working"; the accent never does (it marks only you and here). It is the only
 * "working" mark: no arcs, shimmers or bounces. Reduced motion holds it still.
 * Inside a busy button it stands beside the button's verb.
 *
 * Loading is its own state, distinct from a measured value and from an
 * explicit missing one (invariant 7): the rung holds the slot until the
 * answer arrives.
 */
export function Spinner({
  label,
  showLabel = false,
  className,
}: Readonly<{
  /**
   * What is loading, present tense ("Saving"). Omit ONLY when a visible label
   * beside the rung already says it.
   */
  label?: string;
  /** Print the label beside the rung. */
  showLabel?: boolean;
  className?: string;
}>) {
  // With a label it is a polite status (the native <output>); without, decoration.
  const Root = label ? 'output' : 'span';
  return (
    <Root
      aria-label={label && !showLabel ? label : undefined}
      aria-hidden={label ? undefined : true}
      data-live-rung=""
      className={cn('inline-flex shrink-0 items-center gap-2 align-middle', className)}
    >
      <span aria-hidden className="inline-grid size-3.5 shrink-0 place-items-center">
        <span className="animate-live-rung rounded-mark block h-3 w-1 bg-current" />
      </span>
      {label && showLabel ? <span className="type-body text-ink-2">{label}</span> : null}
    </Root>
  );
}
