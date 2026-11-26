import type { AccuracyClaim, AccuracyClaimPage } from '@citeladder/contracts/fact-checking';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';

import { choiceFilter } from '@/components/ui/all-filters';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { CLAIM_COLUMNS, ClaimRow, claimKey } from '@/components/visibility/claim-row';
import {
  CLAIM_STATE_LABELS,
  CLAIM_STATE_VIEWS,
  type ClaimStateView,
} from '@/lib/visibility/accuracy';
import type { useFactViews } from '@/lib/visibility/use-accuracy';

type Views = ReturnType<typeof useFactViews>;
type Query = UseInfiniteQueryResult<InfiniteData<AccuracyClaimPage>>;

export function ClaimsTable({
  views,
}: Readonly<{ views: Pick<Views, 'claims' | 'claimState' | 'setClaimState'> }>) {
  const { claims: query, claimState, setClaimState } = views;
  const claims = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <DataTable
      label="All claims"
      columns={CLAIM_COLUMNS}
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
        <ClaimRow key={claimKey(claim)} claim={claim} />
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
