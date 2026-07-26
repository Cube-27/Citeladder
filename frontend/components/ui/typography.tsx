import type { ComponentPropsWithoutRef } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Heading recipes: `displayHeadingLgClasses` for panel / empty-state headings,
 * `displayHeadingXlClasses` for page titles. There is no separate display
 * face — `font-display` resolves to the one sans, so headings differ from body
 * by size and tracking only. These are class recipes, not components — the
 * call site keeps whichever heading element is semantic.
 */
export const displayHeadingLgClasses = 'text-foreground text-lg font-semibold tracking-[-0.01em]';
export const displayHeadingXlClasses = 'text-foreground text-xl font-semibold tracking-[-0.02em]';

/** Section heading (card / block level). */
export function SectionTitle({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'>>) {
  return (
    <h2 {...props} className={cn('text-foreground text-lg font-semibold', className)}>
      {children}
    </h2>
  );
}

/** Sentence-case micro-label (the same recipe as `eyebrowClasses`). */
export function Label({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn(eyebrowClasses, className)}>
      {children}
    </span>
  );
}

/** Mono metric value with tabular numerals. */
export function Metric({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('mono text-foreground', className)}>
      {children}
    </span>
  );
}
