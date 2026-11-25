import type { AccuracyClaim, AccuracyClaimPage } from '@citeladder/contracts/fact-checking';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import { AnswerLink } from '@/components/runs/answer-link';
import { EditedMark, VerdictChip } from '@/components/runs/evidence-claims';
import { Absence } from '@/components/ui/absence';
import { choiceFilter } from '@/components/ui/all-filters';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table-columns';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  CLAIM_STATE_LABELS,
  CLAIM_STATE_VIEWS,
  type ClaimStateView,
} from '@/lib/visibility/accuracy';
import { useEngineCatalog } from '@/lib/providers/engines';
import type { useFactViews } from '@/lib/visibility/use-accuracy';

type Views = ReturnType<typeof useFactViews>;
type Query = UseInfiniteQueryResult<InfiniteData<AccuracyClaimPage>>;

const COLUMNS = [
  { key: 'prompt', label: 'Prompt', kind: 'identity' },
  { key: 'quote', label: 'Answer said' },
  { key: 'fact', label: 'Your fact' },
  { key: 'verdict', label: 'Verdict', width: 'category' },
  { key: 'engine', label: 'Engine', width: 'shortMetric' },
] as const satisfies readonly DataTableColumn[];

export function ClaimsTable({
  views,
}: Readonly<{ views: Pick<Views, 'claims' | 'claimState' | 'setClaimState'> }>) {
  const { claims: query, claimState, setClaimState } = views;
  const claims = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <DataTable
      label="All claims"
      columns={COLUMNS}
      rowCount={claims.length}
      toolbar={{
        filters: [
          choiceFilter<ClaimStateView>({
            id: 'claim-state',
            label: 'Verdict',
            value: claimState,
            defaultValue: 'decided',
            groups: [
              {
                options: CLAIM_STATE_VIEWS.map((value) => ({
                  value,
                  label: CLAIM_STATE_LABELS[value],
                })),
              },
            ],
            onChange: (value) => setClaimState(value),
          }),
        ],
      }}
      state={tableState(query, claims, claimState)}
      footer={
        query.hasNextPage ? (
          <Button
            variant="secondary"
            pending={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Show more claims
          </Button>
        ) : undefined
      }
    >
      {claims.map((claim) => (
        <ClaimRow key={`${claim.execution_id}:${claim.claim}:${claim.quote}`} claim={claim} />
      ))}
    </DataTable>
  );
}

function tableState(query: Query, claims: readonly AccuracyClaim[], state: ClaimStateView) {
  if (query.isPending) return { kind: 'loading', label: 'Loading claims' } as const;
  if (query.isError)
    return {
      kind: 'error',
      error: query.error,
      title: "Couldn't load the claims",
      fallback: 'The claims could not be loaded.',
      onRetry: () => void query.refetch(),
      pending: query.isFetching,
    } as const;
  if (!claims.length)
    return {
      kind: 'empty',
      inline: true,
      message:
        state === 'all'
          ? 'No claims in these answers.'
          : `No ${CLAIM_STATE_LABELS[state].toLowerCase()} claims in these answers.`,
    } as const;
  return undefined;
}

function ClaimRow({ claim }: Readonly<{ claim: AccuracyClaim }>) {
  const { label: engineLabel } = useEngineCatalog();
  const facts = claim.facts.map((fact) => fact.statement).join('; ');
  return (
    <TableRow>
      <TableCell>
        <span className="block min-w-0 truncate" title={claim.prompt}>
          <AnswerLink answer={claim} text="inherit">
            {claim.prompt}
          </AnswerLink>
        </span>
      </TableCell>
      <TableCell>
        <span className="block min-w-0 truncate" title={claim.quote}>
          <AnswerLink answer={claim} text="inherit" tone="muted">
            “{claim.quote}”
          </AnswerLink>
        </span>
      </TableCell>
      <TableCell>
        {facts ? (
          <span className="text-ink-2 block min-w-0 truncate" title={facts}>
            {facts}
          </span>
        ) : (
          <Absence label="No fact on this point" />
        )}
      </TableCell>
      <TableCell>
        <Inline gap="tight" className="flex-nowrap">
          <VerdictChip claim={claim} />
          <EditedMark edited={claim.edited} />
        </Inline>
      </TableCell>
      <TableCell>{engineLabel(claim.logical_engine)}</TableCell>
    </TableRow>
  );
}
