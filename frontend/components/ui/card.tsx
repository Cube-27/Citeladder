import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Card (§8) — bg-panel, hairline border, --radius-md (8px, the ADS surface
 * rung; 12px is reserved for modals), --card-padding.
 * Composed from header / title / description / content slots.
 *
 * FLAT 2.0: a card is a plain --bg-panel fill on the canvas with one 1px
 * alpha hairline. It casts NO shadow, and there is no elevation prop — the
 * previous `default: shadow-card` / `raised: shadow-elevated` ladder is
 * gone, along with the reasoning that panel and base "differ by very little
 * fill". They no longer do: the canvas is --ds-surface-canvas and the card
 * is white, a ΔE76 of 4.66, so the tint step does the work the shadow used
 * to fake — measurably, this time (the Phase 1 canvas managed only 2.54,
 * below the 2.67 the shadow it deleted had provided).
 *
 * If a surface genuinely needs to float, it is an overlay — use Dialog,
 * Dropdown, Tooltip or the command palette, which own the one live shadow
 * rung. scripts/check-flat-elevation.mjs fails the build if a shadow lands
 * here again.
 *
 * Optional eyebrow header hook: render <CardEyebrow> above <CardTitle> for the
 * micro-label — e.g.
 *   <CardHeader><CardEyebrow>Visibility score</CardEyebrow><CardTitle>…
 */
export function Card({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'>>) {
  return (
    <section {...props} className={cn('border-border bg-panel rounded-md border', className)}>
      {children}
    </section>
  );
}

/**
 * CardHeader — no bottom rule by default (the flat language separates the
 * header from content with spacing alone). Pass `bordered` for the few
 * surfaces that genuinely need the hairline, e.g. a header sitting directly
 * atop a full-bleed table.
 */
export function CardHeader({
  children,
  className,
  bordered,
  ...props
}: Readonly<ComponentPropsWithoutRef<'header'> & { bordered?: boolean }>) {
  return (
    <header
      {...props}
      className={cn(
        'flex flex-col gap-1 p-[var(--card-padding)] pb-2',
        bordered && 'border-border-subtle border-b pb-3',
        className,
      )}
    >
      {children}
    </header>
  );
}

/**
 * CardEyebrow — optional micro-label for card headers. Pair with CardTitle;
 * never a heading element.
 */
export function CardEyebrow({
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

export function CardTitle({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h3'>>) {
  return (
    <h3 {...props} className={cn('text-foreground text-heading-sm', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'p'>>) {
  return (
    <p {...props} className={cn('text-muted text-sm', className)}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'div'> & { children: ReactNode }>) {
  return (
    <div {...props} className={cn('p-[var(--card-padding)]', className)}>
      {children}
    </div>
  );
}
