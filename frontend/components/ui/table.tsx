import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Dense analytics table — the shared semantic ledger treatment:
 *  - the wrapper is the table's shell: the elevated panel fill at the card
 *    radius, borderless, so a bare table reads as a card the way a Card does
 *  - sticky header (--table-header-height) on the same panel fill with a
 *    single object-rung under-rule, so the labels separate from the rows by
 *    the hairline alone; no vertical column-separator hairlines, which made
 *    the tables read as spreadsheets rather than designed surfaces
 *  - --table-row-height rows, --text-sm cells, subtle ROW hairlines only
 *  - data columns are centre-aligned and tabular; text columns stay left.
 *    The header centres with its values, so a column reads as one block
 *    rather than a label floating off the numbers beneath it
 *  - hover tints the row with `active`; `highlight` marks the user's own row
 *    with the same tint permanently
 * The wrapper is scroll-capable so the sticky header pins on vertical scroll;
 * the scroll clip also keeps the pinned header inside the shell's radius. It
 * draws NO edge of its own: fill contrast against the ground is the boundary,
 * and inside a Card the flush fill melts into it.
 *
 * Column headers take the `label` role (13/18, 500, muted): a header names the
 * values beneath it, exactly as a metric label does.
 */
const tableHeadClasses = 'type-label whitespace-nowrap';
export function Table({
  children,
  className,
  wrapperClassName,
  wrapperRef,
}: Readonly<{
  children: ReactNode;
  className?: string;
  wrapperClassName?: string;
  wrapperRef?: Ref<HTMLDivElement>;
}>) {
  return (
    <div
      ref={wrapperRef}
      className={cn(
        'bg-panel relative w-full max-w-full min-w-0 overflow-auto rounded-[var(--radius-card)]',
        wrapperClassName,
      )}
    >
      <table className={cn('type-body w-full border-collapse', className)}>{children}</table>
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
  ...props
}: Readonly<HTMLAttributes<HTMLTableRowElement> & { highlight?: boolean }>) {
  return (
    <tr
      {...props}
      className={cn(
        'hover:bg-active h-[var(--table-row-height)] transition-colors',
        highlight && 'bg-active',
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
}: Readonly<ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }>) {
  return (
    <th
      {...props}
      className={cn(
        tableHeadClasses,
        'border-border bg-panel sticky top-0 z-10 h-[var(--table-header-height)] border-b px-[var(--table-cell-padding-x)] text-left align-middle',
        numeric && 'text-center tabular-nums',
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
}: Readonly<TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }>) {
  return (
    <td
      {...props}
      className={cn(
        'type-body text-foreground border-border-subtle px-[var(--table-cell-padding-x)] py-[var(--table-cell-padding-y)] text-left align-middle',
        // Row rule, dropped on the last row.
        'border-b [tr:last-child>&]:border-b-0',
        numeric && 'text-center tabular-nums',
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
