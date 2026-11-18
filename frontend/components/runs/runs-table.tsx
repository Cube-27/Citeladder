import { useState, type ReactNode } from 'react';
import { Play } from 'lucide-react';

import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { pageNumberControls, useTablePage } from '@/components/ui/pager';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { Inline } from '@/components/ui/layout';
import { TitledSection } from '@/components/ui/section';
import type { Audit } from '@citeladder/contracts';
import { marketLabel } from '@citeladder/contracts/markets';
import { formatCount, formatDisplayTime } from '@/lib/format';
import { AUDIT_STATES, runTitle } from '@/lib/runs/status';
import { useDisplayTimeZone } from '@/lib/display-timezone';

/** A launch's per-market runs arrive together; later rows point back to the first. */
const sameLaunch = (audit: Audit, previous: Audit | undefined) =>
  audit.launch_id !== null && previous?.launch_id === audit.launch_id;

/** Rows per page on the runs table (client-side; the list arrives whole). */
const PAGE_SIZE = 10;

type SortKey = 'created' | 'requested' | 'completed' | 'failed';
type Sort = Readonly<{ key: SortKey; descending: boolean }>;

const SORT_VALUE: Record<SortKey, (audit: Audit) => number> = {
  created: (audit) => Date.parse(audit.created_at),
  requested: (audit) => audit.requested_count,
  completed: (audit) => audit.completed_count,
  failed: (audit) => audit.failed_count,
};

function sortAudits(audits: readonly Audit[], sort: Sort): Audit[] {
  const value = SORT_VALUE[sort.key];
  const direction = sort.descending ? -1 : 1;
  return [...audits].sort((a, b) => (value(a) - value(b)) * direction);
}

function runsColumns(sort: Sort, onSort: (key: SortKey) => void): DataTableColumn[] {
  const sortable = (key: SortKey) => ({
    active: sort.key === key,
    descending: sort.descending,
    onSort: () => onSort(key),
  });
  return [
    { key: 'run', label: 'Run', kind: 'identity', sort: sortable('created') },
    { key: 'status', label: 'Status', width: 'status' },
    {
      key: 'requested',
      label: 'Requested',
      width: 'figure',
      kind: 'number',
      sort: sortable('requested'),
    },
    {
      key: 'completed',
      label: 'Completed',
      width: 'figure',
      kind: 'number',
      sort: sortable('completed'),
    },
    { key: 'failed', label: 'Failed', width: 'figure', kind: 'number', sort: sortable('failed') },
  ];
}

/**
 * Runs (audits) list table (F10), on the shared `DataTable`.
 *
 * One row per audit, named by its own title (scope and day) that links to
 * the run; the caption gives the time, the market when it is not the
 * project's default, or that the row belongs to the launch above. Every
 * column but the status sorts; newest first by default. A status filter that
 * matches nothing keeps the header and states the absence inside the table.
 */
export function RunsTable({
  audits,
  status,
  emptyHeading,
}: Readonly<{
  /** The runs the status filter left. */
  audits: Audit[];
  /** A live note in the table header, e.g. that the list is polling. */
  status: ReactNode;
  /** What the filtered-empty state says. */
  emptyHeading: string;
}>) {
  const timeZone = useDisplayTimeZone();
  const [sort, setSort] = useState<Sort>({ key: 'created', descending: true });
  const sorted = sortAudits(audits, sort);
  const { page, setPage, pageCount, from, to } = useTablePage(sorted.length, {
    pageSize: PAGE_SIZE,
  });
  const pagedAudits = sorted.slice(from - 1, to);
  const onSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key ? { key, descending: !current.descending } : { key, descending: true },
    );
    setPage(1);
  };

  return (
    <TitledSection
      title="All runs"
      // Mounted while idle (empty), so the first polling note is announced.
      actions={
        <Inline as="output" className="type-caption">
          {status}
        </Inline>
      }
    >
      <DataTable
        label="All runs"
        columns={runsColumns(sort, onSort)}
        pageSize={PAGE_SIZE}
        rowCount={pagedAudits.length}
        rowLines={3}
        state={
          audits.length === 0
            ? { kind: 'empty', headingLevel: 3, icon: Play, heading: emptyHeading }
            : undefined
        }
        pager={{
          range: { from, to, total: sorted.length, noun: 'runs' },
          ...pageNumberControls(page, pageCount, setPage),
        }}
      >
        {pagedAudits.map((audit, index) => (
          <TableRow key={audit.id}>
            <TableCell>
              <TableCellLines
                title
                primary={
                  <TextLink href={`/runs/${audit.id}`} underline="hover">
                    {runTitle(audit, timeZone)}
                  </TextLink>
                }
                secondary={runCaption({
                  audit,
                  timeZone,
                  launchAbove: sort.key === 'created' && sameLaunch(audit, pagedAudits[index - 1]),
                })}
              />
            </TableCell>
            <TableCell>
              <StatusMark variant="run-status" value={AUDIT_STATES[audit.status].badge}>
                {AUDIT_STATES[audit.status].label}
              </StatusMark>
            </TableCell>
            <TableCell numeric>{formatCount(audit.requested_count)}</TableCell>
            <TableCell numeric>{formatCount(audit.completed_count)}</TableCell>
            <TableCell numeric>{formatCount(audit.failed_count)}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

/** The time it was created, its market when not the default, or its place in the launch above. */
function runCaption({
  audit,
  timeZone,
  launchAbove,
}: Readonly<{ audit: Audit; timeZone: string; launchAbove: boolean }>): string {
  const parts = [
    formatDisplayTime(audit.created_at, timeZone),
    audit.market.id === null ? '' : marketLabel(audit.market),
    launchAbove ? 'Same launch as above' : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
