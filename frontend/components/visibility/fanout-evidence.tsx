import { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, Search } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { pageNumberControls, useTablePage } from '@/components/ui/pager';
import { SearchField } from '@/components/ui/search-field';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import type { UseQueryResult } from '@tanstack/react-query';
import type { FanoutQueryRow, VisibilityEvidenceResponse } from '@citeladder/contracts';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { readErrorProps } from '@/components/ui/notice';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  normalizeSearch,
  SEARCH_MAX_LENGTH,
  searchRows,
  searchRowsByPrompt,
  searchRowsByTopic,
  type SearchGroup,
} from '@/lib/visibility/fanout-grouping';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';
import { TABLE_SEARCH_DEBOUNCE_MS } from '@/lib/config/operational';
import { useDebounced } from '@/lib/use-debounced';
import {
  isSelectionWide,
  selectionMatchedQueries,
  noSearchMatchState,
  SearchScopeNote,
  FanoutCounts,
} from '@/components/visibility/fanout-totals';
import {
  FANOUT_VIEWS,
  type FanoutScope,
  type FanoutView,
  METRIC_COLUMNS,
  movedState,
  QueryMetricCells,
  useFanoutQueries,
} from '@/components/visibility/fanout-query-metrics';
import { SegmentedControl } from '@/components/ui/tabs';

const TITLE = 'Query fanouts';

/** Rows (or groups) per page, matching the shared table footer. */
const PAGE_SIZE = 10;

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'search', label: 'Search' },
  // The page's filter calls these surfaces; the column uses the same word.
  { key: 'surface', label: 'Surface', width: 'name' },
  { key: 'occurrences', label: 'Occurrences', width: 'figure', kind: 'number' },
  ...METRIC_COLUMNS,
];

/** What a page of this grouping is counting, for the shared table footer. */
const GROUP_NOUNS: Record<(typeof GROUP_OPTIONS)[number]['value'], string> = {
  none: 'searches',
  prompt: 'prompts',
  topic: 'topics',
};

const GROUP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'topic', label: 'Topic' },
] as const;

const groupCodec = stringUrlCodec(
  GROUP_OPTIONS.map((option) => option.value),
  'none',
);

/**
 * How the searches are grouped, in the table's own All filters. It reads and
 * writes the same `group` URL state the table reads, so the menu and the
 * table never disagree.
 */
function useFanoutGroupFilter(): FilterDefinition {
  const [grouping, setGrouping] = useUrlState('group', groupCodec);
  return choiceFilter({
    id: 'fanout-group',
    label: 'Group by',
    value: grouping,
    defaultValue: 'none',
    groups: [{ options: GROUP_OPTIONS }],
    onChange: setGrouping,
  });
}

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
/** No searches at all, or none under the current filters. */
/** What the fanout tab reads: the evidence query and whether filters narrowed it. */
type EvidenceTabProps = Readonly<{
  query: UseQueryResult<VisibilityEvidenceResponse, unknown>;
  isFiltered: boolean;
  onClearFilters?: () => void;
  limit: number;
}>;

function FanoutEmpty({
  isFiltered,
  onClearFilters,
}: Readonly<Pick<EvidenceTabProps, 'isFiltered' | 'onClearFilters'>>) {
  if (isFiltered && onClearFilters)
    return (
      <StateBlock
        kind="filtered"
        heading="No answers match the selected run, model, prompt and period"
        onClear={onClearFilters}
      />
    );
  return (
    <StateBlock
      kind="empty"
      icon={Inbox}
      heading={isFiltered ? 'No answers match these filters' : 'No searches recorded yet'}
      description={
        isFiltered
          ? 'Widen the period or choose another run, model or prompt.'
          : 'Once a run answers your prompts, the searches each engine ran first appear here.'
      }
      action={
        isFiltered ? undefined : (
          <Button asChild>
            <ProjectLink href="/runs">
              <Icon icon={ArrowRight} />
              View Runs
            </ProjectLink>
          </Button>
        )
      }
    />
  );
}

export function FanoutEvidence({
  query,
  isFiltered,
  onClearFilters,
  limit,
  runId,
  scope,
  scopeReady,
}: EvidenceTabProps &
  Readonly<{
    runId: string | null;
    scope: FanoutScope;
    scopeReady: boolean;
  }>) {
  const groupFilter = useFanoutGroupFilter();
  const [view, setView] = useState<FanoutView>('top');
  const queries = useFanoutQueries(scope, scopeReady, view);
  const {
    grouping,
    search,
    setSearch,
    needle,
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
  } = useSearchTable(query, runId);
  const serverNeedle = useDebounced(needle, TABLE_SEARCH_DEBOUNCE_MS);
  const summary = useFanoutSummary(scope, scopeReady, serverNeedle);
  const summaryMatchesInput = serverNeedle === needle && !summary.isFetching;
  // False until the server's counts land; the headline shows what the reader can see.
  const selectionWide = isSelectionWide(summary);
  const matched = summaryMatchesInput ? selectionMatchedQueries(summary) : null;
  const top = view === 'top';

  // Pending, not merely loading: a read still waiting on its scope fetches
  // nothing and has no items, which is not "no searches recorded".
  if (query.isPending)
    return (
      <StateBlock
        kind="loading"
        label="Loading evidence…"
        shape={{ kind: 'table', columns: COLUMNS.length }}
      />
    );
  if (query.isError)
    return (
      <StateBlock
        kind="error"
        title="Couldn't load this evidence"
        fallback="The request failed or timed out. Your filters are unchanged."
        {...readErrorProps(query)}
      />
    );
  if (items.length === 0) {
    return <FanoutEmpty isFiltered={isFiltered} onClearFilters={onClearFilters} />;
  }

  return (
    // Named, not titled: the tab row already says "Query fanouts", so a
    // heading over the table only repeated it (2026-11-03 app review).
    <DataTable
      label={TITLE}
      busy={{ active: query.isFetching || queries.read.isFetching, label: 'Updating evidence' }}
      toolbar={{
        // Rising and Falling rank queries by share change; they are never grouped.
        view: (
          <SegmentedControl
            ariaLabel="Query fanouts view"
            value={view}
            onChange={setView}
            options={FANOUT_VIEWS}
          />
        ),
        search: (
          <SearchField
            value={search ?? ''}
            onValueChange={(value) => setSearch(value || null)}
            placeholder="Search queries…"
            aria-label="Filter searches by text"
            maxLength={SEARCH_MAX_LENGTH}
          />
        ),
        // How the table groups is its own filter, after the search.
        filters: [groupFilter],
        // What the table holds closes the row: the counts, and what a search kept.
        status: (
          <>
            {needle && matched != null ? (
              <SearchScopeNote search={needle} matched={matched} />
            ) : null}
            <span aria-busy={!summaryMatchesInput}>
              <FanoutCounts summary={summary} fallback={totals} selectionWide={selectionWide} />
            </span>
          </>
        ),
      }}
      columns={COLUMNS}
      state={
        top
          ? visible.length === 0
            ? noSearchMatchState(needle, matched)
            : undefined
          : movedState(view, queries)
      }
      pager={
        top && unit > PAGE_SIZE
          ? {
              range: { from, to, total: unit, noun: GROUP_NOUNS[grouping] },
              ...pageNumberControls(page, pageCount, setPage),
            }
          : undefined
      }
      footer={
        query.data?.truncated
          ? `Showing the newest ${limit} executions; narrow the filters to see the rest.`
          : null
      }
    >
      {top
        ? paged.map((group) => (
            <SearchGroupRows
              key={group.key}
              group={group}
              metrics={queries.byQuery}
              failed={queries.isError}
            />
          ))
        : queries.rows.map((row) => (
            <QueryRow
              key={row.query}
              query={row.query}
              engines={row.engines}
              occurrences={row.event_count}
              nested={false}
            >
              <QueryMetricCells row={row} failed={false} />
            </QueryRow>
          ))}
    </DataTable>
  );
}

/**
 * Everything the table derives from one loaded evidence window.
 *
 * Kept out of the component because it is all one derivation — choose a
 * grouping, filter by text, page the result, and total what survives — and
 * reading it inline buried the four states the component actually renders.
 */
function useSearchTable(query: EvidenceTabProps['query'], runId: string | null) {
  const [grouping] = useUrlState('group', groupCodec);
  const [search, setSearch] = useUrlState('q', optionalStringUrlCodec, { history: 'replace' });
  // Trimmed and capped ONCE: the table filter, the server scope, the match
  // count and the empty state all read this, so none of them can be asking
  // about a different string than the others.
  const needle = useMemo(() => normalizeSearch(search), [search]);
  const topicOf = usePromptTopics(runId, grouping === 'topic');
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const groups = useMemo(() => {
    if (grouping === 'prompt') return searchRowsByPrompt(items);
    if (grouping === 'topic') return searchRowsByTopic(items, topicOf);
    return searchRows(items);
  }, [items, grouping, topicOf]);
  const visible = useMemo(() => {
    const wanted = needle.toLowerCase();
    if (!wanted) return groups;
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.query.toLowerCase().includes(wanted)),
      }))
      .filter((group) => group.rows.length);
  }, [groups, needle]);
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
  // Regrouping or searching produces a different set; page 3 of the old set is
  // not page 3 of the new one.
  const { page, setPage, pageCount, from, to } = useTablePage(unit, {
    pageSize: PAGE_SIZE,
    resetKey: `${grouping}\u0000${needle}`,
  });
  const paged = grouped
    ? visible.slice(from - 1, to)
    : visible.map((group) => ({
        ...group,
        rows: group.rows.slice(from - 1, to),
      }));
  return {
    grouping,
    search,
    setSearch,
    needle,
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

/**
 * One group's heading row and its searches, inside the shared table.
 *
 * A group renders as rows of the SAME table rather than a table of its own, so
 * every search in the tab sits on one set of columns. Repeating a header per
 * group restarted the column widths at each prompt and left nothing aligned.
 */
function SearchGroupRows({
  group,
  metrics,
  failed,
}: Readonly<{
  group: SearchGroup;
  metrics: ReadonlyMap<string, FanoutQueryRow>;
  failed: boolean;
}>) {
  const undisclosedNoun = group.undisclosed === 1 ? 'answer' : 'answers';
  const unavailableNoun = group.unavailable === 1 ? 'answer has' : 'answers have';
  const noExposedNoun = group.noExposedQueries === 1 ? 'answer' : 'answers';
  const note = [
    group.undisclosed
      ? `${group.undisclosed} ${undisclosedNoun} searched without returning the wording`
      : null,
    group.silent ? `${group.silent} answered without searching` : null,
    group.unavailable ? `${group.unavailable} ${unavailableNoun} unavailable query evidence` : null,
    group.noExposedQueries
      ? `${group.noExposedQueries} ${noExposedNoun} exposed no queries; search activity is unknown`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      {group.label ? (
        <TableRow>
          <TableCell colSpan={COLUMNS.length}>
            <ClampText className={textRole('captionStrong')}>{group.label}</ClampText>
          </TableCell>
        </TableRow>
      ) : null}
      {group.rows.map((row) => (
        <QueryRow
          key={`${group.key}-${row.query}`}
          query={row.query}
          engines={row.engines}
          occurrences={row.occurrences}
          nested={Boolean(group.label)}
        >
          <QueryMetricCells row={metrics.get(row.query)} failed={failed} />
        </QueryRow>
      ))}
      {note ? (
        <TableRow>
          <TableCell colSpan={COLUMNS.length} className={textRole('caption', 'text-ink-2')}>
            {note}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** One query: its text, the surfaces that ran it, its count, then its share, change and brands. */
function QueryRow({
  query,
  engines,
  occurrences,
  nested,
  children,
}: Readonly<{
  query: string;
  engines: readonly string[];
  occurrences: number;
  nested: boolean;
  children: ReactNode;
}>) {
  const { label: engineLabel } = useEngineCatalog();
  return (
    <TableRow>
      <TableCell nested={nested}>
        <Inline as="span" className="items-start">
          <Icon icon={Search} className="text-ink-2" />
          <ClampText>{query}</ClampText>
        </Inline>
      </TableCell>
      <TableCell>{engines.map(engineLabel).join(', ')}</TableCell>
      <TableCell numeric>{occurrences}</TableCell>
      {children}
    </TableRow>
  );
}

/**
 * Selection-wide fanout totals, straight from the server.
 *
 * The table below is one loaded evidence window, and deriving "Distinct
 * searches" and "Total occurrences" from it meant both figures changed as the
 * reader paged — they were page totals wearing selection labels. This asks the
 * projection that already aggregates the COMPLETE selection
 * (`services/api/src/analysis/fanout.ts`), which it does with `limit=None`.
 *
 * The normalized search is sent too, so the count of matching queries covers
 * the whole run set rather than whatever happens to be loaded: a query stored
 * past the first page was previously unfindable. It is the SAME value the
 * table filters by, so the two can never disagree about what matched.
 */
function useFanoutSummary(scope: FanoutScope, scopeReady: boolean, needle: string) {
  const { workspaceId, projectId } = useProjectScope();
  const params = useMemo(
    // Already normalized by `normalizeSearch`, which caps it at the bound the
    // endpoint declares — a longer value is rejected as a 422 before it can
    // match anything, turning a long paste into an error rather than a search.
    () => ({ ...scope, search: needle || undefined }),
    [scope, needle],
  );
  const result = useQuery({
    ...visibilityQueries.fanout({ workspaceId, projectId }, params),
    enabled: scopeReady,
    // Totals for a selection do not change while the reader pages through it;
    // keeping the previous values avoids the headline flickering to blank.
    placeholderData: (data, query) => retainPreviousDataForScope(projectId, data, query),
  });
  return {
    distinctQueries: result.data?.distinct_queries ?? null,
    eventCount: result.data?.event_count ?? null,
    matchedQueries: result.data?.matched_queries ?? null,
    isFetching: result.isFetching,
  };
}

/**
 * Prompt-to-topic map for the topic grouping.
 *
 * Evidence rows carry no topic; the prompt metrics projection already publishes
 * one per prompt, so the join happens here rather than being pushed into the
 * evidence endpoint. Only fetched when the reader actually groups by topic.
 */
function usePromptTopics(runId: string | null, enabled: boolean) {
  const { workspaceId, projectId } = useProjectScope();
  const result = useQuery({
    ...visibilityQueries.prompts({ workspaceId, projectId }, runId),
    enabled: enabled && Boolean(runId),
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
