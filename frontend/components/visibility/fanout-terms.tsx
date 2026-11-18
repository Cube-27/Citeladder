import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import type { FanoutTermRow, VisibilityFanoutTerms } from '@citeladder/contracts';
import { BrandsNamed } from '@/components/prompts/prompt-past-answers';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { DataTableState } from '@/components/ui/data-table-body';
import { Delta } from '@/components/ui/delta';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { TableCell, TableRow } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { percentText } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';

/** Rows each view holds; the server serves at most this many per view. */
const PAGE_SIZE = 10;

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'term', label: 'Term' },
  { key: 'searches', label: 'Searches', kind: 'number' },
  { key: 'share', label: 'Share', kind: 'number' },
  { key: 'change', label: 'Change', kind: 'number' },
  { key: 'brands', label: 'Brands matched', kind: 'identity', width: 'lead' },
];

const VIEWS = [
  { value: 'top', label: 'Top' },
  { value: 'rising', label: 'Rising' },
  { value: 'falling', label: 'Falling' },
] as const;
type View = (typeof VIEWS)[number]['value'];

const LIST = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * The words engines searched for in the newest selected run, counted when the
 * run finished: Top by searches, Rising and Falling by share change since the
 * previous finished run.
 */
export function FanoutTerms({
  scope,
  enabled,
}: Readonly<{
  scope: Readonly<{ audit_id?: string; audit_ids?: string[]; cohort?: string }>;
  enabled: boolean;
}>) {
  const projectScope = useProjectScope();
  const engines = useEngineCatalog();
  const [view, setView] = useState<View>('top');
  const read = useQuery({
    ...visibilityQueries.fanoutTerms(projectScope, {
      audit_id: scope.audit_id,
      audit_ids: scope.audit_ids,
      cohort: scope.cohort,
    }),
    enabled,
  });
  const data = read.data;
  const rows = data?.kind === 'observed' ? data[view] : [];
  const unreported = data?.kind === 'observed' ? data.unreported_engines : [];
  return (
    <DataTable
      title="Search terms"
      description="Words engines searched for while answering"
      actions={
        <SegmentedControl
          ariaLabel="Search terms view"
          value={view}
          onChange={setView}
          options={VIEWS}
        />
      }
      columns={COLUMNS}
      pageSize={PAGE_SIZE}
      rowCount={rows.length}
      state={termsState(read, data, view)}
      footer={
        unreported.length
          ? `${LIST.format(unreported.map((engine) => engines.label(engine)))} ${unreported.length > 1 ? 'don’t' : 'doesn’t'} report ${unreported.length > 1 ? 'their' : 'its'} searches: not applicable.`
          : undefined
      }
    >
      {rows.map((row) => (
        <TermRow key={row.term} row={row} />
      ))}
    </DataTable>
  );
}

function TermRow({ row }: Readonly<{ row: FanoutTermRow }>) {
  return (
    <TableRow>
      <TableCell className={textRole('code')}>{row.term}</TableCell>
      <TableCell numeric>{row.searches}</TableCell>
      <TableCell numeric>{percentText(row.share)}</TableCell>
      <TableCell numeric>
        <Delta
          value={row.change === null ? null : row.change * 100}
          policy="neutral"
          unit=" pp"
          missingReason="No earlier run counted search terms to compare with."
        />
      </TableCell>
      <TableCell>
        <BrandsNamed brands={row.brands} />
      </TableCell>
    </TableRow>
  );
}

function termsState(
  read: RetryableRead & Readonly<{ isError: boolean }>,
  data: VisibilityFanoutTerms | undefined,
  view: View,
): DataTableState | undefined {
  if (read.isError && !data)
    return {
      kind: 'error',
      ...readErrorProps(read),
      title: "Couldn't load search terms",
      fallback: 'Check your connection and try again.',
    };
  if (!data) return { kind: 'loading', label: 'Loading search terms…' };
  const empty = (heading: string, description: string): DataTableState => ({
    kind: 'empty',
    headingLevel: 3,
    icon: Search,
    heading,
    description,
  });
  switch (data.kind) {
    case 'not_run':
      return empty('No finished run', 'Search terms are counted when a run finishes.');
    case 'unavailable':
      return empty(
        'Not counted for this run',
        'This run finished before search terms were counted. The next run will have them.',
      );
    case 'observed':
      if (!data.total_searches)
        return empty('No searches reported', 'No engine reported a search in this run.');
      if (view !== 'top' && !data.compared)
        return empty('Nothing to compare yet', 'Changes show once an earlier run counted terms.');
      if (!data[view].length)
        return empty(
          view === 'rising' ? 'No term rose' : 'No term fell',
          'Every term kept its share of searches since the previous run.',
        );
      return undefined;
    default: {
      const unreachable: never = data;
      return unreachable;
    }
  }
}
