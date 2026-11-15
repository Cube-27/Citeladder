import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { StateHeadingLevelContext } from '@/components/ui/state-block';

/**
 * Card — the resting container: a `surface` box on the page ground that
 * groups one thing (a chart, a table, a form), edged by one 1px `line` border
 * and no shadow, since nothing at rest is lifted. `radius-lg` and the card's
 * inset on the box itself, so content that owns its edges (a table, a
 * scrolling list) sits in the same inset as text.
 *
 * Cards never nest and never take a coloured edge or fill; what groups inside
 * a card is an inset (`panelClasses`) or a divider. The card sets no display
 * of its own: a flex column would re-flow every card and put an overflow
 * boundary between a sticky child and its scroll container.
 */
const CARD_FACE = 'bg-surface text-ink border-rule rounded-card border';

/** The card, for a semantic element that is not a `section` (a list item, a link). */
const cardClasses = () => cn('surface-card p-[var(--card-padding)]', CARD_FACE);

export function Card({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'>>) {
  return (
    <section {...props} className={cn(cardClasses(), className)}>
      {/* Under the card's h3 title, a block empty state's heading is an h3. */}
      <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
    </section>
  );
}

/**
 * CardHeader — the eyebrow, title and description on the left and `actions`
 * (a secondary or ghost Button, a Badge, a small control group) on the same
 * row at the right; when the row is too narrow the actions wrap below the
 * title rather than squeezing it. Title and description are one fact, 4
 * apart. When the card has more content the header closes with a hairline
 * across the card's full width: the header pads 16 above the rule and the
 * body starts 16 below it (the card inset on both sides), with no other
 * margin across the rule.
 */
const HEADER_RULE =
  'not-last:-mx-[var(--card-padding)] not-last:mb-[var(--card-padding)] not-last:border-b not-last:border-rule not-last:px-[var(--card-padding)] not-last:pb-[var(--card-padding)]';

export function CardHeader({
  children,
  className,
  actions,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'header'> & {
    /** Trailing controls or status on the title row; wraps below when narrow. */
    actions?: ReactNode;
  }
>) {
  if (!actions) {
    return (
      <header {...props} className={cn('flex flex-col gap-1', HEADER_RULE, className)}>
        {children}
      </header>
    );
  }
  return (
    <header
      {...props}
      className={cn('flex flex-wrap items-start justify-between gap-2', HEADER_RULE, className)}
    >
      <div className="grid min-w-0 flex-1 basis-60 gap-1">{children}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}

/** CardEyebrow — the mono uppercase label above a CardTitle; never a heading. */
export function CardEyebrow({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('type-screen-label', className)}>
      {children}
    </span>
  );
}
