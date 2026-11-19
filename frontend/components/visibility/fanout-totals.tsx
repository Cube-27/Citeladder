import { SearchX } from 'lucide-react';

import type { DataTableState } from '@/components/ui/data-table';
import { textRole } from '@/components/ui/typography';

/** What the fanout projection answers about the whole selection. */
export type FanoutSummary = Readonly<{
  distinctQueries: number | null;
  eventCount: number | null;
  matchedQueries: number | null;
}>;

/**
 * Whether the server's figures have landed. The fanout endpoint takes every
 * filter the evidence table applies, so once they land they describe the
 * population the table draws from.
 */
function isSelectionWide(summary: FanoutSummary): boolean {
  return summary.distinctQueries !== null && summary.eventCount !== null;
}

/**
 * The run-set match count, or `null` when the server is not speaking for what
 * the table shows. Decided here so the two notes below and the headline can
 * never disagree about whose population they describe.
 */
export function selectionMatchedQueries(summary: FanoutSummary): number | null {
  return isSelectionWide(summary) ? summary.matchedQueries : null;
}

/** How many searches the typed filter matches across the whole run set. */
export function SearchScopeNote({
  search,
  matched,
}: Readonly<{ search: string | null; matched: number | null }>) {
  if (!search || matched == null) return null;
  const noun = matched === 1 ? 'search' : 'searches';
  return (
    <span className={textRole('body', 'text-ink-2')}>
      {matched === 0
        ? 'No searches match in this run set'
        : `${matched} matching ${noun} in this run set`}
    </span>
  );
}

/**
 * Nothing on THIS page matched — which is not the same as nothing matching.
 *
 * The table renders one loaded window. When the server reports matches the
 * window does not contain, say so rather than claiming the query does not
 * exist. Where those matches sit is not something this knows — the server
 * counts them across the whole selection, not relative to the loaded page — so
 * the wording stays neutral instead of pointing at a pager that may not be
 * showing.
 */
export function noSearchMatchState(search: string | null, matched: number | null): DataTableState {
  const verb = matched === 1 ? 'match sits' : 'matches sit';
  const elsewhere = matched ? `. ${matched} ${verb} elsewhere in the run set.` : '.';
  return {
    kind: 'empty',
    icon: SearchX,
    headingLevel: 3,
    heading: `No search matches “${search}” on this page${elsewhere}`,
  };
}
