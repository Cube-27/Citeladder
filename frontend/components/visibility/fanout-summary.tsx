'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import { optionalStringUrlCodec, setUrlParams, useUrlState } from '@/lib/navigation/url-state';
import type {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

export function FanoutSummary({
  filters,
  queries,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
}>) {
  const [selectedQuery] = useUrlState('query', optionalStringUrlCodec);
  const [offset] = useUrlState('query_offset', optionalStringUrlCodec);
  const { params, result } = useFanoutAnalysis(filters, queries, selectedQuery, offset);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {selectedQuery
            ? `Answers for observed query: ${selectedQuery}`
            : 'Observable search queries'}
        </CardTitle>
        <p>
          {result.data?.event_count ?? 'Unknown'} stored events ·{' '}
          {result.data?.distinct_queries ?? 'unknown'} distinct query strings
        </p>
        <p>
          {Object.entries(result.data?.coverage ?? {})
            .map(([state, count]) => `${state.replaceAll('_', ' ')}: ${count} responses`)
            .join(' · ')}
        </p>
        <p>
          Only exposed query events are observable. Query text availability does not establish
          complete search coverage.
        </p>
        {selectedQuery ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUrlParams({ query: null, query_offset: null })}
          >
            All observed queries
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {result.isError ? <Alert tone="danger">Could not load query summaries.</Alert> : null}
        {result.isLoading ? <p aria-busy="true">Loading observed queries…</p> : null}
        {selectedQuery ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt / engine</TableHead>
                <TableHead>Observed answer outcome</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data?.answers.map((answer) => (
                <TableRow key={answer.task_id}>
                  <TableCell>
                    {answer.prompt_text} · {answer.logical_engine}
                  </TableCell>
                  <TableCell>
                    {answer.brand_mentioned ? 'Brand present' : 'Brand absent'} ·{' '}
                    {answer.owned_domain_cited ? 'Owned citation' : 'No owned citation'}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/runs/${answer.audit_id}?execution=${answer.task_id}`}>
                        Open answer
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead numeric>Events</TableHead>
                <TableHead numeric>Prompts</TableHead>
                <TableHead>Answer outcomes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data?.items.map((row) => (
                <TableRow key={row.query}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUrlParams({ query: row.query, query_offset: null })}
                    >
                      {row.query}
                    </Button>
                    <p>{row.engines.join(', ')}</p>
                  </TableCell>
                  <TableCell numeric>{row.event_count}</TableCell>
                  <TableCell numeric>{row.prompt_count}</TableCell>
                  <TableCell>
                    {row.brand_response_count} of {row.response_count} answers mention the brand
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex flex-wrap gap-2 p-[var(--card-padding)]">
          <Button
            variant="secondary"
            size="sm"
            disabled={!params.offset}
            onClick={() => setUrlParams({ query_offset: null })}
          >
            First results
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={result.data?.next_offset == null}
            onClick={() => setUrlParams({ query_offset: String(result.data!.next_offset) })}
          >
            Next results
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function useFanoutAnalysis(
  filters: ReturnType<typeof useVisibilityFilters>,
  queries: ReturnType<typeof useVisibilityQueries>,
  selectedQuery: string | null,
  offset: string | null,
) {
  const params = {
    audit_id: queries.selectedRunIds ? undefined : (queries.activeRunId ?? undefined),
    audit_ids: queries.selectedRunIds,
    engine: filters.engine === 'all' ? undefined : filters.engine,
    cohort: filters.cohort,
    query: selectedQuery ?? undefined,
    offset: Math.max(0, Number.parseInt(offset ?? '0', 10) || 0),
  };
  const result = useQuery({
    queryKey: queryKeys.visibility.fanout(queries.projectId ?? '', params),
    queryFn: ({ signal }) => visibilityApi.getFanoutSummary(queries.projectId!, params, { signal }),
    enabled: Boolean(queries.projectId && queries.activeRunId),
    // As in Sources: paging must not empty the table it is paging.
    placeholderData: (data, query) => retainPreviousDataForScope(queries.projectId!, data, query),
  });
  return { params, result };
}
