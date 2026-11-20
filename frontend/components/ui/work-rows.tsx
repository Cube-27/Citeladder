import type { ReactNode } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The table shell every app table takes (owner, 2026-11-19): a `well` shell
 * at the overlay radius holding the column heads, and the rows on a
 * `surface` panel inset 4 from its sides and foot.
 */
export const ROWS_SHELL =
  'rounded-overlay bg-[var(--table-head-ground)] px-[var(--table-inset)] pb-[var(--table-inset)]';
export const ROWS_PANEL = 'bg-surface rounded-card overflow-hidden';

/**
 * A tree leaf's work rows in the table shell: a column-head row, then
 * 56px rows of tick, title (with a muted line), scope, impact and source.
 * The columns are fixed, so no row moves another; below desktop, scope and
 * source fold away, and below 768 impact narrows to its word.
 */
const GRID =
  'grid grid-cols-[20px_1fr_120px] phone:grid-cols-[20px_1fr_72px] desktop:grid-cols-[20px_1fr_92px_120px_110px] items-center gap-3 phone:gap-2 px-4 phone:px-3';
const WIDE = 'hidden desktop:block';

export function WorkRows({
  label,
  heads,
  children,
  more,
}: Readonly<{
  label: string;
  /** The title, scope, impact and source heads. */
  heads: readonly [string, string, string, string];
  children: ReactNode;
  /** A "Show more" under the rows, if any. */
  more?: ReactNode;
}>) {
  const [title, scope, impact, source] = heads;
  return (
    <div className={ROWS_SHELL}>
      <table aria-label={label} className="block w-full">
        <thead className="block">
          <tr className={cn(GRID, textRole('captionStrong', 'text-ink-2 h-8'))}>
            <th aria-label="Select" />
            <th className="text-left">{title}</th>
            <th className={cn(WIDE, 'text-left')}>{scope}</th>
            <th className="text-left">{impact}</th>
            <th className={cn(WIDE, 'text-left')}>{source}</th>
          </tr>
        </thead>
        <tbody className={cn(ROWS_PANEL, 'block')}>{children}</tbody>
      </table>
      {/* Show more is a second inset panel under the rows, in the same shell. */}
      {more ? (
        <div className={cn(ROWS_PANEL, 'mt-[var(--table-inset)] *:border-t-0')}>{more}</div>
      ) : null}
    </div>
  );
}

/**
 * One work row. The title links to the item and stretches over the row, so
 * the row opens it; the tick sits above the link and only ticks.
 */
export function WorkRow({
  tick,
  href,
  title,
  caption,
  scope,
  impact,
  source,
}: Readonly<{
  tick: ReactNode;
  href: string;
  title: string;
  caption: string;
  scope: string;
  impact: ReactNode;
  source: string;
}>) {
  return (
    <tr
      className={cn(GRID, 'border-rule hover:overlay-hover relative min-h-10 not-first:border-t')}
    >
      <td className="relative z-10 flex">{tick}</td>
      <td className="min-w-0">
        <TextLink
          href={href}
          text="label"
          underline="hover"
          className="block truncate before:absolute before:inset-x-0 before:inset-y-0"
        >
          {title}
        </TextLink>
        <span className={textRole('caption', 'block truncate')}>{caption}</span>
      </td>
      <td className={cn(WIDE, textRole('caption', 'truncate tabular-nums'))}>{scope}</td>
      <td className={textRole('caption', 'flex')}>{impact}</td>
      <td className={cn(WIDE, textRole('caption', 'truncate'))}>{source}</td>
    </tr>
  );
}

/** "Show N more" under a box's rows: one 40px line, the same while the next rows load. */
export function WorkRowsMore({
  onClick,
  disabled,
  children,
}: Readonly<{ onClick: () => void; disabled: boolean; children: string }>) {
  return (
    <Pressable
      data-tree-row=""
      onClick={onClick}
      disabled={disabled}
      className={textRole(
        'body',
        'border-rule text-ink-2 hover:overlay-hover hover:text-ink flex h-10 items-center justify-center border-t tabular-nums',
      )}
    >
      {children}
    </Pressable>
  );
}
