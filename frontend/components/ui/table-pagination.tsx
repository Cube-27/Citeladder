'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

export { useTablePage } from './pager';

/**
 * Table pagination: a "from–to of total" page indicator (sans label, tabular-nums
 * numerals) plus ghost Prev/Next buttons, pinned to the table card's bottom
 * border. Shared by the runs and prompts tables; page state is `useTablePage`.
 */
export function TablePagination({
  page,
  pageCount,
  from,
  to,
  total,
  noun,
  onPageChange,
}: Readonly<{
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  /** Row noun for the indicator, e.g. "runs" / "prompts". */
  noun: string;
  onPageChange: (page: number) => void;
}>) {
  return (
    <div className="border-border flex items-center justify-between gap-2 border-t px-[var(--table-cell-padding-x)] py-2">
      <span className="type-caption">
        <span className="tabular-nums">
          {from}–{to}
        </span>{' '}
        of <span className="tabular-nums">{total}</span> {noun}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Prev
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
