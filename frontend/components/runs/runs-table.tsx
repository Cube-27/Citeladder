import type { ReactNode } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn, type DataTablePager } from '@/components/ui/data-table';
import { useServerTablePage } from '@/components/ui/pager';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { useQuery } from '@tanstack/react-query';

import type { Audit, AuditStatus } from '@citeladder/contracts';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { runsQueries } from '@/lib/api/runs';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { marketLabel } from '@citeladder/contracts/markets';
import { Play } from '@/lib/icons';
import { formatCount, formatDisplayTimestamp } from '@/lib/format';
import { AUDIT_STATES, countedStatuses, pollAudits, runKind } from '@/lib/runs/status';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { sortUrlCodec, useUrlState, type UrlSort } from '@/lib/navigation/url-state';
import { Text } from '@/components/ui/typography';

const sameLaunch = (audit: Audit, previous: Audit | undefined) =>
  audit.launch_id !== null && previous?.launch_id === audit.launch_id;

const PAGE_KEYS = ['page'] as const;

const SORT_KEYS = ['created', 'requested', 'completed', 'failed'] as const;
type SortKey = (typeof SORT_KEYS)[number];
type Sort = UrlSort<SortKey>;
const SORT_CODEC = sortUrlCodec(SORT_KEYS, { key: 'created', descending: true });

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

export type RunsTablePage = Readonly<{
  sort: Sort;
  onSort: (key: SortKey) => void;
  pageSize: number;
  pager: DataTablePager;
}>;

export function useRunsPage(statuses: readonly AuditStatus[]) {
  const { workspaceId, projectId } = useProjectScope();
  const [sort, setSort] = useUrlState('sort', SORT_CODEC, { clearKeys: PAGE_KEYS });
  const { page, pageSize, pager } = useServerTablePage(PAGE_KEYS[0]);
  const query = useQuery({
    ...runsQueries.list(
      { workspaceId, projectId },
      {
        status: statuses,
        sort: sort.key,
        descending: sort.descending,
        page,
        page_size: pageSize,
      },
    ),
    placeholderData: (data, previous) =>
      String(previous?.queryKey[4].status) === String(statuses)
        ? retainPreviousDataForScope(projectId, data, previous)
        : undefined,
    refetchInterval: (current) => pollAudits(countedStatuses(current.state.data?.status_counts)),
  });
  const onSort = (key: SortKey) =>
    setSort(sort.key === key ? { key, descending: !sort.descending } : { key, descending: true });
  return {
    query,
    table: {
      sort,
      onSort,
      pageSize,
      pager: pager({ total: query.data?.total ?? 0, noun: 'runs' }),
    } satisfies RunsTablePage,
  };
}

export function RunsTable({
  audits,
  table,
  status,
  emptyHeading,
}: Readonly<{
  audits: readonly Audit[];
  table: RunsTablePage;
  status: ReactNode;
  emptyHeading: string;
}>) {
  const timeZone = useDisplayTimeZone();
  const { sort, onSort, pageSize, pager } = table;
  return (
    <DataTable
      title="All runs"
      actions={
        <Text as="output" variant="caption" box="row">
          {status}
        </Text>
      }
      columns={runsColumns(sort, onSort)}
      pageSize={pageSize}
      state={
        audits.length === 0
          ? { kind: 'empty', headingLevel: 3, icon: Play, heading: emptyHeading }
          : undefined
      }
      pager={pager}
    >
      {audits.map((audit, index) => (
        <TableRow key={audit.id}>
          <TableCell>
            <TableCellLines
              title
              primary={
                <TextLink href={`/runs/${audit.id}`} underline="hover">
                  {`${formatDisplayTimestamp(audit.created_at, timeZone)} · ${runKind(audit)}`}
                </TextLink>
              }
              secondary={runCaption({
                audit,
                launchAbove: sort.key === 'created' && sameLaunch(audit, audits[index - 1]),
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
  );
}

function runCaption({
  audit,
  launchAbove,
}: Readonly<{ audit: Audit; launchAbove: boolean }>): string {
  const parts = [
    audit.market.id === null ? '' : marketLabel(audit.market),
    launchAbove ? 'Same launch as above' : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
