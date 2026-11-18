import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  TABLE_DEFAULT_PAGE_SIZE,
  TABLE_PAGE_SIZE_OPTIONS,
  isTablePageSize,
  type TablePageSize,
} from '@/lib/config/tables';
import { formatCount } from '@/lib/format';
import { useUrlState, type UrlCodec } from '@/lib/navigation/url-state';
import { cn } from '@/lib/utils';

/**
 * Pager — the one footer for a paged list or table: the range ("1–25 of
 * 312", tabular), the previous and next secondary icon buttons, then the
 * rows-per-page select when offered. An arrow at either end disables rather
 * than disappearing, so the pager keeps its place.
 *
 * Two modes, one component — the difference is what the caller knows:
 *
 *   - **Page-number** (an offset list that holds the whole result): pass
 *     `page` and `pageCount`, or a `range` with a `total`; use
 *     `pageNumberControls(page, pageCount, setPage)` for the four handlers.
 *   - **Cursor** (keyset): the caller holds a cursor stack and knows only
 *     whether another page exists. Pass `canPrev`/`canNext`, the visible
 *     `range` with `total` only when a persisted exact count exists (never a
 *     live `COUNT(*)`), or `page` for "Page N". `onFirst` adds a "First page"
 *     jump for a forward-only cursor that cannot step back one page.
 *
 * `hideWhenSinglePage` renders nothing when neither direction leads anywhere —
 * two permanently disabled buttons are noise. The summary is a polite live
 * region so the new position is announced after a page turn.
 */
type PagerRange = Readonly<{
  from: number;
  to: number;
  /** Exact persisted total, or undefined when no exact count exists. */
  total?: number;
  /** Row noun, e.g. "prompts". */
  noun: string;
}>;

type PagerPageSize = Readonly<{
  value: number;
  onChange: (size: number) => void;
}>;

type PagerProps = Readonly<{
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Cursor mode: jump back to the first page. */
  onFirst?: () => void;
  range?: PagerRange;
  /** One-based current page. */
  page?: number;
  /** Known page count (page-number mode). */
  pageCount?: number;
  /** Rows-per-page selector. */
  pageSize?: PagerPageSize;
  /** Disables navigation while a page is in flight. */
  busy?: boolean;
  hideWhenSinglePage?: boolean;
  className?: string;
}>;

/** The four handlers for a page-number list. */
export function pageNumberControls(
  page: number,
  pageCount: number,
  onPageChange: (page: number) => void,
) {
  return {
    page,
    pageCount,
    canPrev: page > 1,
    canNext: page < pageCount,
    onPrev: () => onPageChange(page - 1),
    onNext: () => onPageChange(page + 1),
  };
}

function PagerSummary({
  range,
  page,
  pageCount,
}: Readonly<{ range?: PagerRange; page?: number; pageCount?: number }>) {
  // Tabular figures hold every digit to one width, so the range does not
  // change width as the reader pages.
  const face = 'type-body text-ink pe-2 whitespace-nowrap tabular-nums';
  if (range) {
    // "1–25 of 312"; with no persisted total, the range alone, and the Next
    // button's state says whether another page exists.
    return (
      <output className={face}>
        {`${formatCount(range.from)}–${formatCount(range.to)}`}
        {range.total === undefined ? null : ` of ${formatCount(range.total)}`}
        <span className="sr-only">{` ${range.noun}`}</span>
      </output>
    );
  }
  if (!page) return null;
  return (
    <output className={face}>
      Page {page}
      {pageCount ? <span className="text-ink-2">{` of ${pageCount}`}</span> : null}
    </output>
  );
}

function PageSizeSelect({ pageSize, noun }: Readonly<{ pageSize: PagerPageSize; noun: string }>) {
  const id = useId();
  return (
    // The label is 4 from its select and 16 from the next group: one fact.
    <div className="flex items-center gap-1">
      <label className="text-caption text-ink-2" htmlFor={id}>
        Rows per page
      </label>
      <Select
        id={id}
        ariaLabel={`Rows per page for ${noun}`}
        value={String(pageSize.value)}
        onValueChange={(value) => pageSize.onChange(Number(value))}
        options={TABLE_PAGE_SIZE_OPTIONS.map((size) => ({
          value: String(size),
          label: String(size),
        }))}
        className="w-20 tabular-nums"
      />
    </div>
  );
}

function PagerSteps({
  canPrev,
  canNext,
  onPrev,
  onNext,
  onFirst,
  busy,
}: Readonly<
  Pick<PagerProps, 'canPrev' | 'canNext' | 'onPrev' | 'onNext' | 'onFirst'> & { busy: boolean }
>) {
  return (
    <div className="flex items-center gap-2">
      {onFirst ? (
        <Button variant="secondary" disabled={!canPrev || busy} onClick={onFirst}>
          First page
        </Button>
      ) : null}
      <IconButton
        variant="secondary"
        icon={ChevronLeft}
        label="Previous page"
        tooltip={false}
        disabled={!canPrev || busy}
        onClick={onPrev}
      />
      <IconButton
        variant="secondary"
        icon={ChevronRight}
        label="Next page"
        tooltip={false}
        disabled={!canNext || busy}
        onClick={onNext}
      />
    </div>
  );
}

export function Pager({
  range,
  page,
  pageCount,
  pageSize,
  busy = false,
  hideWhenSinglePage = false,
  className,
  ...steps
}: PagerProps) {
  if (hideWhenSinglePage && !steps.canPrev && !steps.canNext) return null;
  // One presentation: the range, previous and next, then rows per page.
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <div className="flex items-center gap-2">
        <PagerSummary range={range} page={page} pageCount={pageCount} />
        <PagerSteps {...steps} busy={busy} />
      </div>
      {pageSize ? <PageSizeSelect pageSize={pageSize} noun={range?.noun ?? 'rows'} /> : null}
    </div>
  );
}

/**
 * Page state for an offset-paged list, with clamp-only reconciliation: when
 * the underlying list shrinks (filters, deletes, polling refetches) the page
 * clamps into range instead of resetting, so a background refetch never yanks
 * the reader back to page 1. A new `resetKey` (the reader's filter or search)
 * goes back to page 1.
 *
 * With `urlKey` the page lives in the address like the filters, so reload and
 * Back return to it; the address keeps the asked page while the rows load.
 */
export function useTablePage(
  total: number,
  {
    pageSize,
    resetKey,
    urlKey,
  }: Readonly<{ pageSize: number; resetKey?: string; urlKey?: string }>,
) {
  const [localPage, setLocalPage] = useState(1);
  const [urlPage, setUrlPage] = useUrlState(urlKey ?? '', PAGE_CODEC);
  const page = urlKey ? urlPage : localPage;
  const setPage: (page: number) => void = urlKey ? setUrlPage : setLocalPage;
  const [pagedKey, setPagedKey] = useState(resetKey);
  if (pagedKey !== resetKey) {
    setPagedKey(resetKey);
    setLocalPage(1);
  }
  // The address is written after render, before paint: a new filter replaces the page.
  const lastKey = useRef(resetKey);
  useLayoutEffect(() => {
    if (lastKey.current === resetKey) return;
    lastKey.current = resetKey;
    if (urlKey) setUrlPage(1, 'replace');
  }, [resetKey, urlKey, setUrlPage]);
  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(1, Math.min(page, pageCount));
  const from = total === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const to = Math.min(total, safePage * safePageSize);
  return { page: safePage, setPage, pageCount, from, to };
}

/** A page number in the address; page 1, the default, is left out. */
const PAGE_CODEC: UrlCodec<number> = {
  parse: (raw) => {
    const page = Number(raw);
    return Number.isSafeInteger(page) && page > 1 ? page : 1;
  },
  serialize: (page) => (page > 1 ? String(page) : null),
};

const PAGE_SIZE_CODEC: UrlCodec<TablePageSize> = {
  parse: (raw) => {
    const size = Number(raw);
    return isTablePageSize(size) ? size : TABLE_DEFAULT_PAGE_SIZE;
  },
  serialize: (size) => (size === TABLE_DEFAULT_PAGE_SIZE ? null : String(size)),
};

/**
 * {@link useTablePage} with the reader's rows-per-page choice, which goes back
 * to page 1. With `urlKey` the choice is in the address too (`<urlKey>_size`).
 */
export function useResizableTablePage(
  total: number,
  { resetKey, urlKey }: Readonly<{ resetKey?: string; urlKey?: string }> = {},
) {
  const [localSize, setLocalSize] = useState<TablePageSize>(TABLE_DEFAULT_PAGE_SIZE);
  // One address write: the new size drops the page.
  const [urlSize, setUrlSize] = useUrlState(urlKey ? `${urlKey}_size` : '', PAGE_SIZE_CODEC, {
    clearKeys: urlKey ? [urlKey] : [],
  });
  const pageSize = urlKey ? urlSize : localSize;
  const pagination = useTablePage(total, { pageSize, resetKey, urlKey });
  const { setPage } = pagination;
  const pageSizeControl: PagerPageSize = {
    value: pageSize,
    onChange: (size) => {
      const next = isTablePageSize(size) ? size : TABLE_DEFAULT_PAGE_SIZE;
      if (urlKey) return setUrlSize(next);
      setLocalSize(next);
      setPage(1);
    },
  };
  return { ...pagination, pageSize, pageSizeControl };
}
