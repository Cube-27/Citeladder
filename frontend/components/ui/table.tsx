import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Dense analytics table — the shared semantic ledger treatment:
 *  - the wrapper is the table's shell: the elevated panel fill at the card
 *    radius, borderless, so a bare table reads as a card the way a Card does
 *  - sticky header (--table-header-height) on a tonal panel fill with a
 *    single object-rung under-rule, so the labels separate from the rows by
 *    the hairline alone; no vertical column-separator hairlines, which made
 *    the tables read as spreadsheets rather than designed surfaces
 *  - --table-row-height rows, --text-sm cells, subtle ROW hairlines only
 *  - data columns are centre-aligned and tabular; text columns stay left.
 *    The header centres with its values, so a column reads as one block
 *    rather than a label floating off the numbers beneath it
 *  - hover uses the surface's hover tint; `highlight` uses the distinct
 *    selected tint for the user's own row
 * The wrapper is scroll-capable so the sticky header pins on vertical scroll;
 * the scroll clip also keeps the pinned header inside the shell's radius. On
 * the white workspace sheet its boundary is the `table-frame` hairline ring
 * (an outer shadow, so it never changes the box); inside a Card the ring drops
 * and the flush fill melts into the card.
 *
 * Column headers take the `label` role (14/20, 500, secondary): a header names the
 * values beneath it, exactly as a metric label does.
 */
const tableHeadClasses = 'type-label whitespace-nowrap';
const TABLE_MIN_WIDTH = {
  sm: 'min-w-[var(--table-min-width-sm)]',
  md: 'min-w-[var(--table-min-width-md)]',
  lg: 'min-w-[var(--table-min-width-lg)]',
  xl: 'min-w-[var(--table-min-width-xl)]',
} as const;

export type TableMinWidth = keyof typeof TABLE_MIN_WIDTH;

export function Table({
  children,
  className,
  minWidth,
  wrapperClassName,
  wrapperRef,
}: Readonly<{
  children: ReactNode;
  className?: string;
  /** Below this width the table scrolls in its frame instead of squeezing. */
  minWidth?: TableMinWidth;
  wrapperClassName?: string;
  wrapperRef?: Ref<HTMLDivElement>;
}>) {
  return (
    <div
      ref={wrapperRef}
      className={cn(
        'table-frame bg-panel relative w-full max-w-full min-w-0 overflow-auto rounded-[var(--radius-card)]',
        wrapperClassName,
      )}
    >
      <table
        className={cn(
          'type-body w-full border-collapse',
          minWidth && TABLE_MIN_WIDTH[minWidth],
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <thead {...props} className={cn(className)}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <tbody {...props} className={cn(className)}>
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className,
  highlight,
  density = 'compact',
  ...props
}: Readonly<
  HTMLAttributes<HTMLTableRowElement> & { highlight?: boolean; density?: 'compact' | 'multiline' }
>) {
  return (
    <tr
      {...props}
      className={cn(
        'hover:bg-hover active:bg-active aria-selected:bg-selected aria-selected:hover:bg-selected h-[var(--table-row-height)] transition-colors',
        density === 'multiline' && '[&>td]:py-3',
        highlight && 'bg-selected hover:bg-selected',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className,
  numeric,
  ...props
}: Readonly<ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean | 'end' }>) {
  return (
    <th
      {...props}
      className={cn(
        tableHeadClasses,
        'aria-[sort=ascending]:text-foreground aria-[sort=descending]:text-foreground',
        'border-border bg-panel-tonal sticky top-0 z-10 h-[var(--table-header-height)] border-b px-[var(--table-cell-padding-x)] text-left align-middle',
        numeric && 'tabular-nums',
        numeric === 'end' ? 'text-right' : numeric && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  numeric,
  ...props
}: Readonly<TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean | 'end' }>) {
  return (
    <td
      {...props}
      className={cn(
        'type-body text-foreground border-border-subtle px-[var(--table-cell-padding-x)] py-[var(--table-cell-padding-y)] text-left align-middle',
        // Row rule, dropped on the last row.
        'border-b [tr:last-child>&]:border-b-0',
        numeric && 'tabular-nums',
        numeric === 'end' ? 'text-right' : numeric && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Numeric table cell that becomes a labelled key/value row below `md`. */
export function TableRecordMetricCell({
  children,
  className,
  label,
  ...props
}: Readonly<Omit<TdHTMLAttributes<HTMLTableCellElement>, 'data-label'> & { label: string }>) {
  return (
    <TableCell
      {...props}
      numeric
      data-label={label}
      className={cn(
        'grid grid-cols-[1fr_auto] gap-3 border-b-0 px-4 py-1 type-label-before before:text-left before:content-[attr(data-label)]',
        'md:table-cell md:border-b md:px-[var(--table-cell-padding-x)] md:py-[var(--table-cell-padding-y)] md:before:hidden',
        className,
      )}
    >
      {children}
    </TableCell>
  );
}

/** The header aligns with its column's values, as `TableHead` does. */
const SORT_ALIGN = {
  start: { column: 'items-start', row: 'justify-start text-left' },
  center: { column: 'items-center', row: 'justify-center text-center' },
  end: { column: 'items-end', row: 'justify-end text-right' },
} as const;

/**
 * A sortable column header: a real button inside the `th`, `aria-sort` on the
 * `th` (it describes the column, and that is where a screen reader looks for
 * it), the glyph after the label.
 *
 * The active column takes primary ink (the header row's own `aria-sort` rule)
 * and the glyph is muted until active. The
 * button's name is the visible label (plus the sublabel when present), so it
 * is pressed with Enter or Space like any other button.
 */
export function SortableTableHead({
  label,
  active,
  descending,
  onSort,
  numeric,
  sublabel,
  hint,
  className,
}: Readonly<{
  label: string;
  /** This column is the current sort key. */
  active: boolean;
  /** The current order; read only when `active`. */
  descending: boolean;
  onSort: () => void;
  numeric?: boolean | 'end';
  /** A qualifier under the label, e.g. the comparison window. */
  sublabel?: string;
  /** The column's shared caveat, behind a tooltip on the header. */
  hint?: string;
  className?: string;
}>) {
  // An inactive column has no order: no `aria-sort` and the neutral glyph, so
  // the announcement and the arrow can never drift apart.
  let ariaSort: 'ascending' | 'descending' | undefined;
  let Icon = ArrowUpDown;
  if (active) {
    ariaSort = descending ? 'descending' : 'ascending';
    Icon = descending ? ArrowDown : ArrowUp;
  }
  let align: (typeof SORT_ALIGN)[keyof typeof SORT_ALIGN] = SORT_ALIGN.start;
  if (numeric === 'end') align = SORT_ALIGN.end;
  else if (numeric) align = SORT_ALIGN.center;
  const button = (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'focus-ring inline-flex w-full flex-col gap-0.5 rounded-xs transition-colors',
        align.column,
        !active && 'hover:text-foreground',
      )}
    >
      <span className={cn('inline-flex w-full items-center gap-1', align.row)}>
        <span className="truncate">{label}</span>
        <Icon className={cn('size-3 shrink-0', !active && 'text-muted')} aria-hidden />
      </span>
      {sublabel ? (
        <span className={textRole('caption', 'max-w-full truncate')} title={sublabel}>
          {sublabel}
        </span>
      ) : null}
    </button>
  );
  return (
    <TableHead numeric={numeric} aria-sort={ariaSort} className={className}>
      {hint ? <Tooltip content={hint}>{button}</Tooltip> : button}
    </TableHead>
  );
}
