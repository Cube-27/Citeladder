import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow (kicker) recipes — sentence-case sans micro-labels (11px, medium,
 * muted). The flat/hairline language drops the mono-uppercase-tracked eyebrow
 * entirely: labels are quiet sans text, and mono is reserved for values.
 *
 * `eyebrowClasses` is the muted form, shared by page eyebrows, table
 * headers, panel labels and <CardEyebrow>; apply it to whatever element is
 * semantic at the call site. <AccentEyebrow> is the accent-toned variant used
 * atop setup and status pages.
 */
export const eyebrowClasses = 'text-2xs text-muted font-medium';

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
