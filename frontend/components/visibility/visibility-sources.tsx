'use client';

import { useMemo, type ReactNode } from 'react';
import type { z } from 'zod';
import type { visibilitySourcesSchema } from '@/lib/api/schemas/visibility-evidence';
import type { Visibility } from '@/lib/api/types';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { Stack } from '@/components/ui/layout';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { SOURCE_MODES } from '@/lib/config/visibility';
import { EVIDENCE_LIMIT } from '@/lib/config/operational';
import { TablePagination } from '@/components/ui/table-pagination';
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
import { textRole } from '@/components/ui/typography';
import { sourceCategoryLabels } from '@/lib/visibility/vocabulary';
import type {
  useVisibilityFilters,
  useVisibilityQueries,
} from '@/lib/visibility/use-visibility-dashboard';

const modeCodec = stringUrlCodec(
  SOURCE_MODES.map((item) => item.value),
  'sources',
);

type SourceRow = z.infer<typeof visibilitySourcesSchema>['items'][number];
type SourceData = z.infer<typeof visibilitySourcesSchema>;
type SourceFilters = ReturnType<typeof useVisibilityFilters>;
type SourceQueries = ReturnType<typeof useVisibilityQueries>;

export function VisibilitySources({
  filters,
  queries,
  children,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  children: ReactNode;
}>) {
  const [mode] = useUrlState('mode', modeCodec);
  const [domain] = useUrlState('source_domain', optionalStringUrlCodec);
  const [offset] = useUrlState('source_offset', optionalStringUrlCodec);
  const [asOf] = useUrlState('source_as_of', optionalStringUrlCodec);
  const [sourceType, setSourceType] = useUrlState('source_type', optionalStringUrlCodec);
  const { params, sourceQuery } = useSourceAnalysis(
    filters,
    queries,
    mode,
    domain,
    offset,
    asOf,
    sourceType,
  );
  const data = sourceQuery.data;
  const types = useSourceTypes(data);
  const rows = data?.items ?? [];

  return (
    <Stack gap="workspace">
      {filters.competitor && mode === 'answers' ? (
        <p className={textRole('meta', 'text-secondary')}>
          Answers naming {filters.competitor} but not you.
        </p>
      ) : null}
      {mode === 'answers' ? (
        children
      ) : (
        <>
          <SourceTotals
            data={data}
            domain={domain}
            citations={queries.visibilityQuery.data?.citation_totals}
          />
          <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>{domain ? `Cited pages · ${domain}` : 'Source domains'}</CardTitle>
                  <p className={textRole('meta', 'text-secondary')}>
                    {domain
                      ? 'The pages on this domain the models cited.'
                      : 'Ordered by how many answers cited them.'}
                  </p>
                </div>
                {types.length > 1 ? (
                  <AnalysisChoice
                    label="Filter by source type"
                    value={sourceType ?? 'all'}
                    options={[
                      { value: 'all', label: 'All source types' },
                      ...types.map((type) => ({ value: type.token, label: type.label })),
                    ]}
                    onChange={(value) => setSourceType(value === 'all' ? null : value)}
                  />
                ) : null}
              </CardHeader>
              <CardContent className="p-0">
                {sourceQuery.isError ? (
                  <Alert tone="danger">Could not load cited sources.</Alert>
                ) : null}
                {sourceQuery.isLoading ? <p aria-busy="true">Loading sources…</p> : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{domain ? 'Page' : 'Domain'}</TableHead>
                      <TableHead numeric>Answers</TableHead>
                      <TableHead numeric>Share of answers</TableHead>
                      <TableHead numeric className="hidden md:table-cell">
                        Prompts
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
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
                {data && rows.length === 0 ? (
                  <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
                    {sourceType
                      ? 'No sources of this type in this selection.'
                      : 'No cited sources in this selection.'}
                  </p>
                ) : null}
                <SourcePaging data={data} domain={domain} offset={params.offset} />
              </CardContent>
            </Card>
            <SourceTypes types={types} />
          </div>
        </>
      )}
    </Stack>
  );
}

/**
 * What the whole selection cited, as a sentence and the numbers behind it.
 *
 * The lede is a claim a reader can repeat — "cited by 96 sources" — with the
 * figures that support it beside it, rather than a row of bare tiles they have
 * to assemble into a sentence themselves.
 */
function SourceTotals({
  data,
  domain,
  citations,
}: Readonly<{
  data?: SourceData;
  domain: string | null;
  citations?: Visibility['citation_totals'];
}>) {
  if (!data) return null;
  return (
    <div className="bg-surface border-border-subtle grid gap-4 rounded-[var(--radius-card)] border p-[var(--card-padding)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <p className={textRole('objectTitle')}>
        {domain
          ? `${data.total} ${data.total === 1 ? 'page' : 'pages'} cited on ${domain}`
          : `Your answers cited ${data.total} ${data.total === 1 ? 'source' : 'sources'}`}
      </p>
      <MetricGroup className="lg:w-auto">
        <MetricItem
          label="Answers with a citation"
          value={String(data.responses)}
          detail={`across ${data.prompts} ${data.prompts === 1 ? 'prompt' : 'prompts'}`}
        />
        {citations ? (
          <MetricItem label="Citations earned" value={String(citations.citations)} />
        ) : null}
        {citations ? (
          <MetricItem
            label="Citations to your site"
            value={String(citations.owned_citations)}
            detail={
              citations.owned_share == null ? null : `${formatRate(citations.owned_share)} of all`
            }
          />
        ) : null}
      </MetricGroup>
    </div>
  );
}

type SourceType = { token: string; label: string; domains: number; share: number };

/**
 * The mix of sites the models drew on.
 *
 * Counted server-side over the whole selection. This folded the loaded rows
 * until the backend published a rollup, which meant page one could pass for the
 * whole picture on any project with more domains than fit a page.
 */
function useSourceTypes(data?: SourceData): SourceType[] {
  return useMemo(() => {
    const totals = data?.category_totals ?? {};
    const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
    return Object.entries(totals)
      .map(([token, domains]) => ({
        token,
        // An unmapped class is dropped rather than shown raw; that is how
        // `editorial_third_party` reached the screen in the first place.
        label: sourceCategoryLabels([token])[0],
        domains,
        share: total ? domains / total : 0,
      }))
      .filter((type): type is SourceType => Boolean(type.label))
      .sort((a, b) => b.domains - a.domains || a.label.localeCompare(b.label));
  }, [data]);
}

function SourceTypes({ types }: Readonly<{ types: SourceType[] }>) {
  if (!types.length) return null;
  return (
    <Card>
      <CardHeader className="grid gap-1">
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            Source types
            <InfoHint label="Source types">
              The kind of site each cited domain is. Independent editorial and review sites are the
              ones you cannot publish to directly.
            </InfoHint>
          </span>
        </CardTitle>
        <p className={textRole('meta', 'text-secondary')}>
          Across every cited domain in this selection.
        </p>
      </CardHeader>
      <CardContent>
        <Stack gap="compact">
          {types.map((type) => (
            <div key={type.label} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={textRole('body')}>{type.label}</span>
                <span className={textRole('metricSm')}>
                  {formatRate(type.share)}
                  <span className={textRole('meta', 'text-secondary ms-1.5')}>
                    {type.domains}
                  </span>
                </span>
              </div>
              <div className="bg-surface-2 h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ inlineSize: `${Math.max(2, type.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * The shared table footer, driven by the endpoint's offsets.
 *
 * The endpoint pages by offset rather than page number, so the page index is
 * derived from it. Using the app's one pagination control keeps this table
 * behaving like every other table in the product instead of growing its own
 * pair of buttons.
 */
function SourcePaging({
  data,
  domain,
  offset,
}: Readonly<{ data?: SourceData; domain: string | null; offset: number }>) {
  if (!data) return null;
  const total = data.total;
  const page = Math.floor(offset / EVIDENCE_LIMIT) + 1;
  const pageCount = Math.max(1, Math.ceil(total / EVIDENCE_LIMIT));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + data.items.length);
  return (
    <TablePagination
      page={page}
      pageCount={pageCount}
      from={from}
      to={to}
      total={total}
      noun={domain ? 'pages' : 'domains'}
      onPageChange={(next) => {
        const nextOffset = (next - 1) * EVIDENCE_LIMIT;
        setUrlParams({
          source_offset: nextOffset ? String(nextOffset) : null,
          source_as_of: nextOffset ? (data.as_of ?? null) : null,
        });
      }}
    />
  );
}

function useSourceAnalysis(
  filters: SourceFilters,
  queries: SourceQueries,
  mode: string,
  domain: string | null,
  offset: string | null,
  asOf: string | null,
  sourceType: string | null,
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
    source_type: sourceType ?? undefined,
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
  row: SourceRow;
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
              ? filters.openEvidence({ run: activeRunId, domain, url: row.key })
              : setUrlParams({
                  source_domain: row.key,
                  source_offset: null,
                  source_as_of: null,
                })
          }
        >
          {row.key || 'Domain unavailable'}
        </Button>
      </TableCell>
      <TableCell numeric>{row.responses}</TableCell>
      <TableCell numeric>{formatRate(row.response_rate)}</TableCell>
      <TableCell numeric className="hidden md:table-cell">
        {row.prompts}
      </TableCell>
    </TableRow>
  );
}
