import { useContext, useId, type ComponentProps, type ReactNode, type RefObject } from 'react';

import { BusyRung } from '@/components/ui/rung-meter';
import {
  DataTableColumns,
  type ColumnAttributes,
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
import { TableToolbar, type TableToolbarProps } from '@/components/ui/filter-bar';
import { Pager } from '@/components/ui/pager';
import {
  Section,
  SectionBleed,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { useScrollFrame, type ScrollFrameState } from '@/components/ui/scroll-edges';
import { Table } from '@/components/ui/table';
import { StateBlock } from '@/components/ui/state-block';
import { StateHeadingLevelContext, type HeadingLevel } from '@/components/ui/state-heading-level';

import './data-table.css';
import './generated/data-table-positions.css';

export type { DataTableColumn, DataTableSelection, DataTableState };

export type DataTablePager = Omit<ComponentProps<typeof Pager>, 'frame' | 'className'>;

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
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: TableToolbarProps;
  columns: readonly DataTableColumn[];
  children?: ReactNode;
  rowCount?: number;
  pageSize?: number;
  state?: DataTableState | DataTableInlineEmpty;
  pager?: DataTablePager;
  busy?: Readonly<{ active: boolean; label: string }>;
  selection?: DataTableSelection;
  footer?: ReactNode;
  label?: string;
  reserveRows?: boolean;
}>) {
  const headingId = useId();
  const level = useContext(StateHeadingLevelContext);
  const parts = dataTableParts({ title, label, headingId, columns, selection });
  const { frameRef, probe, layout, shown, shownKeys } = useFittedColumns({
    columns,
    selection: Boolean(selection),
  });
  const paging = pagingLayout(pager, pageSize, reserveRows);
  const scroll = useScrollFrame({ label: parts.regionLabel, start: false });
  const replacing = replacingState(state);
  return (
    <Section
      aria-labelledby={parts.naming.ariaLabelledBy}
      aria-label={parts.naming.ariaLabel}
      aria-busy={busy?.active || undefined}
      data-data-table=""
    >
      <DataTableHeader
        title={title}
        headingId={headingId}
        level={level}
        description={description}
        actions={actions}
        toolbar={toolbar}
      />
      <HeldFootprint
        state={replacing}
        level={stateLevel(title, level)}
        held={reserveRows}
        dropped={dropsTable(replacing, reserveRows)}
      >
        <DataTableFrame
          scroll={scroll}
          naming={parts.naming}
          pinned={parts.pinned}
          frameRef={frameRef}
          layout={layout}
          probe={probe}
          foot={<DataTableFoot footer={footer} pager={paging.pager} />}
        >
          <DataTableColumns columns={columns} selection={selection} />
          <DataTableBody
            cells={parts.colSpan}
            colSpan={shown.length + (selection ? 1 : 0)}
            state={replacing ? undefined : state}
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
      {busy ? <BusyRung active={busy.active} label={busy.label} /> : null}
    </Section>
  );
}

function HeldFootprint({
  state,
  level,
  held,
  dropped,
  children,
}: Readonly<{
  state: ComponentProps<typeof StateBlock> | null;
  level: HeadingLevel;
  held: boolean;
  dropped: boolean;
  children: ReactNode;
}>) {
  const block = state ? <ReplacingState state={state} level={level} /> : null;
  if (!block || !held)
    return (
      <>
        {block}
        <SectionBleed hidden={dropped}>{children}</SectionBleed>
      </>
    );
  return (
    <SectionBleed>
      <div className="grid min-w-0">
        <div className="px-panel-inset col-start-1 row-start-1 min-w-0 py-3">{block}</div>
        <div inert className="invisible col-start-1 row-start-1 min-w-0">
          {children}
        </div>
      </div>
    </SectionBleed>
  );
}

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

const stateLevel = (title: string | undefined, level: HeadingLevel): HeadingLevel => {
  if (!title) return level;
  return level === 1 ? 2 : 3;
};

const dropsTable = (replacing: ReturnType<typeof replacingState>, reserveRows: boolean) =>
  replacing !== null && !reserveRows;

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
      <StateBlock {...state} />
    </StateHeadingLevelContext>
  );
}

function DataTableFrame({
  scroll,
  naming,
  pinned,
  frameRef,
  layout,
  probe,
  foot,
  children,
}: Readonly<{
  scroll: ScrollFrameState;
  naming: { ariaLabelledBy?: string; ariaLabel?: string };
  pinned: 1 | 2;
  frameRef: RefObject<HTMLDivElement | null>;
  layout: Readonly<{ attributes: ColumnAttributes; share: string }>;
  probe: ReactNode;
  foot: ReactNode;
  children: ReactNode;
}>) {
  usePinnedPadding(scroll.ref, pinned);
  return (
    <div
      ref={frameRef}
      data-data-table-frame=""
      {...layout.attributes}
      style={{ '--data-table-share': layout.share }}
      data-pinned={pinned}
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

function DataTableFoot({
  footer,
  pager,
}: Readonly<{ footer: ReactNode; pager: DataTablePager | undefined }>) {
  if (!pager && !footer) return null;
  return (
    <div
      data-data-table-foot=""
      className="border-rule px-panel-inset flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t py-1"
    >
      {footer ? (
        <div className="text-caption text-ink-2 grid min-w-0 content-center gap-1">{footer}</div>
      ) : null}
      {pager ? (
        <div className="ms-auto flex min-w-0 flex-wrap items-center gap-4">
          <Pager {...pager} />
        </div>
      ) : null}
    </div>
  );
}

function hasMorePages(pager: DataTablePager): boolean {
  if (pager.canPrev || pager.canNext) return true;
  if (pager.pageSize === undefined) return false;
  const smallest = Math.min(...TABLE_PAGE_SIZE_OPTIONS);
  if (pager.pageSize.value > smallest) return true;
  const total = pager.range?.total;
  return total !== undefined && total > smallest;
}

function pagingLayout(
  pager: DataTablePager | undefined,
  pageSize: number | undefined,
  reserveRows: boolean,
): { pager?: DataTablePager; pageSize?: number } {
  if (pager === undefined) return { pageSize };
  return reserveRows || hasMorePages(pager) ? { pager, pageSize } : {};
}

function joinActions(first: ReactNode, second: ReactNode): ReactNode {
  if (!first || !second) return first || second;
  return (
    <>
      {first}
      {second}
    </>
  );
}

const hasControls = ({ view, lead, search, filters, status }: TableToolbarProps) =>
  Boolean(view || lead || search || filters?.length || status !== undefined);

function DataTableHeader({
  title,
  headingId,
  level,
  description,
  actions,
  toolbar,
}: Readonly<{
  title?: string;
  headingId: string;
  level: HeadingLevel;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: TableToolbarProps;
}>) {
  const allActions = joinActions(toolbar?.actions, actions);
  const named = Boolean(title || description);
  if (!named && !allActions && !toolbar) return null;
  const heading = named ? (
    <>
      {title ? (
        <SectionTitle id={headingId} level={level === 3 ? 3 : 2} truncate>
          {title}
        </SectionTitle>
      ) : null}
      {description ? (
        <SectionDescription data-data-table-description="">{description}</SectionDescription>
      ) : null}
    </>
  ) : null;
  if (!toolbar || !hasControls(toolbar))
    return (
      <SectionHeader data-data-table-header="" actions={allActions}>
        {heading}
      </SectionHeader>
    );
  return (
    <div data-data-table-header="" className="flex min-w-0 flex-wrap items-center gap-4">
      {named ? <div className="grid max-w-full min-w-0 gap-1">{heading}</div> : null}
      <div className="flex max-w-full min-w-0 grow">
        <TableToolbar {...toolbar} actions={allActions} />
      </div>
    </div>
  );
}
