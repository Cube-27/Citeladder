/**
 * The search queries engines ran for a selection, summarized per query.
 *
 * Moved from `app/domain/analysis/fanout_projection.py`. Totals describe the
 * whole selection and never move with paging or `search`; `search` narrows
 * the query rows only, and `query` drills into the answers that ran that
 * query, which `offset` then pages instead of the table.
 */
import type { visibilityFanoutSummarySchema } from '@citeladder/contracts/visibility-evidence';
import { sql } from 'kysely';
import type { z } from 'zod';

import type { Database } from '../db/database.ts';
import { utcTextOf } from '../db/timestamps.ts';
import { compareText } from '../text-order.ts';
import { fanoutState, selectEvents } from './evidence.ts';
import { authorizedSelection, evidenceScope, type RunSelection } from './selection.ts';

export type FanoutResponse = z.input<typeof visibilityFanoutSummarySchema>;

// Answers are read in bounded batches, newest first, so a large selection
// never sits in memory at once.
const BATCH = 1000;

type QueryTally = {
  events: number;
  prompts: Set<string>;
  engines: Set<string>;
  responses: Set<string>;
  brand: Set<string>;
};

export async function getVisibilityFanout(
  db: Database,
  requested: RunSelection,
  options: { query: string | null; search: string | null; offset: number; limit: number },
): Promise<FanoutResponse> {
  const selection = await authorizedSelection(db, requested);
  const states: Record<string, number> = {};
  const queries = new Map<string, QueryTally>();
  const answers: FanoutResponse['answers'] = [];
  let totalEvents = 0;
  let totalAnswers = 0;
  let position: { createdAt: string; id: string } | null = null;
  for (;;) {
    let batch = evidenceScope(db, selection)
      .leftJoin('raw_response_artifacts as artifact', 'artifact.id', 'ra.artifact_id')
      .select([
        'ra.id',
        'ra.audit_id',
        'ra.task_id',
        'ra.logical_engine',
        'ra.brand_mentioned',
        'ra.owned_domain_cited',
        'ra.search_used',
        'ra.search_query_count',
        utcTextOf(sql.ref('ra.created_at')).as('created_at'),
        'task.search_events as task_events',
        'task.provider_metadata',
        'snapshot.prompt_id',
        'snapshot.text',
        'artifact.search_events as artifact_events',
      ])
      .orderBy('ra.created_at', 'desc')
      .orderBy('ra.id', 'desc')
      .limit(BATCH);
    if (position !== null) {
      batch = batch.where(
        sql<boolean>`(ra.created_at, ra.id) < (${`${position.createdAt}Z`}::timestamptz, ${position.id}::uuid)`,
      );
    }
    const rows = await batch.execute();
    for (const row of rows) {
      const { events } = selectEvents(row.artifact_events, row.task_events);
      const { state } = fanoutState({
        events,
        searchUsed: Boolean(row.search_used),
        searchQueryCount: row.search_query_count ?? 0,
        providerMetadata: row.provider_metadata,
      });
      states[state] = (states[state] ?? 0) + 1;
      totalEvents += events.length;
      if (options.query !== null && events.some((event) => event.query.trim() === options.query)) {
        if (totalAnswers >= options.offset && totalAnswers < options.offset + options.limit) {
          answers.push({
            audit_id: row.audit_id,
            task_id: row.task_id,
            prompt_text: row.text,
            logical_engine: row.logical_engine,
            brand_mentioned: row.brand_mentioned,
            owned_domain_cited: row.owned_domain_cited,
          });
        }
        totalAnswers += 1;
      }
      for (const event of events) {
        const text = event.query.trim();
        if (!text) continue;
        const tally = queries.get(text) ?? {
          events: 0,
          prompts: new Set(),
          engines: new Set(),
          responses: new Set(),
          brand: new Set(),
        };
        tally.events += 1;
        tally.prompts.add(row.prompt_id ?? row.text);
        tally.engines.add(row.logical_engine);
        tally.responses.add(row.id);
        if (row.brand_mentioned) tally.brand.add(row.id);
        queries.set(text, tally);
      }
    }
    if (rows.length < BATCH) break;
    const last = rows.at(-1)!;
    position = { createdAt: last.created_at, id: last.id };
  }
  const ordered = [...queries].sort(
    ([leftText, left], [rightText, right]) =>
      right.events - left.events || compareText(leftText, rightText),
  );
  // `search` filters the rows only; the totals stay those of the selection.
  const needle = (options.search ?? '').trim().toLowerCase();
  const matched = needle
    ? ordered.filter(([text]) => text.toLowerCase().includes(needle))
    : ordered;
  // Drilling into one query pages its answers, never the table under it.
  const rows =
    options.query === null
      ? matched.slice(options.offset, options.offset + options.limit)
      : matched.slice(0, options.limit);
  const pageable = options.query === null ? matched.length : totalAnswers;
  return {
    event_count: totalEvents,
    distinct_queries: ordered.length,
    matched_queries: matched.length,
    coverage: states,
    next_offset: options.offset + options.limit < pageable ? options.offset + options.limit : null,
    answers,
    total_answers: totalAnswers,
    items: rows.map(([query, tally]) => ({
      query,
      event_count: tally.events,
      prompt_count: tally.prompts.size,
      engines: [...tally.engines].sort(compareText),
      response_count: tally.responses.size,
      brand_response_count: tally.brand.size,
    })),
  };
}
