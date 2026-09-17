'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import type { visibilitySourcesSchema } from '@/lib/api/schemas/visibility-evidence';
import { visibilityApi } from '@/lib/api/visibility';
import { sourceCategoryLabels } from '@/lib/visibility/vocabulary';
import type { SourceFilters } from '@/components/visibility/source-rows';
import type { useVisibilityQueries } from '@/lib/visibility/use-visibility-dashboard';

export type SourceData = z.infer<typeof visibilitySourcesSchema>;
export type SourceQueries = ReturnType<typeof useVisibilityQueries>;
export type SourceType = { token: string; label: string; domains: number; share: number };

/** A query parameter is either a value or absent; null is neither. */
function set<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * How many domains the compact strip above the answers shows.
 *
 * The strip exists so a reader landing on the evidence still sees WHICH sites
 * the models drew on. It is an orientation band, not a table — the full list
 * is one deliberate switch away.
 */
const SOURCE_STRIP_LIMIT = 8;

export type SourceScope = {
  mode: string;
  domain: string | null;
  offset: string | null;
  asOf: string | null;
  sourceType: string | null;
  pageSize: number;
};

/**
 * The cited-sources read, scoped to whichever half of the tab is showing.
 *
 * Both halves ask the same endpoint. The answers half wants a short, unpaged,
 * unfiltered list of the top domains to orient the reader; the sources half
 * wants the paged, filterable table. They are the same question at two
 * resolutions, so they share one hook and one cache namespace rather than
 * growing a second client.
 */
export function useSourceAnalysis(
  filters: SourceFilters,
  queries: SourceQueries,
  scope: SourceScope,
) {
  const comparison = queries.visibilityQuery.data?.comparison;
  const params = {
    audit_id: queries.selectedRunIds ? undefined : set(queries.activeRunId),
    audit_ids: queries.selectedRunIds,
    baseline_audit_ids:
      comparison?.status === 'comparable' ? comparison.baseline_audit_ids : undefined,
    engine: set(filters.engine === 'all' ? null : filters.engine),
    cohort: filters.cohort,
    ...tableParams(scope),
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
 * The narrowing only the domain TABLE applies.
 *
 * The strip above the answers is an orientation band: it shows the top
 * domains of the whole selection, so paging, the domain drill-down and the
 * source-type filter are all deliberately absent from it. Folding these into
 * the caller inline put every one of them behind its own conditional.
 */
function tableParams(scope: SourceScope) {
  if (scope.mode !== 'sources') {
    return {
      domain: undefined,
      source_type: undefined,
      offset: 0,
      as_of: undefined,
      limit: SOURCE_STRIP_LIMIT,
    };
  }
  return {
    domain: set(scope.domain),
    source_type: set(scope.sourceType),
    offset: Math.max(0, Number.parseInt(scope.offset ?? '0', 10) || 0),
    as_of: set(scope.asOf),
    limit: scope.pageSize,
  };
}

/**
 * The mix of sites the models drew on.
 *
 * Counted server-side over the whole selection. This folded the loaded rows
 * until the backend published a rollup, which meant page one could pass for the
 * whole picture on any project with more domains than fit a page.
 */
export function useSourceTypes(data?: SourceData): SourceType[] {
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
