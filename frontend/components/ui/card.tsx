import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import { cardClasses, type CardTone } from './card-variants';

/**
 * Card is reserved for a meaningful semantic object. It owns a white fill, the
 * card radius and a hairline border, with no elevation — elevation belongs to
 * overlays. Structural layout uses metric groups, ledgers, editorial sections,
 * and workspace panes.
 *
 * Optional eyebrow header hook: render <CardEyebrow> above <CardTitle> for the
 * micro-label — e.g.
 *   <CardHeader><CardEyebrow>Visibility score</CardEyebrow><CardTitle>…
 */
export function Card({
  children,
  className,
  tone = 'default',
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'> & { tone?: CardTone }>) {
  return (
    <section {...props} className={cn(cardClasses(tone), className)}>
      {children}
    </section>
  );
}

/**
 * CardHeader — no bottom rule by default (the editorial language separates the
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
        'flex flex-col gap-1 p-[var(--card-padding-large)] pb-2',
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
    <h3 {...props} className={cn('font-display text-foreground text-lg font-medium', className)}>
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
    <p {...props} className={cn('text-muted text-sm leading-relaxed', className)}>
      {children}
    </p>
  );
}

/**
 * `flush` drops the inset for content that owns its own edges — a table, a
 * scrolling list — so the card's padding is a mode rather than something the
 * call site cancels with `p-0`.
 */
export function CardContent({
  children,
  className,
  flush,
  ...props
}: Readonly<ComponentPropsWithoutRef<'div'> & { children: ReactNode; flush?: boolean }>) {
  return (
    <div {...props} className={cn(flush ? '' : 'p-[var(--card-padding-large)]', className)}>
      {children}
    </div>
  );
}

/**
 * CardFooter — the action bar at the foot of a card: a tonal band hung off a
 * hairline, holding the card's one action. Pair it with `CardGrid` so the bars
 * land on the same baseline across a row instead of floating at the bottom of
 * whichever card had the most content.
 *
 * `mt-auto` is what pins it: the card is a column, so the footer takes the
 * slack rather than sitting immediately under the content.
 */
export function CardFooter({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'footer'>>) {
  return (
    <footer
      {...props}
      className={cn(
        'border-border-subtle bg-panel-tonal mt-auto flex items-center justify-between gap-2 border-t px-[var(--card-padding-large)] py-3',
        className,
      )}
    >
      {children}
    </footer>
  );
}
