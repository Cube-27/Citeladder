import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Card (§8) — bg-panel, hairline border, --radius-lg, --card-padding. Flat:
 * separation comes from the 1px border, never a shadow.
 * Composed from header / title / description / content slots.
 *
 * Optional eyebrow header hook: render <CardEyebrow> above <CardTitle> for the
 * quiet sans micro-label — e.g.
 *   <CardHeader><CardEyebrow>Visibility score</CardEyebrow><CardTitle>…
 */ export function Card({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'>>) {
  return (
    <section {...props} className={cn('border-border bg-panel rounded-lg border', className)}>
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
        'flex flex-col gap-0.5 p-[var(--card-padding)]',
        bordered && 'border-border-subtle border-b',
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
    <h3
      {...props}
      className={cn('text-foreground text-lg font-semibold tracking-[-0.01em]', className)}
    >
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
    <p {...props} className={cn('text-muted text-xs', className)}>
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
