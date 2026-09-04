'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { cn } from '@/lib/utils';

/**
 * The shared footer for every cursor-paged table: rows-per-page, the visible
 * range against the total, and compact previous/next arrows.
 *
 * Deliberately separate from `TablePagination`, which serves offset tables
 * that already hold the whole result set and can therefore render a page
 * count. A keyset table knows only whether ANOTHER page exists, so this
 * footer offers direction, never a jump target — there is no honest page
 * count to show without a `COUNT(*)` on every navigation.
 *
 * `total` is optional because it must be a persisted count, never a live one.
 * A view that has one shows "1–10 of 412"; a filtered view without one shows
 * the range alone rather than an invented total.
 */
export function CursorTableFooter({
  from,
  to,
  total,
  noun,
  pageSize,
  onPageSizeChange,
  canPrev,
  canNext,
  onPrev,
  onNext,
  busy = false,
  className,
}: Readonly<{
  from: number;
  to: number;
  /** Exact persisted total, or undefined when no exact count exists. */
  total?: number;
  /** Row noun for the indicator, e.g. "queries" / "pages". */
  noun: string;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Disables navigation while a page is in flight. */
  busy?: boolean;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'border-border-subtle flex flex-wrap items-center justify-between gap-3 border-t px-[var(--table-cell-padding-x)] py-2',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <label className="text-muted text-xs" htmlFor={`${noun}-rows-per-page`}>
          Rows per page
        </label>
        <Select
          id={`${noun}-rows-per-page`}
          ariaLabel={`Rows per page for ${noun}`}
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          options={TABLE_PAGE_SIZE_OPTIONS.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          className="w-20"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted mr-1 text-xs" aria-live="polite">
          <span className="mono">
            {from}–{to}
          </span>
          {total === undefined ? null : (
            <>
              {' of '}
              <span className="mono">{total.toLocaleString()}</span>
            </>
          )}{' '}
          {noun}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          disabled={!canPrev || busy}
          onClick={onPrev}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={!canNext || busy}
          onClick={onNext}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
