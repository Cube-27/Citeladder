import { useContext, useId, type ComponentProps, type ReactNode, type RefObject } from 'react';

import { BusyRung } from '@/components/ui/rung-meter';
import {
  DataTableColumns,
  useFlexibleColumnCheck,
  type DataTableColumn,
  type DataTableSelection,
} from '@/components/ui/data-table-columns';
import { ShownColumnsContext, useFittedColumns } from '@/components/ui/data-table-fit';
import {
  DataTableBody,
  usePinnedPadding,
  type DataTableInlineEmpty,
  type DataTableState,
} from '@/components/ui/data-table-body';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { Pager } from '@/components/ui/pager';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { useScrollFrame, type ScrollFrameState } from '@/components/ui/scroll-edges';
import { Table } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { StateBlock } from '@/components/ui/state-block';
import { StateHeadingLevelContext, type HeadingLevel } from '@/components/ui/state-heading-level';

import './data-table.css';

export type { DataTableColumn, DataTableSelection, DataTableState };

export type DataTablePager = Omit<ComponentProps<typeof Pager>, 'frame' | 'className'>;

/**
 * DataTable — the record table organism: an optional header bar (title,
 * toolbar) on the page surface, then the table in its `rule` frame (head 32
 * on `raised`, rows 40 with hairlines between them), and a footer bar with
 * the Pager. The page passes data, columns and
 * rows; it sets no geometry.
 *
 *   columns — each column declares its kind, which sets the head's and every
 *            cell's alignment, face and width together (`columnRules`): the
 *            flexible column takes the spare width, the others hug their
 *            content. When the floors do not fit the frame,
 *            `priority: 'low'` columns hide, the last first (`useFittedColumns`).
 *   pinned — the identity column (with the selection checkbox in the same
 *            pinned block) stays in view while the table scrolls sideways,
 *            and the scroller's scroll padding equals the pinned width, so a
 *            focused cell is never under it.
 *   rows   — every row is one line, cut with an ellipsis and the full value
 *            in a tooltip; secondary text follows the primary inline
 *            (`TableCellLines`). A short page draws no blank rows; a view
 *            under `reserveRows` holds its page as plain space.
 *   states — loading keeps the head and draws a page of block rows; a filter
 *            that empties a table keeps the head; an empty, not-measured or
 *            failed read replaces the whole table, head included (inside
 *            its footprint under `reserveRows`). A page
 *            that knows from its data that nothing was measured passes the
 *            not-measured state; the table never guesses it from its cells.
 *   zone   — a table with a `date` column states its time zone once, in
 *            the footer bar; its date-times carry none (`TableTime`).
 */
export function DataTable({
  title,
  description,
  actions,
  toolbar,
  columns,
  children,
  rowCount,
  pageSize,
  state,
  pager,
  busy,
  selection,
  footer,
  label,
  reserveRows = false,
}: Readonly<{
  /** The table's heading: an h2 on the page, an h3 inside a section. */
  title?: string;
  /** One caption line under the title row: what the figures are. */
  description?: ReactNode;
  /** At the head's end, centred on the title: a view switch, or the table's own actions (Columns, Export). */
  actions?: ReactNode;
  toolbar?: FilterBarProps;
  columns: readonly DataTableColumn[];
  /** The page's `TableRow`s. Ignored while `state` is set. */
  children?: ReactNode;
  /** Rows on this page; under `reserveRows`, the rest of the page is held as plain space. */
  rowCount?: number;
  /** Rows per page: the footprint reserved for rows and for every state. */
  pageSize?: number;
  /** What to show instead of rows. */
  state?: DataTableState | DataTableInlineEmpty;
  pager?: DataTablePager;
  /** A background refetch while the current rows stay on screen. */
  busy?: Readonly<{ active: boolean; label: string }>;
  selection?: DataTableSelection;
  /** A note in the footer bar (a source, a period). */
  footer?: ReactNode;
  /** The table's accessible name when it has no visible title. */
  label?: string;
  /**
   * One of several views of the same table (its tabs or filters): keep the
   * pager and a full page's height (blank space, not blank rows) even when
   * this view fits on one page, and hold that footprint under an empty or
   * failed view, so switching views never moves what follows.
   */
  reserveRows?: boolean;
}>) {
  const headingId = useId();
  const level = useContext(StateHeadingLevelContext);
  const parts = dataTableParts({ title, label, headingId, columns, selection });
  const { frameRef, probe, scope, shown, shownKeys } = useFittedColumns({
    columns,
    selection: Boolean(selection),
  });
  const paging = pagingLayout(pager, pageSize, reserveRows);
  const scroll = useScrollFrame({ label: parts.regionLabel, start: false });
  useFlexibleColumnCheck({ columns, title, label });
  const replacing = replacingState(state);
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
        actions={actions}
      />
      <HeldFootprint state={replacing} level={stateLevel(title, level)} held={reserveRows}>
        <DataTableFrame
          hidden={dropsTable(replacing, reserveRows)}
          scroll={scroll}
          naming={parts.naming}
          pinned={parts.pinned}
          frameRef={frameRef}
          scope={scope}
          probe={probe}
          foot={<DataTableFoot footer={footer} pager={paging.pager} />}
        >
          <DataTableColumns columns={columns} selection={selection} />
          <DataTableBody
            cells={parts.colSpan}
            colSpan={shown.length + (selection ? 1 : 0)}
            state={replacing ? undefined : state}
            // Loading cannot know yet whether the rows fit on one page: it
            // draws the page asked for, the likelier loaded height.
            pageSize={state?.kind === 'loading' ? pageSize : paging.pageSize}
            rowCount={rowCount}
            reserve={reserveRows}
          >
            <ShownColumnsContext value={shownKeys}>
              {state === undefined ? children : null}
            </ShownColumnsContext>
          </DataTableBody>
        </DataTableFrame>
      </HeldFootprint>
    </section>
  );
}

/**
 * A state that takes the table's place. In a table that reserves its rows it
 * lies over the unseen frame and footer, so it keeps their footprint.
 */
function HeldFootprint({
  state,
  level,
  held,
  children,
}: Readonly<{
  state: ComponentProps<typeof StateBlock> | null;
  level: HeadingLevel;
  held: boolean;
  children: ReactNode;
}>) {
  const block = state ? <ReplacingState state={state} level={level} /> : null;
  if (!block || !held)
    return (
      <>
        {block}
        {children}
      </>
    );
  return (
    <div className="grid min-w-0">
      <div className="col-start-1 row-start-1 min-w-0">{block}</div>
      <div inert className="col-start-1 row-start-1 min-w-0" style={{ visibility: 'hidden' }}>
        {children}
      </div>
    </div>
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
}: Readonly<{
  title?: string;
  label?: string;
  headingId: string;
  columns: readonly DataTableColumn[];
  selection?: DataTableSelection;
}>) {
  const naming = title
    ? { ariaLabelledBy: headingId, ariaLabel: undefined }
    : { ariaLabelledBy: undefined, ariaLabel: label };
  const pinned: 1 | 2 = selection ? 2 : 1;
  return {
    colSpan: columns.length + (selection ? 1 : 0),
    regionLabel: title ?? label ?? 'Table',
    naming,
    pinned,
  };
}

/** A state under the table's own title takes the next level. */
const stateLevel = (title: string | undefined, level: HeadingLevel): HeadingLevel => {
  if (!title) return level;
  return level === 1 ? 2 : 3;
};

/** Whether a state drops the table and its pager, rather than holding their footprint. */
const dropsTable = (replacing: ReturnType<typeof replacingState>, reserveRows: boolean) =>
  replacing !== null && !reserveRows;

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
}: Readonly<{ state: ComponentProps<typeof StateBlock>; level: HeadingLevel }>) {
  return (
    <StateHeadingLevelContext value={level}>
      {state.kind === 'empty' && state.inline ? (
        <div className="p-4">
          <StateBlock {...state} />
        </div>
      ) : (
        <StateBlock {...state} />
      )}
    </StateHeadingLevelContext>
  );
}

/**
 * The table in its scrolling frame. `scope` is what the column rules target;
 * `pinned` is how many leading columns stay in view (the identity column,
 * and the selection box before it).
 */
function DataTableFrame({
  hidden,
  scroll,
  naming,
  pinned,
  frameRef,
  scope,
  probe,
  foot,
  children,
}: Readonly<{
  hidden: boolean;
  scroll: ScrollFrameState;
  naming: { ariaLabelledBy?: string; ariaLabel?: string };
  pinned: 1 | 2;
  frameRef: RefObject<HTMLDivElement | null>;
  scope: string;
  /** The column rules, and the hidden boxes that measure the column floors. */
  probe: ReactNode;
  /** The foot band: the note, the steppers and the Pager. */
  foot: ReactNode;
  children: ReactNode;
}>) {
  usePinnedPadding(scroll.ref, pinned);
  return (
    <div
      ref={frameRef}
      data-data-table-frame=""
      data-table-scope={scope}
      data-pinned={pinned}
      hidden={hidden}
      className="relative isolate min-w-0"
    >
      {probe}
      <div {...scroll.frame} className="relative min-w-0">
        <Table
          {...naming}
          wrapperRef={scroll.ref}
          region={scroll.region}
          wrapperClassName="@container"
        >
          {children}
        </Table>
      </div>
      {foot}
    </div>
  );
}

/**
 * The foot band, 40 high under a hairline inside the frame: the note
 * (source, period) on the left, the Pager on the right; nothing when there
 * is neither. A wide table scrolls by its scrollbar, with no stepper buttons.
 */
function DataTableFoot({
  footer,
  pager,
}: Readonly<{ footer: ReactNode; pager: DataTablePager | undefined }>) {
  if (!pager && !footer) return null;
  return (
    <div
      data-data-table-foot=""
      className="border-rule flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-1"
    >
      {footer ? (
        <div className="type-caption grid min-w-0 content-center gap-1">{footer}</div>
      ) : null}
      {pager ? (
        <div className="ms-auto flex min-w-0 flex-wrap items-center gap-4">
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

/**
 * The header bar, on the surface above the frame: the title, then the
 * toolbar on one row, the description one caption line under it; 12 above
 * the frame, on the frame's left edge.
 */
function DataTableHeader({
  title,
  headingId,
  level,
  toolbar,
  description,
  actions,
}: Readonly<{
  title?: string;
  headingId: string;
  level: HeadingLevel;
  toolbar?: FilterBarProps;
  description?: ReactNode;
  actions?: ReactNode;
}>) {
  if (!title && !toolbar && !description && !actions) return null;
  const head = (
    <>
      <TitleRow title={title} headingId={headingId} level={level} toolbar={toolbar} />
      {description ? (
        <p data-data-table-description="" className="type-caption max-w-[72ch]">
          {description}
        </p>
      ) : null}
    </>
  );
  if (!actions) return <header className="grid min-w-0 gap-1 pb-3">{head}</header>;
  // As a section head: the switch sits level with the title, and wraps under the caption when narrow.
  return (
    <header className="flex flex-wrap items-start justify-between gap-2 pb-3">
      <div className="grid min-w-0 flex-1 basis-60 grid-cols-[minmax(0,1fr)] gap-1">{head}</div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}

/** The title line: the heading, then the toolbar beside it. */
function TitleRow({
  title,
  headingId,
  level,
  toolbar,
}: Readonly<{
  title?: string;
  headingId: string;
  level: HeadingLevel;
  toolbar?: FilterBarProps;
}>) {
  // The level a block in this place takes: h2 on the page, h3 inside a section.
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
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
    </div>
  );
}
