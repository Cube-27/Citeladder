/**
 * Search-row projections for the Searches tab.
 *
 * The tab reads as one table under a "Group by" control, so every grouping has
 * to produce the SAME row shape. These fold the loaded execution window into
 * that shape without recomputing anything: a row's occurrence count is how many
 * times the loaded window observed that exact query string, never an estimate
 * of how often the engine ran it.
 */
import type { VisibilityExecutionEvidence } from '@/lib/api/types';
import { groupByPrompt, queryTexts } from '@/lib/visibility/evidence';

/** One search string, and what was observed running it. */
export type SearchRow = {
  query: string;
  /** Logical engines observed running this query, in catalog encounter order. */
  engines: string[];
  /** Times the loaded window observed this exact query. */
  occurrences: number;
};

/** A named set of search rows: one prompt, one topic, or the whole window. */
export type SearchGroup = {
  key: string;
  /** The group heading, or `null` for the ungrouped list. */
  label: string | null;
  rows: SearchRow[];
  /**
   * Executions in this group that ran a search whose wording the model did not
   * expose, or ran none at all. Counted rather than dropped: a group with rows
   * for two of its five answers must not read as though the other three were
   * silent.
   */
  undisclosed: number;
  silent: number;
};

function foldRows(executions: readonly VisibilityExecutionEvidence[]): SearchGroup {
  const rows = new Map<string, SearchRow>();
  let undisclosed = 0;
  let silent = 0;
  for (const execution of executions) {
    if (execution.state === 'count_only') undisclosed += 1;
    if (execution.state === 'no_search') silent += 1;
    for (const query of queryTexts(execution)) {
      const row = rows.get(query);
      if (row) {
        row.occurrences += 1;
        if (execution.logical_engine && !row.engines.includes(execution.logical_engine)) {
          row.engines.push(execution.logical_engine);
        }
      } else {
        rows.set(query, {
          query,
          engines: execution.logical_engine ? [execution.logical_engine] : [],
          occurrences: 1,
        });
      }
    }
  }
  return {
    key: '',
    label: null,
    // Most-run first; ties keep a stable alphabetical order so the table does
    // not reshuffle between renders of the same data.
    rows: [...rows.values()].sort(
      (a, b) => b.occurrences - a.occurrences || a.query.localeCompare(b.query),
    ),
    undisclosed,
    silent,
  };
}

/** Every observed search in the window, as one ungrouped list. */
export function searchRows(items: readonly VisibilityExecutionEvidence[]): SearchGroup[] {
  return [{ ...foldRows(items), key: 'all', label: null }];
}

/** One group per frozen prompt, in the order the window first mentions it. */
export function searchRowsByPrompt(
  items: readonly VisibilityExecutionEvidence[],
): SearchGroup[] {
  return groupByPrompt(items).map((group) => ({
    ...foldRows(group.executions),
    key: group.promptSnapshotId,
    label: group.promptText,
  }));
}

/**
 * One group per topic.
 *
 * Evidence rows carry no topic of their own, so the caller supplies the
 * prompt-to-topic map the prompt metrics already publish. A prompt the map does
 * not cover is grouped as unclassified rather than silently dropped.
 */
export function searchRowsByTopic(
  items: readonly VisibilityExecutionEvidence[],
  topicOf: ReadonlyMap<string, string>,
): SearchGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, VisibilityExecutionEvidence[]>();
  for (const item of items) {
    const topic =
      topicOf.get(item.prompt_id ?? '') ?? topicOf.get(item.prompt_snapshot_id) ?? 'Unclassified';
    const bucket = buckets.get(topic);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(topic, [item]);
      order.push(topic);
    }
  }
  return order
    .sort((a, b) => a.localeCompare(b))
    .map((topic) => ({ ...foldRows(buckets.get(topic)!), key: topic, label: topic }));
}
