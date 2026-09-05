import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Spinner — the one in-place loading indicator.
 *
 * Loading is a THIRD state, distinct from a measured value and from an
 * explicit missing one (invariant 7). A surface that renders "Not measured"
 * while a refetch is in flight states something it does not know yet, and the
 * placeholder flashing in and out of a value slot reads as data that appeared
 * and vanished. The spinner is what occupies that slot until the answer
 * arrives.
 *
 * Three hand-rolled `LoaderCircle animate-spin` recipes preceded this, each
 * with its own size and its own accessibility treatment. One owner (invariant
 * 2), so a loading state looks and announces the same everywhere.
 */

const SIZES = {
  /** Inside a dense row or a metric slot. */
  sm: 'size-3.5',
  /** A control or a section. */
  md: 'size-4',
  /** A whole region waiting on its first load. */
  lg: 'size-5',
} as const;

export type SpinnerSize = keyof typeof SIZES;

export function Spinner({
  size = 'md',
  label,
  className,
}: Readonly<{
  size?: SpinnerSize;
  /**
   * What is loading, for assistive technology. Omit ONLY when a visible
   * label beside the spinner already says it — an unlabelled spinner in an
   * otherwise empty slot announces nothing at all.
   */
  label?: string;
  className?: string;
}>) {
  return (
    <LoaderCircle
      className={cn(SIZES[size], 'shrink-0 animate-spin', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
