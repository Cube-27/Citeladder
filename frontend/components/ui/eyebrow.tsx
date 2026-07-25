import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow (kicker) recipes — uppercase sans micro-labels (11px, medium, muted,
 * 0.06em tracking), per the v2 type scale (design.md §7, "micro uppercase
 * labels, table headers") and the Figma sheet, which sets its section labels
 * at exactly 11px/500 uppercase with 0.06em throughout.
 *
 * The flat/hairline phase had retired the eyebrow to plain sentence case; v2
 * brings the uppercase treatment back. What does **not** come back is the mono
 * face — mono stays reserved for values, so a call site must never re-add
 * `font-mono` here (see the carry-forward note on page-type-scores.tsx).
 *
 * `eyebrowClasses` is the muted form, shared by page eyebrows, table headers,
 * panel labels, sidebar group labels and <CardEyebrow>; apply it to whatever
 * element is semantic at the call site. <AccentEyebrow> is the accent-toned
 * variant used atop setup and status pages.
 */
export const eyebrowClasses = 'text-2xs text-muted font-medium tracking-wider uppercase';

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
