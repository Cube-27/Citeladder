import { ArrowDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The column headers that carry behaviour, on `TableHead`'s geometry: a
 * header with its column's shared caveat, and a sortable header.
 */

type HeadOptions = { numeric?: boolean; desktopOnly?: boolean };

/**
 * A plain column label with the column's shared caveat behind a tooltip —
 * the unsortable twin of `SortableTableHead`'s `hint`. A shared reason is
 * said once, on the header, rather than once per cell that lacks a value.
 */
export function HintedTableHead({
  label,
  hint,
  numeric,
  desktopOnly,
}: Readonly<{ label: string; hint: string } & HeadOptions>) {
  // Like a plain header, a label longer than its column wraps under itself
  // instead of painting over the next header.
  return (
    <TableHead numeric={numeric} desktopOnly={desktopOnly} className="whitespace-normal">
      <Tooltip content={hint}>
        <button
          type="button"
          className="focus-ring rounded-mark inline-flex min-h-6 cursor-default items-center"
        >
          {label}
        </button>
      </Tooltip>
    </TableHead>
  );
}

/** The header aligns with its column's values, as `TableHead` does. */
const SORT_ALIGN = {
  start: { column: 'items-start', row: 'justify-start text-left' },
  end: { column: 'items-end', row: 'justify-end text-right' },
} as const;

/**
 * A sortable column header: a real button inside the `th`, `aria-sort` on the
 * `th` (it describes the column, and that is where a screen reader looks for
 * it), the glyph after the label.
 *
 * The active column takes primary ink (the header row's own `aria-sort` rule).
 * The one arrow holds its slot but shows only at half on hover or focus and
 * whole on the sorted column, turned up for ascending. The button's name is the visible label (plus the sublabel
 * when present), so it is pressed with Enter or Space like any other button.
 */
export function SortableTableHead({
  label,
  active,
  descending,
  onSort,
  numeric,
  sublabel,
  hint,
  desktopOnly,
  className,
}: Readonly<{
  desktopOnly?: boolean;
  label: string;
  /** This column is the current sort key. */
  active: boolean;
  /** The current order; read only when `active`. */
  descending: boolean;
  onSort: () => void;
  numeric?: boolean;
  /** A qualifier under the label, e.g. the comparison window. */
  sublabel?: string;
  /** The column's shared caveat, behind a tooltip on the header. */
  hint?: string;
  className?: string;
}>) {
  // An inactive column has no order: no `aria-sort` and the neutral glyph, so
  // the announcement and the arrow can never drift apart.
  let ariaSort: 'ascending' | 'descending' | undefined;
  if (active) ariaSort = descending ? 'descending' : 'ascending';
  const align = numeric ? SORT_ALIGN.end : SORT_ALIGN.start;
  const button = (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'focus-ring inline-flex min-h-6 w-full flex-col justify-center gap-0.5 rounded-mark transition-colors',
        align.column,
        !active && 'hover:text-ink',
      )}
    >
      {/* In an end-aligned column the glyph leads, so the label ends where the values end. */}
      <span
        className={cn(
          'inline-flex w-full items-center gap-1',
          // Reversed, the main axis starts at the end: `justify-start` packs it there.
          numeric ? 'flex-row-reverse justify-start text-right' : align.row,
        )}
      >
        <span className="truncate">{label}</span>
        <ArrowDown
          className={cn(
            'size-3 shrink-0 transition',
            active
              ? !descending && 'rotate-180'
              : 'opacity-0 group-hover:opacity-50 group-focus-within:opacity-50',
          )}
          aria-hidden
        />
      </span>
      {sublabel ? (
        <span className={textRole('caption', 'max-w-full truncate')} title={sublabel}>
          {sublabel}
        </span>
      ) : null}
    </button>
  );
  return (
    <TableHead
      numeric={numeric}
      desktopOnly={desktopOnly}
      aria-sort={ariaSort}
      className={cn('group', className)}
    >
      {hint ? <Tooltip content={hint}>{button}</Tooltip> : button}
    </TableHead>
  );
}
