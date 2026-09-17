'use client';

import { useQuery } from '@tanstack/react-query';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import type { SourceFilters } from '@/components/visibility/source-rows';
import type { useVisibilityQueries } from '@/lib/visibility/use-visibility-dashboard';

export type SourceQueries = ReturnType<typeof useVisibilityQueries>;

/** A query parameter is either a value or absent; null is neither. */
function set<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export type SourceScope = {
  dimension: 'domain' | 'url';
  /** Set when drilling into one domain; the table then lists its pages. */
  domain: string | null;
  offset: string | null;
  asOf: string | null;
  sourceType: string | null;
  pageSize: number;
};

/**
 * The run/engine/period selection every Sources read shares.
 *
 * Built once so the table, the usage chart and a URL's detail are all reading
 * the same measurement. Three call sites assembling their own would be three
 * chances for a chart to describe a different selection from the table under
 * it — and nothing on the screen would say so.
 */
function selectionParams(filters: SourceFilters, queries: SourceQueries) {
  return {
    audit_id: queries.selectedRunIds ? undefined : set(queries.activeRunId),
    audit_ids: queries.selectedRunIds,
    engine: set(filters.engine === 'all' ? null : filters.engine),
    cohort: filters.cohort,
  };
}

/**
 * The paged, filterable source table.
 *
 * `dimension` decides what a row IS. A domain row groups a publisher; a URL row
 * is one page. The endpoint expresses the second as "a domain is selected", so
 * the URL table asks for every page across every domain by leaving `domain`
 * unset and reading the page-keyed rows the projection returns for it.
 */
export function useSourceAnalysis(
  filters: SourceFilters,
  queries: SourceQueries,
  scope: SourceScope,
) {
  const comparison = queries.visibilityQuery.data?.comparison;
  const params = {
    ...selectionParams(filters, queries),
    baseline_audit_ids:
      comparison?.status === 'comparable' ? comparison.baseline_audit_ids : undefined,
    domain: set(scope.domain),
    source_type: set(scope.sourceType),
    dimension: scope.dimension,
    offset: Math.max(0, Number.parseInt(scope.offset ?? '0', 10) || 0),
    as_of: set(scope.asOf),
    limit: scope.pageSize,
  };
  const sourceQuery = useQuery({
    queryKey: queryKeys.visibility.sources(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getSources(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(queries.projectId && queries.activeRunId),
    // Hold the page on screen while the next one loads: without it the header
    // fell back to "Unknown" and the table emptied on every offset change.
    placeholderData: (data, query) => retainPreviousDataForScope(queries.projectId!, data, query),
  });
  return { params, sourceQuery };
}

/**
 * The usage-over-time chart above the table.
 *
 * A separate read, and a separate cache namespace, because it does not page.
 * Folding it into the table query would refetch the whole chart every time a
 * reader stepped to the next page of rows.
 */
export function useSourceSeries(
  filters: SourceFilters,
  queries: SourceQueries,
  scope: Pick<SourceScope, 'dimension' | 'domain' | 'sourceType'>,
) {
  const params = {
    ...selectionParams(filters, queries),
    dimension: scope.dimension,
    granularity: filters.granularity === 'run' ? 'day' : filters.granularity,
    domain: set(scope.domain),
    source_type: set(scope.sourceType),
  };
  return useQuery({
    queryKey: queryKeys.visibility.sourceSeries(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getSourceSeries(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(queries.projectId && queries.activeRunId),
  });
}

/** One cited URL's detail page: overview, engines, prompts, co-named brands. */
export function useSourceUrl(filters: SourceFilters, queries: SourceQueries, url: string | null) {
  const params = { ...selectionParams(filters, queries), url: url ?? '' };
  return useQuery({
    queryKey: queryKeys.visibility.sourceUrl(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getSourceUrl(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(queries.projectId && queries.activeRunId && url),
  });
}
