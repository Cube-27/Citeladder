import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow (kicker) recipes — the `label` role (13/18, 500, muted, sentence
 * case).
 *
 * Labels inherit the shared sans face; numeric labels may opt into tabular
 * numerals without introducing a second font family.
 *
 * `eyebrowClasses` is the muted form, shared by page eyebrows, panel labels,
 * panel labels, sidebar group labels and <CardEyebrow>; apply it to whatever
 * element is semantic at the call site. <AccentEyebrow> is the accent-toned
 * variant used atop setup and status pages.
 */
export const eyebrowClasses = 'type-label';

export function AccentEyebrow({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span
      {...props}
      className={cn(eyebrowClasses, 'text-accent-text inline-flex items-center gap-2', className)}
    >
      {children}
    </span>
  );
}
