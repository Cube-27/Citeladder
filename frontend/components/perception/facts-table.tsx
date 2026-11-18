import type { AccuracyFact, AccuracyFactList } from '@citeladder/contracts/fact-checking';
import type { UseQueryResult } from '@tanstack/react-query';

import { Absence } from '@/components/ui/absence';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table-columns';
import { TableCell, TableRow, TableTime } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { VERDICT_LABELS } from '@/lib/visibility/accuracy';

const COLUMNS = [
  { key: 'fact', label: 'Fact, as frozen in the run', kind: 'identity' },
  { key: 'claims', label: 'Claims', width: 'figure', kind: 'number' },
  { key: 'supported', label: VERDICT_LABELS.supported, width: 'figure', kind: 'number' },
  { key: 'contradicted', label: VERDICT_LABELS.contradicted, width: 'figure', kind: 'number' },
  { key: 'inconclusive', label: VERDICT_LABELS.inconclusive, width: 'figure', kind: 'number' },
  { key: 'last', label: 'Last raised', kind: 'date' },
] as const satisfies readonly DataTableColumn[];

/**
 * Claim verdicts grouped by the fact revision each run froze, so an edited
 * fact never rewrites past claims. A fact no checked claim cited reads "not
 * raised" across its counts, never zeros.
 */
export function FactsTable({ query }: Readonly<{ query: UseQueryResult<AccuracyFactList> }>) {
  const facts = query.data?.facts ?? [];
  return (
    <DataTable
      label="Claims by fact"
      columns={COLUMNS}
      rowCount={facts.length}
      state={tableState(query, facts)}
      busy={{ active: query.isFetching && query.isPlaceholderData, label: 'Updating facts' }}
    >
      {facts.map((fact) => (
        <FactRow key={fact.revision_id} fact={fact} />
      ))}
    </DataTable>
  );
}

function tableState(query: UseQueryResult<AccuracyFactList>, facts: readonly AccuracyFact[]) {
  if (query.isPending) return { kind: 'loading', label: 'Loading facts' } as const;
  if (query.isError)
    return {
      kind: 'error',
      error: query.error,
      title: "Couldn't load the facts",
      fallback: 'The facts could not be loaded.',
      onRetry: () => void query.refetch(),
      pending: query.isFetching,
    } as const;
  if (!facts.length)
    return {
      kind: 'empty',
      inline: true,
      message: 'No confirmed facts were frozen in these runs.',
    } as const;
  return undefined;
}

function FactRow({ fact }: Readonly<{ fact: AccuracyFact }>) {
  const { counts } = fact;
  return (
    <TableRow>
      <TableCell>
        <span className="block min-w-0 truncate" title={fact.statement}>
          {fact.statement}{' '}
          <span className={textRole('caption', 'text-ink-2')}>· revision {fact.revision}</span>
        </span>
      </TableCell>
      {counts.kind === 'raised' ? (
        <>
          <TableCell numeric>{counts.claims}</TableCell>
          <TableCell numeric>{counts.supported}</TableCell>
          <TableCell numeric>{counts.contradicted}</TableCell>
          <TableCell numeric>{counts.inconclusive}</TableCell>
          <TableCell>
            <TableTime value={counts.last_raised_at} />
          </TableCell>
        </>
      ) : (
        <TableCell colSpan={5}>
          <Absence label="Not raised in any answer" />
        </TableCell>
      )}
    </TableRow>
  );
}
