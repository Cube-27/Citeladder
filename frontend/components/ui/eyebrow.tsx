import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow (kicker) recipes — sans micro-labels at the product secondary rung
 * (the `text-role-meta` size — 13/18 in the product, 12/16 on public
 * surfaces — medium, muted, sentence case).
 *
 * Labels inherit the shared sans face; numeric labels may opt into tabular
 * numerals without introducing a second font family.
 *
 * `eyebrowClasses` is the muted form, shared by page eyebrows, panel labels,
 * panel labels, sidebar group labels and <CardEyebrow>; apply it to whatever
 * element is semantic at the call site. <AccentEyebrow> is the accent-toned
 * variant used atop setup and status pages.
 */
export const eyebrowClasses = 'font-sans text-role-meta font-medium tracking-normal text-muted';

export function AccentEyebrow({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span
      {...props}
      className={cn(eyebrowClasses, 'text-accent-text inline-flex items-center gap-1.5', className)}
    >
      {children}
    </span>
  );
}
