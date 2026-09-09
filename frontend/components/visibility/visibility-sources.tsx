'use client';

import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { visibilitySourcesSchema } from '@/lib/api/schemas/visibility-evidence';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { ANSWER_OUTCOMES } from '@/lib/config/visibility';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import {
  optionalStringUrlCodec,
  setUrlParams,
  stringUrlCodec,
  useUrlState,
} from '@/lib/navigation/url-state';
import { formatRate } from '@/lib/visibility/dashboard';
import { formatChange } from '@/components/visibility/ranking-rows';
import type {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

const modes = [
  { value: 'sources', label: 'Sources' },
  { value: 'answers', label: 'Answers' },
] as const;
const modeCodec = stringUrlCodec(
  modes.map((item) => item.value),
  'sources',
);

export function VisibilitySources({
  filters,
  queries,
  children,
}: Readonly<{
  filters: ReturnType<typeof useVisibilityFilters>;
  queries: ReturnType<typeof useVisibilityQueries>;
  children: ReactNode;
}>) {
  const [mode, setMode] = useUrlState('mode', modeCodec);
  const [domain] = useUrlState('source_domain', optionalStringUrlCodec);
  const [offset] = useUrlState('source_offset', optionalStringUrlCodec);
  const [asOf] = useUrlState('source_as_of', optionalStringUrlCodec);
  const { params, sourceQuery } = useSourceAnalysis(filters, queries, mode, domain, offset, asOf);
  return (
    <Stack gap="workspace">
      <div className="flex flex-wrap gap-2">
        <AnalysisChoice
          label="Mentions and citations mode"
          value={mode}
          options={modes}
          onChange={setMode}
        />
        {mode === 'answers' ? (
          <AnalysisChoice
            label="Answer outcome"
            value={filters.outcome ?? 'all'}
            options={ANSWER_OUTCOMES}
            onChange={(value) => filters.setOutcome(value === 'all' ? null : value)}
          />
        ) : null}
        {filters.competitor && mode === 'answers' ? (
          <span>Competitor present, brand absent: {filters.competitor}</span>
        ) : null}
      </div>
      {mode === 'answers' ? (
        children
      ) : (
        <Card>
          <SourceHeader data={sourceQuery.data} domain={domain} />
          <CardContent className="p-0">
            {sourceQuery.isError ? (
              <Alert tone="danger">Could not load source analysis.</Alert>
            ) : null}
            {sourceQuery.isLoading ? <p aria-busy="true">Loading sources…</p> : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{domain ? 'URL' : 'Domain'}</TableHead>
                  <TableHead numeric>Response coverage</TableHead>
                  <TableHead numeric>Prompt coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceQuery.data?.items.map((row) => (
                  <SourceTableRow
                    key={row.key}
                    row={row}
                    domain={domain}
                    filters={filters}
                    activeRunId={queries.activeRunId}
                  />
                ))}
              </TableBody>
            </Table>
            {sourceQuery.data?.total === 0 ? (
              <p className="p-[var(--card-padding)]">No cited sources in this selection.</p>
            ) : null}
            <div className="flex flex-wrap gap-2 p-[var(--card-padding)]">
              <span>
                {sourceQuery.data?.total ?? 'Unknown'} {domain ? 'URLs' : 'domains'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!params.offset}
                onClick={() => setUrlParams({ source_offset: null, source_as_of: null })}
              >
                First sources
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={sourceQuery.data?.next_offset == null}
                onClick={() =>
                  setUrlParams({
                    source_offset: String(sourceQuery.data!.next_offset),
                    source_as_of: sourceQuery.data!.as_of,
                  })
                }
              >
                Next sources
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

type SourceFilters = ReturnType<typeof useVisibilityFilters>;
type SourceQueries = ReturnType<typeof useVisibilityQueries>;

function useSourceAnalysis(
  filters: SourceFilters,
  queries: SourceQueries,
  mode: string,
  domain: string | null,
  offset: string | null,
  asOf: string | null,
) {
  const params = {
    audit_id: queries.selectedRunIds ? undefined : (queries.activeRunId ?? undefined),
    audit_ids: queries.selectedRunIds,
    baseline_audit_ids:
      queries.visibilityQuery.data?.comparison?.status === 'comparable'
        ? queries.visibilityQuery.data.comparison.baseline_audit_ids
        : undefined,
    engine: filters.engine === 'all' ? undefined : filters.engine,
    cohort: filters.cohort,
    domain: domain ?? undefined,
    offset: Math.max(0, Number.parseInt(offset ?? '0', 10) || 0),
    as_of: asOf ?? undefined,
  };
  const sourceQuery = useQuery({
    queryKey: queryKeys.visibility.sources(queries.projectId ?? '', params),
    queryFn: ({ signal }) => visibilityApi.getSources(queries.projectId!, params, { signal }),
    enabled: mode === 'sources' && Boolean(queries.projectId && queries.activeRunId),
    // Hold the page on screen while the next one loads: without it the header
    // fell back to "Unknown" and the table emptied on every offset change.
    placeholderData: (data, query) => retainPreviousDataForScope(queries.projectId!, data, query),
  });
  return { params, sourceQuery };
}

function SourceTableRow({
  row,
  domain,
  filters,
  activeRunId,
}: {
  row: z.infer<typeof visibilitySourcesSchema>['items'][number];
  domain: string | null;
  filters: SourceFilters;
  activeRunId: string | null;
}) {
  return (
    <TableRow>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            domain
              ? filters.openEvidence({
                  run: activeRunId,
                  domain,
                  url: row.key,
                })
              : setUrlParams({
                  source_domain: row.key,
                  source_offset: null,
                  source_as_of: null,
                })
          }
        >
          {row.key || 'Domain unavailable'}
        </Button>
        <details>
          <summary className="focus-ring cursor-pointer">Source details</summary>
          <p>Ownership: {row.ownership.join(', ')}</p>
          <p>
            Category: {row.categories.join(', ') || 'Unavailable'}
            {row.category_unavailable && row.categories.length
              ? ' · some historical categories unavailable'
              : ''}
          </p>
          <p>
            {row.annotations} annotations · {row.urls} distinct URLs
          </p>
          <p>Taxonomy: {row.taxonomy_versions.join(', ') || 'Unavailable'}</p>
          <p>Response coverage change: {formatChange(row.response_delta)}</p>
        </details>
      </TableCell>
      <TableCell numeric>
        {formatRate(row.response_rate)} · {row.responses} responses
      </TableCell>
      <TableCell numeric>
        {formatRate(row.prompt_coverage)} · {row.prompts} prompts
      </TableCell>
    </TableRow>
  );
}

function SourceHeader({
  data,
  domain,
}: {
  data: z.infer<typeof visibilitySourcesSchema> | undefined;
  domain: string | null;
}) {
  return (
    <CardHeader>
      <CardTitle>{domain ? `Cited URLs · ${domain}` : 'Cited sources'}</CardTitle>
      <p>
        {data?.responses ?? 'Unknown'} measured responses · {data?.prompts ?? 'unknown'} prompts
      </p>
      <p>{data?.comparison_status.replaceAll('_', ' ') ?? 'Comparison unavailable'}</p>
      {domain ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setUrlParams({ source_domain: null, source_offset: null, source_as_of: null })
          }
        >
          All domains
        </Button>
      ) : null}
    </CardHeader>
  );
}
