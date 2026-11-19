import type { ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import { POP_FACE } from '@/components/ui/slip';

/**
 * Shared editorial structures for authenticated analytical workspaces. Key
 * figures are a `FigureStrip` (`figure-strip.tsx`), not a recipe here.
 */

/**
 * The ledger: a vertical list of peers separated by rules rather than boxed
 * individually. Six different wrappers existed for this one idea — borderless,
 * hung off a rule, and boxed at two different radii — so the same list of
 * evidence rows looked like a different component on each screen. The list
 * sits on whatever container already holds it and is never outlined: a
 * container never holds a second bordered box.
 */
export function ledgerClasses(className?: string) {
  return cn('divide-rule grid divide-y', className);
}

/**
 * One row of a ledger: 12 above and below the rule between rows, flush at
 * the list's own edges so the first and last rows meet the container's inset.
 * The row's inner layout (an `Inline` or a `Stack`) is the caller's anatomy;
 * the rhythm between rows is this recipe's.
 */
export function ledgerItemClasses(className?: string) {
  return cn('min-w-0 py-3 first:pt-0 last:pb-0', className);
}

/**
 * The sunken inset: a shared fact inside a card that is not one of its rows
 * (the element several affected pages share, over the pages themselves).
 * 12 down, 16 across, its lines 4 apart; inside a card it is the sunken fill
 * with no edge, so the card stays the only bordered surface.
 */
export function insetClasses(className?: string) {
  return cn('surface-inset grid min-w-0 gap-1 rounded-control px-4 py-3', className);
}

/**
 * One level of a tree (a page hierarchy): its items 8 apart, hung off a
 * hairline and indented 16 from their parent, so depth reads as indentation
 * and the rule shows which parent a branch belongs to. Nest a branch inside
 * an item for the next level.
 */
export function treeBranchClasses(className?: string) {
  return cn('border-rule grid min-w-0 gap-2 border-l pl-4', className);
}

/**
 * The provenance line that closes a block: when it was captured, where, by
 * what — caption facts on one wrapping line, 16 apart, under a hairline 12
 * above them. `trailing` (a status, a note) sits at the line's end and wraps
 * under the facts when the line is full.
 */
export function MetaFooter({
  children,
  trailing,
}: Readonly<{ children: ReactNode; trailing?: ReactNode }>) {
  if (!trailing)
    return (
      <footer className="type-caption border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        {children}
      </footer>
    );
  return (
    <footer className="type-caption border-rule flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
      {trailing}
    </footer>
  );
}

/**
 * The heading of a block inside a section or card: a label, one line of
 * caption under it, and an optional trailing fact (a count) or control on the
 * label's row. The label/caption pair is 4 apart, like every label and the
 * value it names.
 */
export function SubsectionHeader({
  title,
  description,
  trailing,
  headingId,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Target for the block's `aria-labelledby`. */
  headingId?: string;
}>) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span id={headingId} className={textRole('body', 'text-ink-2')}>
          {title}
        </span>
        {trailing}
      </div>
      {description ? <p className="type-caption">{description}</p> : null}
    </div>
  );
}

/**
 * The section header for an authenticated screen: an optional meta label, the
 * title, one line of description, and the section's actions on the same row.
 *
 * Sections are separated by the page's section gap, never by a rule above the
 * header.
 */
export function EditorialSectionHeader({
  title,
  headingId,
  description,
  actions,
  className,
}: Readonly<{
  title: ReactNode;
  /** Target for the section's `aria-labelledby`. */
  headingId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="grid gap-1">
        <h2 id={headingId} className={textRole('heading')}>
          {title}
        </h2>
        {description ? (
          <p className={textRole('body', 'text-ink-2 max-w-[72ch]')}>{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

/**
 * The editing controls that float over a widget's top-end corner while its
 * layout is being edited: a cluster of `IconButton`s lifted off the widget
 * like a menu (the menu surface and shadow), hugging the controls with a 4px
 * inset and 4 between them (the floating face). Each control names the widget it acts on. The
 * widget it sits on must be `relative`.
 */
export function FloatingToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={cn(POP_FACE, 'absolute end-3 top-3 z-10 flex gap-1 p-1')}>{children}</div>;
}
