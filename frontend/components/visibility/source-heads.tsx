'use client';

import { Pressable } from '@/components/ui/pressable';
import { TableHead } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SortState } from '@/lib/visibility/sources';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

/**
 * The two column headers the source tables are built from.
 *
 * Beside the tables rather than inside them: both tables use both, and a
 * header is where a column's shared caveat is said -- once, instead of once
 * per cell that lacks a value.
 */

/**
 * A column header that can reorder the table.
 *
 * The sort indicator is always present, not only on the active column: a
 * header that grows an arrow on hover gives no sign it is sortable until the
 * pointer is already on it, which is invisible to anyone navigating by
 * keyboard.
 */
export function SortableHead({
  column,
  label,
  sort,
  onSort,
  numeric,
  hint,
  className,
}: Readonly<{
  column: string;
  label: string;
  sort: SortState;
  onSort: (column: string) => void;
  numeric?: boolean;
  hint?: string;
  className?: string;
}>) {
  const active = sort?.column === column;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const heading = (
    <Pressable
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      className={cn(
        'hover:text-primary inline-flex items-center gap-1 transition-colors',
        // A data column centres its label over its values, so the two read as
        // one block. `flex-row-reverse` used to push the sort glyph against
        // the right padding edge, which left the label sitting off the
        // numbers by the width of the icon plus its gap.
        numeric ? 'w-full justify-center text-center' : 'w-auto text-left',
        active && 'text-primary',
      )}
    >
      <Icon className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      <span>{label}</span>
    </Pressable>
  );
  return (
    <TableHead
      numeric={numeric}
      // On the header cell, not on the button inside it: `aria-sort` describes
      // the COLUMN, and a screen reader looks for it on the `th`.
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={className}
    >
      {hint ? <Tooltip content={hint}>{heading}</Tooltip> : heading}
    </TableHead>
  );
}

/**
 * A plain column label, with the column's own caveat behind a tooltip.
 *
 * The place a shared reason belongs. "Not every page has been read" is one
 * fact about the column, and printing it into every cell that lacks a value
 * says it twenty times to make the point once.
 */
export function HintedHead({
  label,
  hint,
  className,
}: Readonly<{ label: string; hint: string; className?: string }>) {
  return (
    <TableHead className={className}>
      <Tooltip content={hint}>
        <Pressable className="w-auto cursor-default">{label}</Pressable>
      </Tooltip>
    </TableHead>
  );
}
