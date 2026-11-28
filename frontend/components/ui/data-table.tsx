import {
  useContext,
  useId,
  useLayoutEffect,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

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
import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';
import { useScrollFrame, type ScrollFrameState } from '@/components/ui/scroll-edges';
import { Table } from '@/components/ui/table';
import { TabHeadSlotContext } from '@/components/ui/tab-head-slot';
import { Notice } from '@/components/ui/notice';
import { StateBlock, type RefreshError } from '@/components/ui/state-block';
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
  refreshError,
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
  refreshError?: RefreshError;
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
  const paging = pagingLayout(pager, pageSize);
  const scroll = useScrollFrame({ label: parts.regionLabel, start: false });
  const replacing = replacingState(state);
  const tray = headerShown({
    tabHead: useContext(TabHeadSlotContext),
    titled: Boolean(title || description),
    shown: hasHeadControls({ ...toolbar, actions: toolbar?.actions || actions }),
    search: toolbar?.search,
  });
  return (
    <Section
      tray={tray}
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
      {refreshError ? <Notice kind="read" {...refreshError} /> : null}
      <ReplacedFootprint state={replacing} level={stateLevel(title, level)}>
        <DataTableFrame
          scroll={scroll}
          naming={parts.naming}
          pinned={parts.pinned}
          frameRef={frameRef}
          scope={headingId}
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
          >
            <ShownColumnsContext value={shownKeys}>
              {state === undefined ? children : null}
            </ShownColumnsContext>
          </DataTableBody>
        </DataTableFrame>
      </ReplacedFootprint>
      {busy ? <BusyRung active={busy.active} label={busy.label} /> : null}
    </Section>
  );
}

function ReplacedFootprint({
  state,
  level,
  children,
}: Readonly<{
  state: ComponentProps<typeof StateBlock> | null;
  level: HeadingLevel;
  children: ReactNode;
}>) {
  const block = state ? <ReplacingState state={state} level={level} /> : null;
  return (
    <>
      {block}
      <SectionBleed hidden={block !== null}>{children}</SectionBleed>
    </>
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
  foot,
  children,
}: Readonly<{
  scroll: ScrollFrameState;
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
  const smallest = Math.min(...(pager.pageSize.options ?? TABLE_PAGE_SIZE_OPTIONS));
  if (pager.pageSize.value > smallest) return true;
  return 'total' in pager.range && pager.range.total > smallest;
}

function pagingLayout(
  pager: DataTablePager | undefined,
  pageSize: number | undefined,
): { pager?: DataTablePager; pageSize?: number } {
  if (pager === undefined) return { pageSize };
  return hasMorePages(pager) ? { pager, pageSize } : {};
}

function headerShown({
  tabHead,
  titled,
  shown,
  search,
}: Readonly<{ tabHead: HTMLElement | null; titled: boolean; shown: boolean; search: unknown }>) {
  if (tabHead !== null && !titled) return Boolean(search);
  return titled || shown || Boolean(search);
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
  const tabHead = useContext(TabHeadSlotContext);
  const shown = hasHeadControls({ ...toolbar, actions: toolbar?.actions || actions });
  const controls = shown ? (
    <HeadControls
      {...toolbar}
      actions={
        <>
          {toolbar?.actions}
          {actions}
        </>
      }
    />
  ) : undefined;
  const titled = Boolean(title || description);
  if (tabHead !== null && !titled)
    return <LiftedHeader slot={tabHead} controls={controls} search={toolbar?.search} />;
  if (!headerShown({ tabHead, titled, shown, search: toolbar?.search })) return null;
  return (
    <SectionHeader data-data-table-header="" search={toolbar?.search} actions={controls}>
      {titled ? (
        <HeaderText title={title} headingId={headingId} level={level} description={description} />
      ) : null}
    </SectionHeader>
  );
}

function LiftedHeader({
  slot,
  controls,
  search,
}: Readonly<{ slot: HTMLElement; controls?: ReactNode; search?: TableToolbarProps['search'] }>) {
  return (
    <>
      {controls ? createPortal(controls, slot) : null}
      {search ? <SectionHeader data-data-table-header="" search={search} /> : null}
    </>
  );
}

function HeaderText({
  title,
  headingId,
  level,
  description,
}: Readonly<{ title?: string; headingId: string; level: HeadingLevel; description?: ReactNode }>) {
  return (
    <>
      {title ? (
        <SectionTitle id={headingId} level={level === 3 ? 3 : 2} truncate>
          {title}
        </SectionTitle>
      ) : null}
      {description ? <SectionDescription>{description}</SectionDescription> : null}
    </>
  );
}
