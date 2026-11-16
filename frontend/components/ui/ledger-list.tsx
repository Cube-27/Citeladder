import type { ReactNode } from 'react';

import { ClampText } from '@/components/ui/clamp-text';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * LedgerList — a list of peers on hairlines, for records too few or too
 * varied for a DataTable (observed patterns, audit schedules, the evidence
 * on a card): each item is a row with its title, the facts that describe it
 * at the row's end, an optional caption and a line of links. The title and
 * caption stay on one line (the whole text in a tooltip). An `action` sits at
 * the row's end, centred on its lines (Resume on a schedule). Rows are 8 above
 * and 8 below an inset hairline between rows; every row
 * tints on hover as a reading aid, like a table row. A page passes content,
 * never geometry.
 */
export function LedgerList({
  label,
  ordered = false,
  children,
}: Readonly<{
  /** The list's accessible name when no heading beside it names it. */
  label?: string;
  /** The order of the items means something (ranked, by date). */
  ordered?: boolean;
  children: ReactNode;
}>) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List aria-label={label} data-ledger-list="" className="grid min-w-0">
      {children}
    </List>
  );
}

export function LedgerItem({
  title,
  meta,
  caption,
  links,
  action,
}: Readonly<{
  /** What the row is, in a sentence or a name: the row's first read. */
  title: ReactNode;
  /** Facts at the row's end: a Value, a StatusMark, a date. */
  meta?: ReactNode;
  /** One caption line under the title. */
  caption?: ReactNode;
  /** The row's links or secondary actions, on one wrapping line under it. */
  links?: ReactNode;
  /** One control at the row's end, centred across the row's lines. */
  action?: ReactNode;
}>) {
  const text = (
    <>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <ClampText className={textRole('body', 'flex-[1_1_15rem]')}>{title}</ClampText>
        {meta === undefined ? null : <div className="flex shrink-0 items-center gap-2">{meta}</div>}
      </div>
      {caption === undefined ? null : <ClampText className="type-caption">{caption}</ClampText>}
      {links === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">{links}</div>
      )}
    </>
  );
  return (
    <li
      data-ledger-item=""
      className={cn(
        // It bleeds 12 past the list, so its text starts on the card's padding.
        '-mx-3 min-w-0 px-3 py-2',
        action === undefined ? 'grid gap-1' : 'flex items-center gap-4',
        'hover:overlay-hover transition-colors duration-[var(--motion-fast)]',
      )}
    >
      {action === undefined ? (
        text
      ) : (
        <>
          <div className="grid min-w-0 flex-1 gap-1">{text}</div>
          <div className="shrink-0">{action}</div>
        </>
      )}
    </li>
  );
}
