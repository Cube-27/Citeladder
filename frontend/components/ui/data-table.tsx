import { useContext, useId, type ComponentProps, type CSSProperties, type ReactNode } from 'react';

import { BusyRung } from '@/components/ui/rung-meter';
import {
  columnLayout,
  columnsMinWidth,
  DataTableColumns,
  useFlexibleColumnCheck,
  type DataTableColumn,
  type DataTableSelection,
} from '@/components/ui/data-table-columns';
import {
  DataTableBody,
  usePinnedPadding,
  type DataTableInlineEmpty,
  type DataTableState,
  type RowLines,
} from '@/components/ui/data-table-body';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { Pager } from '@/components/ui/pager';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatTimeZoneNote } from '@/lib/format';
import {
  ScrollSteppers,
  useScrollFrame,
  type ScrollFrameState,
} from '@/components/ui/scroll-edges';
import { Table, TableTitleLinesContext, type TableMinWidth } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import { StateBlock, StateHeadingLevelContext } from '@/components/ui/state-block';

export type { DataTableColumn, DataTableSelection, DataTableState };

export type DataTablePager = Omit<ComponentProps<typeof Pager>, 'frame' | 'className'>;

/**
 * DataTable — the record table organism, a card: an optional header bar
 * (title, toolbar), a head row on `well` (36), body rows of 40 (56 for two
 * lines) with `rule` lines between rows only, and a footer bar with the Pager
 * and the sideways steppers. The page passes data, columns and rows; it sets
 * no geometry.
 *
 *   columns — each column declares its kind, which sets the head's and every
 *            cell's alignment, face, minimum width and truncation together
 *            (`columnLayout`). Priority columns come first and fit at 982;
 *            `priority: 'low'` columns come last and are what scrolls.
 *   pinned — the identity column (with the selection checkbox in the same
 *            pinned block) stays in view while the table scrolls sideways,
 *            and the scroller's scroll padding equals the pinned width, so a
 *            focused cell is never under it.
 *   rows   — every cell is one line, cut with an ellipsis and the full value
 *            in a tooltip; `rowLines={2}` stacks a value over a caption
 *            (`TableCellLines`). A paged table pads a short last page with
 *            blank rows, so the pager never moves between pages.
 *   states — loading keeps the head and draws a page of block rows; a filter
 *            that empties a table keeps the head; an empty, not-measured or
 *            failed read replaces the whole table, head included. A page
 *            that knows from its data that nothing was measured passes the
 *            not-measured state; the table never guesses it from its cells.
 *   zone   — a table with a `date` column states its time zone once, in
 *            the footer bar; its date-times carry none (`TableTime`).
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
  /** The table's heading: an h2 on the page, an h3 inside a section. */
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
  /** What to show instead of rows. */
  state?: DataTableState | DataTableInlineEmpty;
  pager?: DataTablePager;
  /** A background refetch while the current rows stay on screen. */
  busy?: Readonly<{ active: boolean; label: string }>;
  minWidth?: TableMinWidth;
  /** Keep the identity column (and the selection box) in view while the table scrolls sideways. */
  pinFirstColumn?: boolean;
  selection?: DataTableSelection;
  /** A note in the footer bar (a source, a period, the time zone). */
  footer?: ReactNode;
  /** The table's accessible name when it has no visible title. */
  label?: string;
  /**
   * One of several views of the same table (its tabs or filters): keep the
   * pager and a full page of rows even when this view fits on one page, so
   * switching views never moves what follows.
   */
  reserveRows?: boolean;
}>) {
  const headingId = useId();
  const level = useContext(StateHeadingLevelContext);
  const parts = dataTableParts({ title, label, headingId, columns, selection, pinFirstColumn });
  const paging = pagingLayout(pager, pageSize, reserveRows);
  const scroll = useScrollFrame({ label: parts.regionLabel, start: !pinFirstColumn });
  useFlexibleColumnCheck({ columns, title, label });
  const replacing = replacingState(state);
  const steppers = <ScrollSteppers state={scroll} />;
  const note = tableNote(footer, parts.zoned);
  const footed = Boolean(paging.pager ?? note);
  return (
    <section
      aria-labelledby={parts.naming.ariaLabelledBy}
      aria-label={parts.naming.ariaLabel}
      aria-busy={busy?.active || undefined}
      data-data-table=""
      className="relative grid min-w-0 content-start"
    >
      {busy ? <BusyRung active={busy.active} label={busy.label} /> : null}
      <DataTableHeader
        title={title}
        headingId={headingId}
        level={level}
        toolbar={toolbar}
        description={description}
        steppers={footed ? null : steppers}
      />
      {replacing ? (
        <ReplacingState state={replacing} level={title ? nextLevel(level) : level} />
      ) : null}
      <DataTableFrame
        hidden={replacing !== null}
        scroll={scroll}
        minWidth={tableMinWidth({ columns, selection: Boolean(selection), minWidth })}
        layout={columnLayout(columns, Boolean(selection))}
        naming={parts.naming}
        pinned={parts.pinned}
      >
        <DataTableColumns columns={columns} selection={selection} />
        <TableTitleLinesContext value={rowLines === 3 ? 2 : 1}>
          <DataTableBody
            colSpan={parts.colSpan}
            state={replacing ? undefined : state}
            pageSize={paging.pageSize}
            rowCount={rowCount}
            rowLines={rowLines}
          >
            {state === undefined ? children : null}
          </DataTableBody>
        </TableTitleLinesContext>
      </DataTableFrame>
      <DataTableFoot
        footer={note}
        pager={replacing ? undefined : paging.pager}
        steppers={footed ? steppers : null}
      />
    </section>
  );
}

/**
 * What the table derives from its props alone: its cell count, its name (the
 * visible title, else `label`, shared by the region and the table), how many
 * leading columns stay pinned, and whether it shows date-times.
 */
function dataTableParts({
  title,
  label,
  headingId,
  columns,
  selection,
  pinFirstColumn,
}: Readonly<{
  title?: string;
  label?: string;
  headingId: string;
  columns: readonly DataTableColumn[];
  selection?: DataTableSelection;
  pinFirstColumn: boolean;
}>) {
  const naming = title
    ? { ariaLabelledBy: headingId, ariaLabel: undefined }
    : { ariaLabelledBy: undefined, ariaLabel: label };
  let pinned: 0 | 1 | 2 = 0;
  if (pinFirstColumn) pinned = selection ? 2 : 1;
  return {
    colSpan: columns.length + (selection ? 1 : 0),
    regionLabel: title ?? label ?? 'Table',
    naming,
    pinned,
    zoned: columns.some((column) => column.kind === 'date'),
  };
}

/** The footer's note, with the zone its date-times are in stated once. */
function tableNote(footer: ReactNode, zoned: boolean): ReactNode {
  if (!zoned) return footer;
  return (
    <>
      {footer}
      <TimeZoneNote />
    </>
  );
}

/** The zone the table's date-times are in, said once ("Times in GMT+5:30"). */
function TimeZoneNote() {
  const timeZone = useDisplayTimeZone();
  return <span className="type-caption">{formatTimeZoneNote(timeZone)}</span>;
}

/** A state under the table's own title takes the next level. */
const nextLevel = (level: 1 | 2 | 3) => (level === 1 ? 2 : 3);

/**
 * The state that takes the table's place, head included: an empty,
 * not-measured or failed read. Loading and filtered-empty keep the head.
 */
function replacingState(
  state: DataTableState | DataTableInlineEmpty | undefined,
): ComponentProps<typeof StateBlock> | null {
  if (state === undefined || state.kind === 'loading' || state.kind === 'filtered') return null;
  return state;
}

function ReplacingState({
  state,
  level,
}: Readonly<{ state: ComponentProps<typeof StateBlock>; level: 1 | 2 | 3 }>) {
  return (
    <div className="p-4">
      <StateHeadingLevelContext value={level}>
        <StateBlock {...state} />
      </StateHeadingLevelContext>
    </div>
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
 * The table in its scrolling frame. `layout` is the column map the cell
 * rules read; `pinned` is how many leading columns stay in view (the
 * identity column, and the selection box before it).
 */
function DataTableFrame({
  hidden,
  scroll,
  minWidth,
  layout,
  naming,
  pinned,
  children,
}: Readonly<{
  hidden: boolean;
  scroll: ScrollFrameState;
  minWidth: CSSProperties;
  layout: ReturnType<typeof columnLayout>;
  naming: { ariaLabelledBy?: string; ariaLabel?: string };
  pinned: 0 | 1 | 2;
  children: ReactNode;
}>) {
  usePinnedPadding(scroll.ref, pinned);
  return (
    <div
      data-data-table-frame=""
      {...layout}
      data-pinned={pinned || undefined}
      hidden={hidden}
      className="isolate min-w-0"
      style={minWidth}
    >
      <div {...scroll.frame} className="relative min-w-0">
        <Table
          fixed
          {...naming}
          wrapperRef={scroll.ref}
          region={scroll.region}
          wrapperClassName="@container"
          className="desktop:min-w-[var(--data-table-min-desktop)] min-w-[var(--data-table-min)]"
        >
          {children}
        </Table>
      </div>
    </div>
  );
}

/**
 * The footer bar: the note (source, period, time zone) on the left, the
 * steppers and the Pager on the right; nothing when there is neither.
 */
function DataTableFoot({
  footer,
  pager,
  steppers,
}: Readonly<{ footer: ReactNode; pager: DataTablePager | undefined; steppers: ReactNode }>) {
  if (!pager && !footer) return null;
  return (
    <div
      data-data-table-foot=""
      className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2"
    >
      {footer ? <div className="type-caption grid min-w-0 gap-1">{footer}</div> : null}
      <div className="ms-auto flex min-w-0 flex-wrap items-center gap-4">
        {steppers}
        {pager ? <Pager {...pager} /> : null}
      </div>
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

/**
 * The header bar: the title, then the toolbar on one row, the description
 * one caption line under it, and the steppers when no footer bar exists.
 */
function DataTableHeader({
  title,
  headingId,
  level,
  toolbar,
  description,
  steppers,
}: Readonly<{
  title?: string;
  headingId: string;
  level: 1 | 2 | 3;
  toolbar?: FilterBarProps;
  description?: ReactNode;
  steppers: ReactNode;
}>) {
  if (!title && !toolbar && !description) {
    return steppers ? <div className="flex justify-end px-4 pt-2">{steppers}</div> : null;
  }
  // The level a block in this place takes: h2 on the page, h3 inside a section.
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <header className="grid min-w-0 gap-1 px-4 py-3">
      <div
        data-data-table-header=""
        className="rail:flex-row rail:items-center flex min-h-[var(--control-md)] min-w-0 flex-col items-stretch gap-2"
      >
        {title ? (
          <Heading id={headingId} className={textRole('heading', 'min-w-0 shrink-0 truncate')}>
            {title}
          </Heading>
        ) : null}
        {toolbar ? (
          <div className="min-w-0 flex-1">
            <FilterBar {...toolbar} />
          </div>
        ) : null}
        {steppers ? <div className={cn(!toolbar && 'rail:ms-auto')}>{steppers}</div> : null}
      </div>
      {description ? (
        <p data-data-table-description="" className="type-caption max-w-[72ch]">
          {description}
        </p>
      ) : null}
    </header>
  );
}
