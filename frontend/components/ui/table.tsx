import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * Dense analytics table (§8) — the flat/hairline grid look:
 *  - sticky 30px header (--table-header-height) on bg-panel, ruled top and
 *    bottom, cells separated by a left hairline (all but the first)
 *  - 42px rows (--table-row-height), --text-sm cells, subtle cell hairlines
 *  - everything left-aligned (including numeric columns — the mock aligns the
 *    column edge, not the digits); `numeric` still applies tabular numerals
 *  - hover tints the row with background-alt; `highlight` marks the user's
 *    own row with the same tint permanently
 * The wrapper is scroll-capable so the sticky header pins on vertical scroll.
 */
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
    <div ref={wrapperRef} className={cn('relative w-full overflow-auto', wrapperClassName)}>
      <table
        className={cn('w-full border-collapse text-[length:var(--table-font-size)]', className)}
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
  ...props
}: Readonly<HTMLAttributes<HTMLTableRowElement> & { highlight?: boolean }>) {
  return (
    <tr
      {...props}
      className={cn(
        'hover:bg-background-alt h-[var(--table-row-height)] transition-colors',
        highlight && 'bg-background-alt',
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
        eyebrowClasses,
        'border-border bg-panel sticky top-0 z-10 h-[var(--table-header-height)] border-y px-3 text-left align-middle',
        // Column separators: every cell but the first carries a left hairline.
        'first:border-l-0 [&:not(:first-child)]:border-l',
        numeric && 'tabular-nums',
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
        'text-foreground border-border-subtle text-sm px-3 py-0 text-left align-middle',
        // Row rule, dropped on the last row; column separators as in the head.
        'border-b [tr:last-child>&]:border-b-0',
        'first:border-l-0 [&:not(:first-child)]:border-l',
        numeric && 'tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}
