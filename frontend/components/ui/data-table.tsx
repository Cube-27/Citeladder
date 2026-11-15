import { useId, useRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react';

import { BusyRung } from '@/components/ui/rung-meter';
import {
  columnsMinWidth,
  DataTableColumns,
  useFlexibleColumnCheck,
  type DataTableColumn,
  type DataTableSelection,
} from '@/components/ui/data-table-columns';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { Pager } from '@/components/ui/pager';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { ScrollEdgeFades, useScrollEdges } from '@/components/ui/scroll-edges';
import {
  Table,
  TableBody,
  TableCell,
  TableCellLines,
  TableFillerRows,
  TableTextLinesContext,
  TableTitleLinesContext,
  type TableMinWidth,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import {
  StateBlock,
  type StateBlockProps,
  StateHeadingLevelContext,
} from '@/components/ui/state-block';

export type { DataTableColumn, DataTableSelection };

/** A table read's state when it has no rows to show: loading, error or empty. */
export type DataTableState = Exclude<StateBlockProps, { inline: true }>;

/**
 * The one-line empty state (`QueryState` `inline`): one table row saying what
 * is absent, for a small table whose block empty state would be taller than
 * its rows ever are.
 */
type DataTableInlineEmpty = Extract<StateBlockProps, { inline: true }>;

export type DataTablePager = Omit<ComponentProps<typeof Pager>, 'frame' | 'className'>;

/**
 * DataTable — the record table organism (brand direction 3.2): a header, an
 * ink rule, overline column heads, 36px rows on hairlines with mono
 * right-aligned figures, a first column fixed while the table scrolls
 * sideways, sort marks, your row marked with the accent rung and "You", the
 * pager and the read's states, with one geometry.
 *
 *   header — the table's title and its toolbar (`FilterBar`: search, filters,
 *            status, actions) on one row, 49px with the hairline that closes
 *            it — the page's control band, repeated in the card, flush with
 *            the card's top edge (the band's own 8px is the inset). A table's
 *            filters live here, never in a toolbar the page builds. A
 *            `description` is one caption line under that row, so the row
 *            itself keeps its height.
 *   rows   — `Table` laid out fixed from the columns' width roles, at the one
 *            36px row. A paged table passes `pageSize` and `rowCount`: while
 *            the rows run past one page, a short last page is padded with
 *            blank rows, so the pager never moves between pages. Every row
 *            of a paged table is exactly `rowLines` tall: its text is cut to
 *            that many lines (the rest in a tooltip), so a page of long
 *            values is no taller than a page of short ones. Rows of two
 *            lines (`rowLines={2}`, cells on `TableCellLines`) are padded
 *            with blanks. `rowLines={3}` lets a title wrap to two lines, and
 *            only a row whose title wraps grows; a title that fits keeps its
 *            row compact (owner, 2026-11-11). A fixed list with `pageSize` and no
 *            pager (top movers) always reserves its rows.
 *   pager  — the shared `Pager`, framed as the table's footer, drawn only
 *            while the rows run past one page: a table that fits on one page
 *            has no pager and no blank rows.
 *   state  — loading, read-error and empty render INSIDE the table body,
 *            under the same header row, in the footprint of a full page of
 *            rows while the table is paged (else the query-state height).
 *            An `inline` empty state is one row instead (else the page's
 *            footprint), so a small table never holds a tall empty block. A
 *            block empty state's heading is an h3, under the table's own.
 *   overflow — while a wide table scrolls sideways, a fade at each edge that
 *            hides columns says so; it overlays the frame and moves nothing.
 *
 * The page passes data, columns and rows; it sets no geometry.
 */
export function DataTable({
  title,
  description,
  toolbar,
  columns,
  children,
  rowCount,
  pageSize,
  rowLines = 1,
  state,
  pager,
  busy,
  minWidth,
  pinFirstColumn = true,
  selection,
  footer,
  label,
  reserveRows = false,
}: Readonly<{
  /** The table's heading (an h3, the card title rung). */
  title?: string;
  /** One caption line under the title row: what the figures are. */
  description?: ReactNode;
  toolbar?: FilterBarProps;
  columns: readonly DataTableColumn[];
  /** The page's `TableRow`s. Ignored while `state` is set. */
  children?: ReactNode;
  /** Rows on this page; with `pageSize`, the short last page is padded. */
  rowCount?: number;
  /** Rows per page: the footprint reserved for rows and for every state. */
  pageSize?: number;
  /** Lines per row: 2 for a caption under the value, 3 for a two-line title over it. */
  rowLines?: RowLines;
  /** What to show instead of rows; an `inline` empty state is one row. */
  state?: DataTableState | DataTableInlineEmpty;
  pager?: DataTablePager;
  /** A background refetch while the current rows stay on screen. */
  busy?: Readonly<{ active: boolean; label: string }>;
  minWidth?: TableMinWidth;
  /**
   * Keep the first column (the row's identity) in view while a wide table
   * scrolls sideways in its frame.
   */
  pinFirstColumn?: boolean;
  selection?: DataTableSelection;
  /** A note under the table (e.g. a truncation notice). */
  footer?: ReactNode;
  /** The table's accessible name when it has no visible title. */
  label?: string;
  /**
   * One of several views of the same table (its tabs or filters): keep the
   * pager and a full page of rows even when this view fits on one page, so
   * switching views never moves what follows (2026-11-03 app review).
   */
  reserveRows?: boolean;
}>) {
  const headingId = useId();
  const colSpan = columns.length + (selection ? 1 : 0);
  const paging = pagingLayout(pager, pageSize, reserveRows);
  // The region and the table share one name: the visible title, else `label`.
  const naming = title
    ? { ariaLabelledBy: headingId, ariaLabel: undefined }
    : { ariaLabelledBy: undefined, ariaLabel: label };
  useFlexibleColumnCheck({ columns, title, label });
  return (
    <section
      aria-labelledby={naming.ariaLabelledBy}
      aria-label={naming.ariaLabel}
      aria-busy={busy?.active || undefined}
      data-data-table=""
      className="relative grid min-w-0 content-start gap-[var(--workspace-gap)]"
    >
      {busy ? <BusyRung active={busy.active} label={busy.label} /> : null}
      <DataTableHeader
        title={title}
        headingId={headingId}
        toolbar={toolbar}
        description={description}
      />
      <DataTableFrame
        minWidth={tableMinWidth({ columns, selection: Boolean(selection), minWidth })}
        naming={naming}
        pinFirstColumn={pinFirstColumn}
      >
        <DataTableColumns columns={columns} selection={selection} />
        <TableTextLinesContext value={(pager || pageSize !== undefined) && rowLines === 1 ? 1 : 2}>
          <TableTitleLinesContext value={rowLines === 3 ? 2 : 1}>
            <DataTableBody
              colSpan={colSpan}
              state={state}
              pageSize={paging.pageSize}
              rowCount={rowCount}
              rowLines={rowLines}
            >
              {children}
            </DataTableBody>
          </TableTitleLinesContext>
        </TableTextLinesContext>
      </DataTableFrame>
      <DataTableFoot footer={footer} pager={paging.pager} />
    </section>
  );
}

/**
 * The table's minimum width at the narrow and desktop layouts: the page's
 * `minWidth` floor, raised until no column (the identity column above all)
 * is squeezed below its role.
 */
function tableMinWidth({
  columns,
  selection,
  minWidth,
}: Readonly<{
  columns: readonly DataTableColumn[];
  selection: boolean;
  minWidth: TableMinWidth | undefined;
}>): CSSProperties {
  const floor = minWidth ? `var(--table-min-width-${minWidth})` : undefined;
  return {
    '--data-table-min': columnsMinWidth({ columns, selection, floor, desktop: false }),
    '--data-table-min-desktop': columnsMinWidth({ columns, selection, floor, desktop: true }),
  } as CSSProperties;
}

/**
 * The table in its scrolling frame, with the overflow fades laid over the
 * frame's edges. The box is isolated, so the fades never paint over the
 * page's sticky header. A pinned first column keeps the leading edge clear.
 */
function DataTableFrame({
  minWidth,
  naming,
  pinFirstColumn,
  children,
}: Readonly<{
  minWidth: CSSProperties;
  naming: { ariaLabelledBy?: string; ariaLabel?: string };
  pinFirstColumn: boolean;
  children: ReactNode;
}>) {
  const frame = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(frame);
  return (
    <div data-data-table-frame="" className="relative isolate min-w-0" style={minWidth}>
      <Table
        fixed
        {...naming}
        wrapperRef={frame}
        wrapperClassName="@container"
        className={cn(
          'desktop:min-w-[var(--data-table-min-desktop)] min-w-[var(--data-table-min)]',
          pinFirstColumn && PINNED_FIRST_COLUMN,
        )}
      >
        {children}
      </Table>
      <ScrollEdgeFades edges={edges} start={!pinFirstColumn} />
    </div>
  );
}

/**
 * The foot: the note (source, period or row count) on the left, the Pager on
 * the right, one control tall; nothing when there is neither.
 */
function DataTableFoot({
  footer,
  pager,
}: Readonly<{ footer: ReactNode; pager: DataTablePager | undefined }>) {
  if (!pager && !footer) return null;
  return (
    <div className="flex min-h-[var(--control-md)] min-w-0 flex-wrap items-center justify-between gap-2">
      {footer ? <div className="type-caption grid min-w-0 gap-1">{footer}</div> : null}
      {pager ? (
        <div className="ms-auto min-w-0">
          <Pager {...pager} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Whether the rows run past one page: another page either way, or (with a
 * rows-per-page select) more rows than the smallest page holds, so a reader on
 * a bigger page can still step back down. A table that fits on one page shows
 * no pager and no blank rows (owner, 2026-10-21).
 *
 * A reader who picked a bigger page keeps the pager even when everything now
 * fits on it and no exact total exists: the select they just used must not
 * vanish from under the pointer and strand them on the bigger page.
 */
function hasMorePages(pager: DataTablePager): boolean {
  if (pager.canPrev || pager.canNext) return true;
  if (pager.pageSize === undefined) return false;
  const smallest = Math.min(...TABLE_PAGE_SIZE_OPTIONS);
  if (pager.pageSize.value > smallest) return true;
  const total = pager.range?.total;
  return total !== undefined && total > smallest;
}

/**
 * The pager to draw and the page of rows to reserve. A fixed list with no
 * pager (top movers), and a view that shares its footprint with its sibling
 * views (`reserveRows`), keep their reserved rows.
 */
function pagingLayout(
  pager: DataTablePager | undefined,
  pageSize: number | undefined,
  reserveRows: boolean,
): { pager?: DataTablePager; pageSize?: number } {
  if (pager === undefined) return { pageSize };
  return reserveRows || hasMorePages(pager) ? { pager, pageSize } : {};
}

/** The first column stays in view while a wide table scrolls in its frame. */
const PINNED_FIRST_COLUMN =
  '[&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tbody_tr>:first-child]:z-10 [&_tbody_tr>:first-child]:bg-[var(--table-ground)] [&_thead_tr>:first-child]:z-20';

/**
 * The title row (the title at the card-title size, then the toolbar 8 along),
 * with the description bound 4 under it as one fact.
 */
function DataTableHeader({
  title,
  headingId,
  toolbar,
  description,
}: Readonly<{
  title?: string;
  headingId: string;
  toolbar?: FilterBarProps;
  description?: ReactNode;
}>) {
  if (!title && !toolbar && !description) return null;
  return (
    <header data-data-table-header="" className="grid min-w-0 gap-1">
      {title || toolbar ? (
        <div className="flex min-h-[var(--control-md)] min-w-0 flex-wrap items-center gap-2">
          {title ? (
            <h3 id={headingId} className={textRole('heading', 'min-w-0 truncate')}>
              {title}
            </h3>
          ) : null}
          {toolbar ? (
            <div className="min-w-0 flex-1">
              <FilterBar {...toolbar} />
            </div>
          ) : null}
        </div>
      ) : null}
      {description ? (
        <p data-data-table-description="" className="type-caption">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/**
 * The rows, padded to a full page, or the read's state in the footprint of
 * that page (never shorter than the query-state height).
 */
function DataTableBody({
  colSpan,
  state,
  pageSize,
  rowCount,
  rowLines,
  children,
}: Readonly<{
  colSpan: number;
  state?: DataTableState | DataTableInlineEmpty;
  pageSize?: number;
  rowCount?: number;
  rowLines: RowLines;
  children?: ReactNode;
}>) {
  if (state?.kind === 'empty' && state.inline) {
    return (
      <TableBody>
        <tr data-table-state="">
          <TableCell
            colSpan={colSpan}
            className="h-[calc(var(--data-table-rows)*var(--data-table-row))] align-top"
            style={stateFootprint(pageSize ?? 1, rowLines)}
          >
            <InFrame>
              <StateBlock
                kind="empty"
                inline
                compact
                icon={state.icon}
                message={state.message}
                action={state.action}
              />
            </InFrame>
          </TableCell>
        </tr>
      </TableBody>
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
            {/* Under the table's h3 title, a block empty state's heading is an h3. */}
            <StateHeadingLevelContext value={3}>
              <InFrame>
                <StateBlock {...state} />
              </InFrame>
            </StateHeadingLevelContext>
          </TableCell>
        </tr>
      </TableBody>
    );
  }
  const filler = pageSize === undefined || rowCount === undefined ? 0 : pageSize - rowCount;
  return (
    <TableBody>
      {children}
      <TableFillerRows
        count={filler}
        colSpan={colSpan}
        spacer={rowLines === 1 ? null : <TableCellLines primary={BLANK} secondary={BLANK} />}
      />
    </TableBody>
  );
}

/**
 * A state spans the visible frame, not the scroll width of a wide table, and
 * stays in view while the frame scrolls, so its text is never cut (STA-03).
 */
function InFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="sticky start-[var(--table-cell-padding-x)] w-[calc(100cqi-2*var(--table-cell-padding-x))]">
      {children}
    </div>
  );
}

/**
 * A row's height by its lines, so a state holds exactly a page of rows: one
 * line sits on the row floor; two lines are a body line over a caption line
 * between the cell's padding (`TableCellLines`); three are a two-line title
 * over the caption.
 */
const ROW_HEIGHT = {
  1: 'var(--table-row-height)',
  2: 'calc(2*var(--table-cell-padding-y)+var(--text-body-sm--line-height)+var(--spacing)+var(--text-caption--line-height))',
  3: 'calc(2*var(--table-cell-padding-y)+2*var(--text-body-sm--line-height)+var(--spacing)+var(--text-caption--line-height))',
} as const satisfies Record<RowLines, string>;

type RowLines = 1 | 2 | 3;

/** The custom properties a state cell's height reads: `rows` rows of `rowLines`. */
function stateFootprint(rows: number, rowLines: RowLines) {
  return {
    '--data-table-rows': rows,
    '--data-table-row': ROW_HEIGHT[rowLines],
  } as CSSProperties;
}

/** A non-breaking space: a blank line that still takes a line's height. */
const BLANK = ' ';
