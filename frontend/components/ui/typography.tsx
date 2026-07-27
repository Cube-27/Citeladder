import type { ComponentPropsWithoutRef } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Heading recipes: `displayHeadingLgClasses` for panel / empty-state headings
 * (the ADS `font.heading.medium` rung — 20/24 @500), `displayHeadingXlClasses`
 * for page titles (ADS `font.heading.large` — 24/28 @500). There is no
 * separate display face, so headings differ from body by size and weight only,
 * and both rungs bake their weight into the `--text-*` token. These are class
 * recipes, not components — the call site keeps whichever heading element is
 * semantic.
 */
export const displayHeadingLgClasses = 'text-foreground text-lg';
export const displayHeadingXlClasses = 'text-foreground text-xl';

/** Section heading (card / block level). */
export function SectionTitle({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'>>) {
  return (
    <h2 {...props} className={cn('text-foreground text-heading-sm', className)}>
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
