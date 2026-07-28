import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Card (§8) — bg-panel, BORDERLESS, --radius-lg (12px), --card-padding,
 * resting on the ADS raised shadow rung (`shadow-card`).
 * Composed from header / title / description / content slots.
 *
 * Elevation model (docs/design.md §4a): a card is a --bg-panel fill lifted
 * off the sunken canvas by `--ds-shadow-raised` — the same surface/shadow
 * pairing atlassian.design specifies for raised surfaces. Separation comes
 * from light (the shadow) and the canvas tint step, never from a drawn
 * border: like Gmail/Trello, cards carry no outline at all. Interactive
 * cards lift on hover — `hover:shadow-card-hover` (the overlay rung) plus
 * a 2px rise — which is why the base transition includes box-shadow.
 *
 * If a surface genuinely needs to float persistently, it is an overlay —
 * use Dialog, Dropdown, Tooltip or the command palette, which own the
 * `shadow-modal-value` rung. scripts/check-elevation.mjs enforces the
 * rung assignments.
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
    <section
      {...props}
      className={cn('bg-panel shadow-card rounded-lg transition-shadow duration-200', className)}
    >
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
