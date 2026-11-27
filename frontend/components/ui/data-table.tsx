import {
  useContext,
  useId,
  useLayoutEffect,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';

import { BusyRung } from '@/components/ui/rung-meter';
import {
  DataTableColumns,
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
import { HeadControls, hasHeadControls, type TableToolbarProps } from '@/components/ui/filter-bar';
import { Pager } from '@/components/ui/pager';
import {
  Section,
  SectionBleed,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { TABLE_DEFAULT_PAGE_SIZE, TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { useScrollFrame, type ScrollFrameState } from '@/components/ui/scroll-edges';
import { Table } from '@/components/ui/table';
import { StateBlock } from '@/components/ui/state-block';
import { StateHeadingLevelContext, type HeadingLevel } from '@/components/ui/state-heading-level';

import './data-table.css';

export type { DataTableColumn, DataTableSelection, DataTableState };

export type DataTablePager = Omit<ComponentProps<typeof Pager>, 'frame' | 'className'>;

export function DataTable({
  title,
  description,
  actions,
  toolbar,
  columns,
  children,
  pageSize,
  state,
  pager,
  busy,
  selection,
  footer,
  label,
}: Readonly<{
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: TableToolbarProps;
  columns: readonly DataTableColumn[];
  children?: ReactNode;
  pageSize?: number;
  state?: DataTableState | DataTableInlineEmpty;
  pager?: DataTablePager;
  busy?: Readonly<{ active: boolean; label: string }>;
  selection?: DataTableSelection;
  footer?: ReactNode;
  label?: string;
}>) {
  const headingId = useId();
  const level = useContext(StateHeadingLevelContext);
  const parts = dataTableParts({ title, label, headingId, columns, selection });
  const { frameRef, probe, layout, shown, shownKeys } = useFittedColumns({
    columns,
    selection: Boolean(selection),
    scope: headingId,
  });
  const reserve = pager !== undefined;
  const paging = pagingLayout(pager, pageSize);
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
      <HeldFootprint state={replacing} level={stateLevel(title, level)} held={reserve}>
        <DataTableFrame
          scroll={scroll}
          naming={parts.naming}
          pinned={parts.pinned}
          frameRef={frameRef}
          scope={headingId}
          layout={layout}
          probe={probe}
          reserve={reserve}
          foot={<DataTableFoot footer={footer} pager={paging.pager} />}
        >
          <DataTableColumns columns={columns} selection={selection} />
          <DataTableBody
            cells={parts.colSpan}
            colSpan={shown.length + (selection ? 1 : 0)}
            state={replacing ? undefined : state}
            pageSize={state?.kind === 'loading' ? pageSize : paging.pageSize}
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
        <SectionBleed hidden={block !== null}>{children}</SectionBleed>
      </>
    );
  return (
    <SectionBleed>
      <div className="grid min-w-0">
        <div className="px-panel-inset col-start-1 row-start-1 min-w-0 py-3">{block}</div>
        <div inert aria-hidden className="invisible col-start-1 row-start-1 min-w-0">
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
  scope,
  layout,
  probe,
  reserve,
  foot,
  children,
}: Readonly<{
  scroll: ScrollFrameState;
  reserve: boolean;
  naming: { ariaLabelledBy?: string; ariaLabel?: string };
  pinned: 1 | 2;
  frameRef: RefObject<HTMLDivElement | null>;
  scope: string;
  layout: string;
  probe: ReactNode;
  foot: ReactNode;
  children: ReactNode;
}>) {
  usePinnedPadding(scroll.ref, pinned);
  useFrameRules(layout);
  return (
    <div
      ref={frameRef}
      data-data-table-frame={scope}
      data-pinned={pinned}
      className="relative isolate min-w-0"
    >
      {probe}
      <div
        {...scroll.frame}
        style={reserve ? { '--reserve-rows': TABLE_DEFAULT_PAGE_SIZE } : undefined}
        className="relative min-h-[calc(var(--spacing-table-head)_+_var(--reserve-rows,0)_*_var(--spacing-row))] min-w-0"
      >
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

function useFrameRules(css: string) {
  useLayoutEffect(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet);
    };
  }, [css]);
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
): { pager?: DataTablePager; pageSize?: number } {
  if (pager === undefined) return { pageSize };
  return hasMorePages(pager) ? { pager, pageSize } : {};
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
  const controls = { ...toolbar, actions: joinActions(toolbar?.actions, actions) };
  const shown = hasHeadControls(controls);
  if (!title && !description && !shown && !toolbar?.search) return null;
  return (
    <SectionHeader
      data-data-table-header=""
      search={toolbar?.search}
      actions={shown ? <HeadControls {...controls} /> : undefined}
    >
      {title ? (
        <SectionTitle id={headingId} level={level === 3 ? 3 : 2} truncate>
          {title}
        </SectionTitle>
      ) : null}
      {description ? (
        <SectionDescription data-data-table-description="">{description}</SectionDescription>
      ) : null}
    </SectionHeader>
  );
}
