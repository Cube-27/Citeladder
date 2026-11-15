import { useState } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { InfoHint } from '@/components/ui/info-hint';
import { Inline } from '@/components/ui/layout';
import { pageNumberControls, useTablePage } from '@/components/ui/pager';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import type { DemandDetectorPolicy } from '@citeladder/contracts';
import type { DemandSignal } from '@/lib/api/demand';
import { TABLE_DEFAULT_PAGE_SIZE, isTablePageSize, type TablePageSize } from '@/lib/config/tables';
import {
  numericMetric,
  signalPage,
  signalSubject,
  signalDefinition,
  signalTarget,
  signalTypeMeta,
  type RankedSignal,
} from '@/lib/demand/signals';
import { formatCount, formatPercent } from '@/lib/format';

/**
 * The row itself is the Inspect target, and the evidence drawer it opens
 * holds the hand-off (Open Action or Ask agent), so the row carries no
 * control column and every priority column fits the main column at 982.
 * The rank is the signal's place in the whole snapshot, so it holds when a
 * filter hides the signals above it; as the low-priority tail it may scroll.
 */
const COLUMNS: readonly DataTableColumn[] = [
  { key: 'target', label: 'Query or page', kind: 'identity' },
  { key: 'signal', label: 'Signal', kind: 'status', width: 'category' },
  { key: 'impressions', label: 'Impressions', kind: 'number', width: 'short' },
  { key: 'clicks', label: 'Clicks', kind: 'number', width: 'control' },
  { key: 'ctr', label: 'CTR', kind: 'number', width: 'control' },
  { key: 'position', label: 'Position', kind: 'number', width: 'control' },
  { key: 'rank', label: 'Rank', kind: 'number', width: 'index' },
];

/** A signal type as a labelled chip; its meaning lives in the legend. */
export function SignalChip({ signalType }: Readonly<{ signalType: string }>) {
  const meta = signalTypeMeta(signalType);
  return meta.tone === 'neutral' ? (
    <Tag>{meta.label}</Tag>
  ) : (
    <StatusMark variant="status" value={meta.tone}>
      {meta.label}
    </StatusMark>
  );
}

/**
 * Each signal type in the snapshot, explained once (plan §12), behind one
 * hint on the summary line so it is read before the table. It lists the
 * whole snapshot's types rather than the filtered ones, so choosing a filter
 * never changes it.
 */
export function SignalLegend({
  signals,
  policy,
}: Readonly<{ signals: readonly DemandSignal[]; policy: DemandDetectorPolicy }>) {
  const types = [...new Set(signals.map((signal) => signal.signal_type))];
  if (types.length === 0) return null;
  // One line per type: joined into a sentence, each definition ran into the
  // next type's label.
  return (
    <Inline as="span" gap="tight">
      Signal types
      <InfoHint label="Signal types">
        {types.map((type) => {
          const meta = signalTypeMeta(type);
          return (
            <span key={type} className="block">
              {`${meta.label}: ${signalDefinition(type, policy)} `}
            </span>
          );
        })}
      </InfoHint>
    </Inline>
  );
}

/**
 * The signals, one flat row each in priority order, a page at a time. The
 * landing page rides under its query as a caption instead of a full-width
 * group row, so every row is a signal. Detail stays in the evidence drawer.
 *
 * The whole list is already in the persisted snapshot, so it pages on the
 * client. `filterKey` names the active filter: a new filter starts at page 1,
 * while a refetch of the same filter only clamps the page into range.
 */
export function DemandSignalTable({
  rows,
  filterKey,
  onInspect,
}: Readonly<{
  rows: readonly RankedSignal[];
  filterKey: string;
  onInspect: (signal: DemandSignal) => void;
}>) {
  const [pageSize, setPageSize] = useState<TablePageSize>(TABLE_DEFAULT_PAGE_SIZE);
  const { page, setPage, pageCount, from, to } = useTablePage(rows.length, pageSize);
  const [pagedFilter, setPagedFilter] = useState(filterKey);
  if (pagedFilter !== filterKey) {
    setPagedFilter(filterKey);
    setPage(1);
  }

  const pageRows = rows.slice(from - 1, to);
  // Paging never moves the layout: a short last page keeps a full page's
  // height (a single page just ends).
  return (
    <DataTable
      label="Search demand signals"
      columns={COLUMNS}
      rowLines={2}
      rowCount={pageRows.length}
      pageSize={pageCount > 1 ? pageSize : undefined}
      pager={{
        range: { from, to, total: rows.length, noun: 'signals' },
        pageSize: {
          value: pageSize,
          onChange: (size) => {
            setPageSize(isTablePageSize(size) ? size : TABLE_DEFAULT_PAGE_SIZE);
            setPage(1);
          },
        },
        ...pageNumberControls(page, pageCount, setPage),
      }}
    >
      {pageRows.map(({ signal, rank }) => (
        <SignalRow key={signal.id} signal={signal} rank={rank} onInspect={onInspect} />
      ))}
    </DataTable>
  );
}

function SignalRow({
  signal,
  rank,
  onInspect,
}: Readonly<{ signal: DemandSignal; rank: number; onInspect: (signal: DemandSignal) => void }>) {
  const subject = signalSubject(signal);
  const inspect = () => onInspect(signal);
  // A press that selected text is not a request to inspect.
  const inspectFromRow = () => {
    if (!window.getSelection()?.isCollapsed) return;
    inspect();
  };
  return (
    // The row is the Inspect target: pressed, or Enter/Space while focused.
    // Native row and cell semantics stay; its name says what it opens.
    <TableRow
      tabIndex={0}
      aria-label={`Inspect evidence for ${signalTarget(signal)}`}
      onClick={inspectFromRow}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        inspect();
      }}
      className="focus-ring cursor-pointer"
    >
      <TableCell>
        {/* Always two lines, so every row is one height, and the second
            always says whether the row is about a query or a page. */}
        <TableCellLines
          title
          primary={subject.primary}
          secondary={subject.secondary}
          secondaryTooltip={signalPage(signal)}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <SignalChip signalType={signal.signal_type} />
      </TableCell>
      <TableCell numeric>
        <Count value={numericMetric(signal, 'impressions')} />
      </TableCell>
      <TableCell numeric>
        <Count value={numericMetric(signal, 'clicks')} />
      </TableCell>
      <TableCell numeric>
        <Ctr signal={signal} />
      </TableCell>
      <TableCell numeric>
        <Position value={numericMetric(signal, 'position')} />
      </TableCell>
      <TableCell numeric>{rank}</TableCell>
    </TableRow>
  );
}

function Count({ value }: Readonly<{ value: number | null }>) {
  return value === null ? <Absence state="not_measured" narrow /> : formatCount(value);
}

function Position({ value }: Readonly<{ value: number | null }>) {
  return value === null ? <Absence state="not_measured" narrow /> : value.toFixed(1);
}

/** The persisted CTR, else clicks over impressions; never a guessed zero. */
function Ctr({ signal }: Readonly<{ signal: DemandSignal }>) {
  const persisted = numericMetric(signal, 'ctr');
  if (persisted !== null) return formatPercent(persisted);
  const impressions = numericMetric(signal, 'impressions');
  const clicks = numericMetric(signal, 'clicks');
  if (impressions === null || clicks === null || impressions === 0)
    return <Absence state="not_measured" narrow />;
  return formatPercent(clicks / impressions);
}
