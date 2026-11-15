import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import type { DataTableColumn } from '@/components/ui/data-table-columns';
import { LiveVerb, SkeletonBlock } from '@/components/ui/skeleton';
import { StateBlock, type StateBlockProps } from '@/components/ui/state-block';
import { TableBody, TableCell, TableCellLines, TableFillerRows } from '@/components/ui/table';

/** A table read's state when it has no rows to show: loading, error, empty or filtered. */
export type DataTableState = Exclude<StateBlockProps, { inline: true }>;

/** The one-line empty state (`StateBlock` `inline`), for a small table. */
export type DataTableInlineEmpty = Extract<StateBlockProps, { inline: true }>;

export type RowLines = 1 | 2 | 3;

/**
 * The rows, padded to a full page; or, while loading, a page of block rows
 * under the real head; or a filter's empty state under the head.
 */
export function DataTableBody({
  colSpan,
  columns,
  state,
  pageSize,
  rowCount,
  rowLines,
  children,
}: Readonly<{
  colSpan: number;
  /** Cells per row, the selection box counted. */
  columns: number;
  state?: DataTableState | DataTableInlineEmpty;
  pageSize?: number;
  rowCount?: number;
  rowLines: RowLines;
  children?: ReactNode;
}>) {
  if (state?.kind === 'loading') {
    return (
      <LoadingBody
        columns={columns}
        label={state.label ?? 'Loading…'}
        rows={pageSize ?? LOADING_ROWS}
        rowLines={rowLines}
      />
    );
  }
  if (state) {
    return (
      <TableBody>
        <tr data-table-state="">
          <TableCell
            colSpan={colSpan}
            className="h-[max(var(--state-block-height),calc(var(--data-table-rows)*var(--data-table-row)))] align-top"
            style={stateFootprint(pageSize ?? 0, rowLines)}
          >
            <InFrame>
              <StateBlock {...state} />
            </InFrame>
          </TableCell>
        </tr>
      </TableBody>
    );
  }
  const filler = pageSize === undefined || rowCount === undefined ? 0 : pageSize - rowCount;
  return (
    <TableBody>
      {children}
      <TableFillerRows count={filler} colSpan={colSpan} spacer={blankLines(rowLines)} />
    </TableBody>
  );
}

/**
 * Loading: a page of rows of `well` blocks under the real column heads, one
 * block per cell at the row's own height, so arriving rows move nothing.
 */
function LoadingBody({
  columns,
  label,
  rows,
  rowLines,
}: Readonly<{ columns: number; label: string; rows: number; rowLines: RowLines }>) {
  const cells = Array.from({ length: columns }, (_, index) => index);
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <tr
          key={row}
          aria-hidden={row === 0 ? undefined : true}
          data-table-loading=""
          style={{ height: ROW_HEIGHT[rowLines] }}
        >
          {cells.map((cell) => (
            <td key={cell} className="px-[var(--table-cell-padding-x)]">
              {row === 0 && cell === 0 ? <LiveVerb label={label} hidden /> : null}
              <SkeletonBlock className="h-3 w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </TableBody>
  );
}

/** A blank row's lines: none for a one-line table, else a title over a caption. */
function blankLines(rowLines: RowLines) {
  return rowLines === 1 ? null : <TableCellLines primary={BLANK} secondary={BLANK} />;
}

/**
 * A state spans the visible frame, not the scroll width of a wide table, and
 * stays in view while the frame scrolls, so its text is never cut.
 */
function InFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="sticky start-[var(--table-cell-padding-x)] w-[calc(100cqi-2*var(--table-cell-padding-x))]">
      {children}
    </div>
  );
}

/** A row's height by its lines: 40 for one, 56 for a value over a caption, 76 for a two-line title. */
const ROW_HEIGHT = {
  1: 'var(--table-row-height)',
  2: 'var(--table-row-height-2)',
  3: 'calc(var(--table-row-height-2) + var(--text-body--line-height))',
} as const satisfies Record<RowLines, string>;

/** The custom properties a state cell's height reads: `rows` rows of `rowLines`. */
function stateFootprint(rows: number, rowLines: RowLines) {
  return {
    '--data-table-rows': rows,
    '--data-table-row': ROW_HEIGHT[rowLines],
  } as CSSProperties;
}

/** Rows a loading table without a page size draws. */
const LOADING_ROWS = 5;

/** A non-breaking space: a blank line that still takes a line's height. */
const BLANK = ' ';

/** Whether a cell holds an Absence and nothing else. */
function onlyAbsent(cell: Element): boolean {
  const absence = cell.querySelector('[data-absence]');
  return absence !== null && cell.textContent?.trim() === absence.textContent?.trim();
}

/**
 * The data columns (1-based, the selection box counted) in which every row's
 * cell is an Absence, so the table leaves them out; and whether that is every
 * data column, so the table gives way to its not-measured state. The
 * identity column and the actions column are never data columns.
 */
export function useAbsentColumns({
  ref,
  columns,
  selection,
  rows: rowsContent,
}: Readonly<{
  ref: RefObject<HTMLElement | null>;
  columns: readonly DataTableColumn[];
  selection: boolean;
  /** The rows the page passed: measured again whenever they change. */
  rows: ReactNode;
}>) {
  const [found, setFound] = useState({ hiddenCols: '', allAbsent: false });
  const offset = selection ? 2 : 1;
  const identity = Math.max(
    0,
    columns.findIndex((column) => column.kind === 'identity'),
  );
  const candidates = columns.flatMap((column, index) =>
    index === identity || column.kind === 'actions' ? [] : [index + offset],
  );
  const key = candidates.join(' ');
  useLayoutEffect(() => {
    const rows = [
      ...(ref.current?.querySelectorAll(
        ':scope > table > tbody > tr:not([data-table-state], [data-table-loading], [aria-hidden="true"])',
      ) ?? []),
    ];
    const hidden =
      rows.length === 0
        ? []
        : key
            .split(' ')
            .filter(Boolean)
            .map(Number)
            .filter((position) =>
              rows.every((row) => {
                const cell = row.children[position - 1];
                return cell !== undefined && onlyAbsent(cell);
              }),
            );
    const next = {
      hiddenCols: hidden.join(' '),
      allAbsent: hidden.length > 0 && hidden.length === key.split(' ').filter(Boolean).length,
    };
    setFound((current) =>
      current.hiddenCols === next.hiddenCols && current.allAbsent === next.allAbsent
        ? current
        : next,
    );
  }, [ref, key, rowsContent]);
  return found;
}

/**
 * The scroller's leading scroll padding equals the pinned columns' width, so
 * a cell focused by keyboard is scrolled clear of them (WCAG 2.4.11).
 */
export function usePinnedPadding(ref: RefObject<HTMLElement | null>, pinned: number) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || pinned === 0 || typeof ResizeObserver === 'undefined') return;
    const heads = [...node.querySelectorAll(':scope > table > thead > tr > *')].slice(0, pinned);
    const update = () => {
      const width = heads.reduce((sum, head) => sum + head.getBoundingClientRect().width, 0);
      node.style.scrollPaddingInlineStart = `${width}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    for (const head of heads) observer.observe(head);
    return () => observer.disconnect();
  }, [ref, pinned]);
}
