'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EvidenceEmpty,
  EvidencePagination,
  EvidenceBusyBar,
  EvidenceError,
  EvidenceFilteredEmpty,
  EvidenceSkeleton,
  TruncationNotice,
  type EvidenceTabProps,
} from '@/components/visibility/evidence-states';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import { engineLabel } from '@/lib/visibility/dashboard';
import {
  searchRows,
  searchRowsByPrompt,
  searchRowsByTopic,
  type SearchGroup,
} from '@/lib/visibility/fanout-grouping';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';

const TITLE = 'Query fanouts';

/** The run/engine/cohort scope the evidence table was read under. */
export type FanoutScope = Readonly<{
  audit_id?: string;
  audit_ids?: string[];
  engine?: string;
  cohort?: string;
}>;

/** Rows (or groups) per page, matching the shared table footer. */
const PAGE_SIZE = 10;

/** What a page of this grouping is counting, for the shared table footer. */
const GROUP_NOUNS: Record<string, string> = {
  none: 'searches',
  prompt: 'prompts',
  topic: 'topics',
};

const GROUP_OPTIONS = [
  { value: 'none', label: 'Group by: None' },
  { value: 'prompt', label: 'Group by: Prompt' },
  { value: 'topic', label: 'Group by: Topic' },
] as const;

const groupCodec = stringUrlCodec(
  GROUP_OPTIONS.map((option) => option.value),
  'none',
);

/**
 * The searches an engine ran before answering, as ONE table.
 *
 * This tab used to be two stacked cards that answered the same question twice:
 * a summary card listing query strings with event counts, and a second card
 * repeating every query nested inside per-execution panels. Both are folded
 * into one table whose grouping the reader chooses — no grouping, by prompt, or
 * by topic — which is the only axis that actually changed between them.
 *
 * The three per-execution states stay distinct, because they are different
 * facts: a query whose text the model exposed becomes a row; a search whose
 * wording was withheld, and an answer that searched nothing at all, are counted
 * under the group rather than invented as rows.
 */
export function FanoutEvidence({
  query,
  isFiltered,
  onClearFilters,
  limit,
  onNextPage,
  projectId,
  runId,
  scope,
  scopeReady,
}: EvidenceTabProps &
  Readonly<{
    projectId: string | null;
    runId: string | null;
    scope: FanoutScope;
    scopeReady: boolean;
  }>) {
  const {
    grouping,
    setGrouping,
    search,
    setSearch,
    items,
    visible,
    paged,
    totals,
    unit,
    page,
    setPage,
    pageCount,
    from,
    to,
  } = useSearchTable(query, projectId, runId);
  const summary = useFanoutSummary(projectId, scope, scopeReady, search);

  if (query.isLoading) return <EvidenceSkeleton title={TITLE} />;
  if (query.isError) return <EvidenceError title={TITLE} onRetry={() => query.refetch()} />;
  if (items.length === 0) {
    return isFiltered ? (
      <EvidenceFilteredEmpty
        title={TITLE}
        body="No answers match the selected run, model, prompt and period. Widen the period or clear a filter."
        onClear={onClearFilters}
      />
    ) : (
      <EvidenceEmpty
        title={TITLE}
        heading="No searches recorded yet"
        body="Once a run answers your prompts, the searches each engine ran first appear here."
      />
    );
  }

  return (
    <Card className="relative" aria-busy={query.isFetching}>
      <EvidenceBusyBar active={query.isFetching} />
      <CardHeader className="grid gap-1">
        <CardTitle>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-0 p-0">
        <SelectionTotals summary={summary} fallback={totals} />
        <div className="border-border-subtle flex flex-wrap items-center gap-2 border-t px-[var(--card-padding)] py-3">
          <Input
            type="search"
            value={search ?? ''}
            onChange={(event) => setSearch(event.target.value || null)}
            placeholder="Search queries…"
            aria-label="Filter searches by text"
            className="max-w-xs"
          />
          <SearchScopeNote search={search} matched={summary.matchedQueries} />
          <span className="grow" />
          <AnalysisChoice
            label="Group searches by"
            value={grouping}
            options={GROUP_OPTIONS}
            onChange={setGrouping}
          />
        </div>
        {visible.length === 0 ? (
          <NoSearchMatch search={search} matched={summary.matchedQueries} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead>Model</TableHead>
                <TableHead numeric className="w-32">
                  Occurrences
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((group) => (
                <SearchGroupRows key={group.key} group={group} />
              ))}
            </TableBody>
          </Table>
        )}
        {unit > PAGE_SIZE ? (
          <TablePagination
            page={page}
            pageCount={pageCount}
            from={from}
            to={to}
            total={unit}
            noun={GROUP_NOUNS[grouping]}
            onPageChange={setPage}
          />
        ) : null}
        {onNextPage ? (
          <EvidencePagination
            nextCursor={query.data?.next_cursor ?? null}
            asOf={query.data?.as_of ?? null}
            onPage={onNextPage}
          />
        ) : query.data?.truncated ? (
          <TruncationNotice limit={limit} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Everything the table derives from one loaded evidence window.
 *
 * Kept out of the component because it is all one derivation — choose a
 * grouping, filter by text, page the result, and total what survives — and
 * reading it inline buried the four states the component actually renders.
 */
function useSearchTable(
  query: EvidenceTabProps['query'],
  projectId: string | null,
  runId: string | null,
) {
  const [grouping, setGrouping] = useUrlState('group', groupCodec);
  const [search, setSearch] = useUrlState('q', optionalStringUrlCodec);
  const topicOf = usePromptTopics(projectId, runId, grouping === 'topic');
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const groups = useMemo(() => {
    if (grouping === 'prompt') return searchRowsByPrompt(items);
    if (grouping === 'topic') return searchRowsByTopic(items, topicOf);
    return searchRows(items);
  }, [items, grouping, topicOf]);
  const visible = useMemo(() => {
    const needle = (search ?? '').trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.query.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.rows.length);
  }, [groups, search]);
  // Totalled over what the reader can SEE. Counting `groups` reported every
  // search in the window while the table showed only the ones matching a
  // filter, so the two disagreed the moment anything was typed.
  const totals = useMemo(
    () => ({
      distinct: new Set(visible.flatMap((group) => group.rows.map((row) => row.query))).size,
      occurrences: visible.reduce(
        (sum, group) => sum + group.rows.reduce((rows, row) => rows + row.occurrences, 0),
        0,
      ),
    }),
    [visible],
  );
  // Grouped views page by group so a prompt's searches are never split across
  // two pages; the ungrouped view pages by row.
  const grouped = grouping !== 'none';
  const unit = grouped ? visible.length : (visible[0]?.rows.length ?? 0);
  const { page, setPage, pageCount, from, to } = useTablePage(unit, PAGE_SIZE);
  // Regrouping or searching produces a different set; page 3 of the old set is
  // not page 3 of the new one.
  useEffect(() => setPage(1), [grouping, search, setPage]);
  const paged = grouped
    ? visible.slice(from - 1, to)
    : visible.map((group) => ({ ...group, rows: group.rows.slice(from - 1, to) }));
  return {
    grouping,
    setGrouping,
    search,
    setSearch,
    items,
    visible,
    paged,
    totals,
    unit,
    page,
    setPage,
    pageCount,
    from,
    to,
  };
}

function Total({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="grid gap-0.5">
      <span className={textRole('label')}>{label}</span>
      <span className={textRole('metric')}>{value}</span>
    </div>
  );
}

/**
 * One group's heading row and its searches, inside the shared table.
 *
 * A group renders as rows of the SAME table rather than a table of its own, so
 * every search in the tab sits on one set of columns. Repeating a header per
 * group restarted the column widths at each prompt and left nothing aligned.
 */
function SearchGroupRows({ group }: Readonly<{ group: SearchGroup }>) {
  const note = [
    group.undisclosed
      ? `${group.undisclosed} ${group.undisclosed === 1 ? 'answer' : 'answers'} searched without returning the wording`
      : null,
    group.silent ? `${group.silent} answered without searching` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      {group.label ? (
        <TableRow>
          <TableCell colSpan={3} className="bg-surface-2">
            <span className={textRole('bodyStrong')}>{group.label}</span>
          </TableCell>
        </TableRow>
      ) : null}
      {group.rows.map((row) => (
        <TableRow key={`${group.key}-${row.query}`}>
          <TableCell>
            <span
              className={group.label ? 'flex items-start gap-2 ps-4' : 'flex items-start gap-2'}
            >
              <Search className="text-muted mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="break-words">{row.query}</span>
            </span>
          </TableCell>
          <TableCell>{row.engines.map(engineLabel).join(', ')}</TableCell>
          <TableCell numeric>{row.occurrences}</TableCell>
        </TableRow>
      ))}
      {note ? (
        <TableRow>
          <TableCell colSpan={3} className={textRole('meta', 'text-secondary')}>
            {note}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Prompt-to-topic map for the topic grouping.
 *
 * Evidence rows carry no topic; the prompt metrics projection already publishes
 * one per prompt, so the join happens here rather than being pushed into the
 * evidence endpoint. Only fetched when the reader actually groups by topic.
 */
type FanoutSummary = Readonly<{
  distinctQueries: number | null;
  eventCount: number | null;
  matchedQueries: number | null;
}>;

/**
 * The two headline figures, and the scope they describe.
 *
 * They come from the server's aggregation over the COMPLETE selection, so
 * they hold still while the reader pages and types. They used to be derived
 * from whichever evidence window happened to be loaded and shown under these
 * same labels, so they moved on every page. `fallback` is only for the first
 * paint, before the summary lands.
 */
function SelectionTotals({
  summary,
  fallback,
}: Readonly<{ summary: FanoutSummary; fallback: { distinct: number; occurrences: number } }>) {
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4 px-[var(--card-padding)] pb-4">
      <Total label="Distinct searches" value={summary.distinctQueries ?? fallback.distinct} />
      <Total label="Total occurrences" value={summary.eventCount ?? fallback.occurrences} />
      <span className={textRole('label', 'text-secondary')}>across the selected run set</span>
    </div>
  );
}

/** How many searches the typed filter matches across the whole run set. */
function SearchScopeNote({
  search,
  matched,
}: Readonly<{ search: string | null; matched: number | null }>) {
  if (!search || matched == null) return null;
  return (
    <span className={textRole('label', 'text-secondary')}>
      {matched === 0
        ? 'No searches match in this run set'
        : `${matched} matching ${matched === 1 ? 'search' : 'searches'} in this run set`}
    </span>
  );
}

/**
 * Nothing on THIS page matched — which is not the same as nothing matching.
 *
 * The table renders one loaded window. When the server reports matches the
 * window does not contain, say so and point at the pager, rather than
 * claiming the query does not exist.
 */
function NoSearchMatch({
  search,
  matched,
}: Readonly<{ search: string | null; matched: number | null }>) {
  const elsewhere = matched
    ? ` — ${matched} match further into the run set. Load more below.`
    : '.';
  return (
    <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
      {`No search matches “${search}” on this page${elsewhere}`}
    </p>
  );
}

/**
 * Selection-wide fanout totals, straight from the server.
 *
 * The table below is one loaded evidence window, and deriving "Distinct
 * searches" and "Total occurrences" from it meant both figures changed as the
 * reader paged — they were page totals wearing selection labels. This asks the
 * projection that already aggregates the COMPLETE selection
 * (`domain/analysis/fanout_projection.py`), which it does with `limit=None`.
 *
 * `search` is sent too, so the count of matching queries covers the whole run
 * set rather than whatever happens to be loaded: a query stored past the first
 * page was previously unfindable.
 */
function useFanoutSummary(
  projectId: string | null,
  scope: FanoutScope,
  scopeReady: boolean,
  search: string | null,
) {
  const params = useMemo(
    () => ({ ...scope, search: search?.trim() || undefined }),
    [scope, search],
  );
  const result = useQuery({
    queryKey: queryKeys.visibility.fanout(projectId ?? '', params),
    queryFn: ({ signal }) => visibilityApi.getFanoutSummary(projectId ?? '', params, { signal }),
    enabled: Boolean(projectId) && scopeReady,
    // Totals for a selection do not change while the reader pages through it;
    // keeping the previous values avoids the headline flickering to blank.
    placeholderData: (previous) => previous,
  });
  return {
    distinctQueries: result.data?.distinct_queries ?? null,
    eventCount: result.data?.event_count ?? null,
    matchedQueries: result.data?.matched_queries ?? null,
  };
}

function usePromptTopics(projectId: string | null, runId: string | null, enabled: boolean) {
  const result = useQuery({
    queryKey: [...queryKeys.visibility.prompts(projectId ?? '', runId ?? undefined), 'topics'],
    queryFn: ({ signal }) =>
      visibilityApi.getPromptMetrics(projectId ?? '', runId ?? undefined, { signal }),
    enabled: enabled && Boolean(projectId && runId),
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of result.data ?? []) {
      const topic = row.theme || 'Unclassified';
      if (row.prompt_id) map.set(row.prompt_id, topic);
      if (row.prompt_snapshot_id) map.set(row.prompt_snapshot_id, topic);
    }
    return map;
  }, [result.data]);
}
