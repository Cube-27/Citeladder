/**
 * One roster competitor against the brand over a selection (AV-6): the
 * domains cited in answers naming it, and the prompts where it is named and
 * the brand is not. Projections over persisted answers, competitor mentions
 * and citations; nothing is classified, called or repaired here.
 */
import type { CompetitorFocus } from '@citeladder/contracts/visibility-competitor';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { scopedSelection } from './dashboard.ts';
import { evidenceScope, observedAt, type RunSelection } from './selection.ts';

const limits = policy.visibility;

/** The project's roster entry with exactly this name, or null. */
async function rosterEntry(db: Database, selection: RunSelection, name: string) {
  const found = await db
    .selectFrom('competitors')
    .select(['id', 'name'])
    .where('workspace_id', '=', selection.workspaceId)
    .where('project_id', '=', selection.projectId)
    .where('name', '=', name)
    .orderBy('created_at')
    .orderBy('id')
    .executeTakeFirst();
  return found ?? null;
}

/**
 * The competitor's focus over the selection, or null when `name` is not on
 * the project's roster. Mentions are matched by the name each run recorded.
 */
export async function getCompetitorFocus(
  db: Database,
  selection: RunSelection,
  name: string,
): Promise<CompetitorFocus | null> {
  const competitor = await rosterEntry(db, selection, name);
  if (competitor === null) return null;
  const scoped = await scopedSelection(db, selection);
  const named = sql<boolean>`exists (select 1 from competitor_mentions mention
    where mention.analysis_id = ra.id and mention.workspace_id = ${scoped.workspaceId}
      and mention.competitor_name = ${competitor.name})`;
  const instead = sql<boolean>`(${named} and not ra.brand_mentioned)`;
  const [totals, sources, prompts] = await Promise.all([
    evidenceScope(db, scoped)
      .select(sql<number>`count(*) filter (where ${named})::int`.as('answers'))
      .executeTakeFirstOrThrow(),
    evidenceScope(db, scoped)
      .innerJoin('citations as cited', (join) =>
        join
          .onRef('cited.analysis_id', '=', 'ra.id')
          .on('cited.workspace_id', '=', scoped.workspaceId),
      )
      .select([
        'cited.domain',
        sql<number>`count(distinct ra.id) filter (where ${named})::int`.as('answers'),
        sql<number>`count(distinct ra.id) filter (where ra.brand_mentioned)::int`.as(
          'answers_naming_you',
        ),
      ])
      .groupBy('cited.domain')
      .having(sql<boolean>`bool_or(${named})`)
      .orderBy('answers', 'desc')
      .orderBy('cited.domain')
      .limit(limits.competitor_sources_limit)
      .execute(),
    evidenceScope(db, scoped)
      // A deleted prompt keeps no id: its frozen text identifies it.
      .select([
        sql<string | null>`snapshot.prompt_id`.as('prompt_id'),
        sql<string>`(array_agg(snapshot.text order by ${observedAt} desc, snapshot.id))[1]`.as(
          'prompt',
        ),
        sql<string>`(array_agg(snapshot.theme order by ${observedAt} desc, snapshot.id))[1]`.as(
          'topic',
        ),
        sql<number>`count(distinct ra.logical_engine) filter (where ${instead})::int`.as('engines'),
        sql<number>`count(distinct ra.logical_engine)::int`.as('engines_answered'),
      ])
      .groupBy(sql`snapshot.prompt_id, case when snapshot.prompt_id is null then snapshot.text end`)
      .having(sql<boolean>`bool_or(${instead})`)
      .orderBy('engines', 'desc')
      .orderBy('prompt')
      .limit(limits.competitor_named_instead_limit)
      .execute(),
  ]);
  return {
    competitor,
    answers: totals.answers,
    sources,
    named_instead: prompts.map((row) => ({ ...row, topic: row.topic || 'Untagged' })),
  };
}
