import { useLayoutEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';

import { LiveVerb, SkeletonBlock } from '@/components/ui/skeleton-block';
import { StateBlock, type StateBlockProps } from '@/components/ui/state-block';
import { TableBody, TableCell } from '@/components/ui/table';

/** A table read's state when it has no rows to show: loading, error, empty or filtered. */
export type DataTableState = Exclude<StateBlockProps, { inline: true }>;

/** The one-line empty state (`StateBlock` `inline`), for a small table. */
export type DataTableInlineEmpty = Extract<StateBlockProps, { inline: true }>;

export type RowLines = 1 | 2 | 3;

/**
 * The rows, with no blank rows after a short page (a reserved page keeps its
 * height as plain space); or, while loading, a page of block rows under the
 * real head; or a filter's empty state under the head.
 */
export function DataTableBody({
  cells,
  colSpan,
  state,
  pageSize,
  rowCount,
  rowLines,
  reserve,
  children,
}: Readonly<{
  /** Cells per row, the selection box and hidden columns counted. */
  cells: number;
  /** Shown columns, the selection box counted: what a full-row cell spans. */
  colSpan: number;
  state?: DataTableState | DataTableInlineEmpty;
  pageSize?: number;
  rowCount?: number;
  rowLines: RowLines;
  /** Hold the rest of the page as blank space. */
  reserve: boolean;
  children?: ReactNode;
}>) {
  if (state?.kind === 'loading') {
    return (
      <LoadingBody
        columns={cells}
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
            className="h-[calc(var(--data-table-rows)*var(--data-table-row))] align-top"
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
  const rest =
    reserve && pageSize !== undefined && rowCount !== undefined ? pageSize - rowCount : 0;
  // The held space is a body of its own, so the last real row stays the last
  // row of its body and draws no line, like any table's last row.
  return (
    <>
      <TableBody style={rowHeight(rowLines)}>{children}</TableBody>
      {rest > 0 ? (
        <TableBody>
          <tr // NOSONAR -- blank space holding a reserved page's height; nothing in it is focusable
            aria-hidden="true"
            data-table-spacer=""
            style={stateFootprint(rest, rowLines)}
          >
            <TableCell
              colSpan={colSpan}
              className="h-[calc(var(--data-table-rows)*var(--data-table-row))]"
            />
          </tr>
        </TableBody>
      ) : null}
    </>
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
              {row === 0 && cell === 0 ? <LiveVerb label={label} /> : null}
              <SkeletonBlock className="h-3 w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </TableBody>
  );
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

/**
 * Every row of a table of captioned rows is at least 56, a row without a
 * caption included, so the rows of one table never differ; a two-line title
 * grows only its own row.
 */
function rowHeight(rowLines: RowLines): CSSProperties | undefined {
  if (rowLines === 1) return undefined;
  return { '--table-row-height': ROW_HEIGHT[2] } as CSSProperties;
}

/** The custom properties a state or spacer cell's height reads: `rows` rows of `rowLines`. */
function stateFootprint(rows: number, rowLines: RowLines) {
  return {
    '--data-table-rows': rows,
    '--data-table-row': ROW_HEIGHT[rowLines],
  } as CSSProperties;
}

/** Rows a loading table without a page size draws. */
const LOADING_ROWS = 5;

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
