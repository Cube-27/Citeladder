'use client';

import { useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import {
  EvidenceEmpty,
  EvidenceBusyBar,
  EvidenceError,
  EvidenceFilteredEmpty,
  EvidenceSkeleton,
  ExecutionHeader,
  TruncationNotice,
  type EvidenceTabProps,
} from '@/components/visibility/evidence-states';
import { ExternalLink } from 'lucide-react';
import { classificationBadgeValue, classificationLabel } from '@/lib/runs/status';
import type { VisibilityExecutionEvidence } from '@/lib/api/types';
import { totalCitationCount, totalMentionCount } from '@/lib/visibility/evidence';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { textRole } from '@/components/ui/typography';
import { panelClasses } from '@/components/ui/panel';
import { ledgerClasses } from '@/components/ui/workspace';

const TITLE = 'Mentions & Citations';

/** Executions per page, matching the shared table footer used across the app. */
const PAGE_SIZE = 10;

function safeUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Mentions & Citations tab — persisted brand/competitor mention rows and
 * classified citation records, grouped by execution, with selected-run / prompt
 * / engine context and task/analysis/artifact provenance. It renders only
 * PERSISTED rows (never inferred) and does NOT render a generated-query list —
 * that belongs to Query Fanout.
 *
 * States: skeleton, retryable error, empty (no persisted evidence), filtered
 * empty, and a truncation notice when the newest window overflowed.
 */
export function MentionsCitations({ query, isFiltered, onClearFilters, limit }: EvidenceTabProps) {
  const items = query.data?.items ?? [];
  const truncated = query.data?.truncated ?? false;
  // Before the early returns: a hook cannot sit behind a conditional.
  const { page, setPage, pageCount, from, to } = useTablePage(items.length, PAGE_SIZE);
  // Paging the SERVER cursor replaces every item, so the local page has to
  // start over. `useTablePage` only clamps, which rescues a window that got
  // shorter but leaves a reader who asked for the next window sitting on its
  // third page. The key changes on a new window and not on a refetch that
  // returns the same one, so a background poll does not yank the page back.
  const windowKey = `${query.data?.as_of ?? ''}:${items[0]?.analysis_id ?? ''}:${items.length}`;
  useEffect(() => setPage(1), [windowKey, setPage]);

  if (query.isLoading) {
    return <EvidenceSkeleton title={TITLE} />;
  }
  if (query.isError) {
    return <EvidenceError title={TITLE} onRetry={() => query.refetch()} />;
  }

  if (items.length === 0) {
    return isFiltered ? (
      <EvidenceFilteredEmpty
        title={TITLE}
        body="No persisted mentions or citations match the selected run, engine, prompt, and date range. Widen the range or clear a filter."
        onClear={onClearFilters}
      />
    ) : (
      <EvidenceEmpty
        title={TITLE}
        heading="No mentions or citations yet"
        body="Once a run executes your prompts, the brand and competitor mentions and the sources cited in each answer appear here."
      />
    );
  }

  return (
    <LoadedEvidence
      query={query}
      items={items}
      truncated={truncated}
      limit={limit}
      paging={{ page, setPage, pageCount, from, to }}
    />
  );
}

/**
 * The card itself, once there is evidence to draw.
 *
 * Split from the component above so that one holds the states (loading, error,
 * empty, filtered-empty) and this holds the content. Together they exceeded the
 * complexity ceiling, and the states were the half that made the content hard
 * to find.
 */
function LoadedEvidence({
  query,
  items,
  truncated,
  limit,
  paging,
}: Readonly<{
  query: EvidenceTabProps['query'];
  items: readonly VisibilityExecutionEvidence[];
  truncated: boolean;
  limit: EvidenceTabProps['limit'];
  paging: ReturnType<typeof useTablePage>;
}>) {
  const { page, setPage, pageCount, from, to } = paging;
  // Counted over the executions actually on screen, so the "this page" badge
  // and the rows below it never disagree.
  const paged = items.slice(from - 1, to);
  return (
    <Card className="relative" aria-busy={query.isFetching}>
      <EvidenceBusyBar active={query.isFetching} />
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{TITLE}</CardTitle>
          <p className={textRole('body')}>
            Persisted mentions and classified citations, grouped by execution.
          </p>
        </div>
        <Badge variant="neutral">
          {query.data?.total ?? 'Unknown'} matching answers · this page: {totalMentionCount(paged)}{' '}
          mentions · {totalCitationCount(paged)} citations
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-0 p-0">
        <ul className={ledgerClasses()}>
          {paged.map((item) => (
            <ExecutionEvidenceRow key={item.analysis_id} item={item} />
          ))}
        </ul>
        {items.length > PAGE_SIZE ? (
          <TablePagination
            page={page}
            pageCount={pageCount}
            from={from}
            to={to}
            total={items.length}
            noun="answers"
            onPageChange={setPage}
          />
        ) : null}
        {truncated ? <TruncationNotice limit={limit} /> : null}
      </CardContent>
    </Card>
  );
}

function ExecutionEvidenceRow({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  return (
    <li className="hover:bg-panel-tonal/40 grid gap-3 px-[var(--card-padding)] py-4 transition-colors">
      <div className={panelClasses({ tone: 'well', pad: 'compact' }, 'grid gap-1.5')}>
        <p className={textRole('body', 'leading-relaxed')}>
          {item.prompt_text || 'Untitled prompt'}
        </p>
        <ExecutionHeader item={item} />
      </div>

      {!item.mentions.length && !item.citations.length ? (
        <p>No tracked mentions or citations in this answer.</p>
      ) : null}
      {item.mentions.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={eyebrowClasses}>Mentions</p>
          <div className="flex flex-wrap gap-1.5">
            {item.mentions.map((mention) => (
              <Badge
                key={`${mention.artifact_id ?? item.analysis_id}:${mention.analyzer_version}:${mention.kind}:${mention.name}:${mention.first_offset ?? 'na'}`}
                variant="classification"
                value={mention.kind === 'brand' ? 'owned' : 'competitor'}
              >
                {mention.name || (mention.kind === 'brand' ? 'Brand' : 'Competitor')}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {item.citations.length > 0 ? (
        <div className="grid gap-1.5">
          <p className={eyebrowClasses}>Citations</p>
          <ul className={ledgerClasses('boxed')}>
            {item.citations.map((citation) => {
              const href = safeUrl(citation.url);
              return (
                <li
                  key={`${item.analysis_id}-${citation.ordinal}-${citation.url}`}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={textRole(
                          'label',
                          'hover:text-accent-text inline-flex max-w-full items-center gap-1.5 transition-colors hover:underline',
                        )}
                      >
                        <span className="truncate">
                          {citation.title?.trim() || citation.domain || citation.url}
                        </span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className={textRole('label', 'block truncate')}>
                        {citation.title?.trim() || citation.domain || citation.url}
                      </span>
                    )}
                    {citation.domain && citation.title ? (
                      <span className="text-muted block truncate text-xs">{citation.domain}</span>
                    ) : null}
                  </div>
                  <Badge
                    className="shrink-0"
                    variant="classification"
                    value={classificationBadgeValue(citation.classification)}
                  >
                    {classificationLabel(citation.classification)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
