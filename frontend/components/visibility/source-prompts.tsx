'use client';

import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { BusyBar } from '@/components/ui/busy-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { AnswerEvidenceRow } from '@/components/visibility/answer-evidence';
import { queryKeys } from '@/lib/api/query-keys';
import type { VisibilityExecutionEvidence } from '@/lib/api/types';
import { visibilityApi } from '@/lib/api/visibility';
import type { SourceFilters } from '@/components/visibility/source-rows';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';

/**
 * The tracked answers that used this source, with their prompts.
 *
 * Reads `/visibility/evidence` narrowed by domain or URL rather than adding a
 * third place that assembles an answer list. The endpoint already supports both
 * filters; what this adds is the narrowing and the frame around it.
 */
export function SourcePrompts({
  filters,
  queries,
  domain,
  url,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  domain?: string | null;
  url?: string | null;
}>) {
  const params = {
    audit_id: queries.selectedRunIds ? undefined : (queries.activeRunId ?? undefined),
    audit_ids: queries.selectedRunIds,
    engine: filters.engine === 'all' ? undefined : filters.engine,
    cohort: filters.cohort,
    domain: domain ?? undefined,
    url: url ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.visibility.evidence(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getVisibilityEvidence(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(queries.projectId && queries.activeRunId && (domain || url)),
  });

  return (
    <Card className="relative" aria-busy={query.isFetching}>
      <BusyBar active={query.isFetching} label="Updating answers" />
      <CardHeader>
        <CardTitle>Prompts</CardTitle>
        <p className={textRole('meta', 'text-secondary')}>
          {url
            ? 'The tracked answers that cited this URL, as they were recorded.'
            : 'The tracked answers where this domain appeared as a source.'}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <AnswerList
          items={query.data?.items ?? []}
          loading={query.isLoading}
          errored={query.isError}
          highlightUrl={url}
        />
      </CardContent>
    </Card>
  );
}

/** The list itself, once its states are somebody else's problem. */
function AnswerList({
  items,
  loading,
  errored,
  highlightUrl,
}: Readonly<{
  items: readonly VisibilityExecutionEvidence[];
  loading: boolean;
  errored: boolean;
  highlightUrl?: string | null;
}>) {
  if (errored) return <Alert tone="danger">Could not load the tracked answers.</Alert>;
  if (loading) return <Skeleton className="m-[var(--card-padding)] h-40" />;
  if (items.length === 0) {
    return (
      <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
        No tracked answers in this selection used this source.
      </p>
    );
  }
  return (
    <ul className={ledgerClasses()}>
      {items.map((item) => (
        <AnswerEvidenceRow key={item.analysis_id} item={item} highlightUrl={highlightUrl} />
      ))}
    </ul>
  );
}
