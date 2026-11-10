/**
 * The `content_gaps` refresh family's source and hits (content optimization
 * section 2). The source is the latest succeeded content-angle run; a failed
 * run is never read, so after one the earlier succeeded run keeps its gaps. A
 * run whose newest audit is older than `max_source_age_days` is no longer a
 * source, so its gaps clear with a limitation. Reads only persisted rows,
 * scoped to the workspace and project; nothing here calls a model.
 *
 * A new-page gap targets its lineage's planned-page key. A lineage that has
 * none yet takes `plannedPageKey(label)` of its current label, and the refresh
 * stores it once inside its transaction (`fixPlannedPageKeys`), so a later
 * label never moves the Action.
 */
import type { ContentGapSourceState } from '@citeladder/contracts/actions';
import { sql } from 'kysely';

import { plannedPageKey } from '../analysis/opportunities/actions.ts';
import {
  detectContentGaps,
  type ContentGapAngle,
  type ContentGapRun,
} from '../analysis/opportunities/content-gaps.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { groupBy } from '../lists.ts';
import { compareText } from '../text-order.ts';
import type { Scored } from './refresh-compute.ts';
import type { Scope } from './sources.ts';

const p = policy.content_optimization;
const g = policy.opportunity.opportunities.CONTENT_GAP;

const CONTENT_GAPS_NOT_COMPUTED = 'Content gaps not computed yet.';
const CONTENT_GAPS_OUT_OF_DATE = `Content-gap evidence is out of date: its newest audit is more than ${p.max_source_age_days} days old.`;

/**
 * The run a refresh reads content gaps from, or none with the reason. `state`
 * is what the snapshot records for the Content optimization list; the
 * limitation is human-readable text only.
 */
export type ContentGapSource =
  | { state: 'current'; run: ContentGapRun; limitation: null }
  | { state: Exclude<ContentGapSourceState, 'current'>; run: null; limitation: string };

/** The latest succeeded run, when its window ends within `max_source_age_days` of `at`. */
export async function contentGapSource(
  db: Database,
  scope: Scope,
  at: Date,
): Promise<ContentGapSource> {
  const run = await db
    .selectFrom('content_angle_runs')
    .select([
      'id',
      'window_start',
      'window_end',
      'methodology_version',
      'formula_version',
      'limitations',
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('outcome', '=', 'succeeded')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!run) return { state: 'not_computed', run: null, limitation: CONTENT_GAPS_NOT_COMPUTED };
  if (run.window_end.getTime() < at.getTime() - p.max_source_age_days * 86_400_000)
    return { state: 'out_of_date', run: null, limitation: CONTENT_GAPS_OUT_OF_DATE };
  return {
    state: 'current',
    run: {
      id: run.id,
      window: { start: run.window_start.toISOString(), end: run.window_end.toISOString() },
      methodology_version: run.methodology_version,
      formula_version: run.formula_version,
      limitations: Array.isArray(run.limitations) ? run.limitations.map(record) : [],
    },
    limitation: null,
  };
}

async function runAngles(db: Database, scope: Scope, runId: string) {
  return db
    .selectFrom('content_angles as angle')
    .innerJoin('content_angle_lineages as lineage', (join) =>
      join
        .onRef('lineage.id', '=', 'angle.lineage_id')
        .on('lineage.workspace_id', '=', scope.workspaceId),
    )
    .leftJoin('content_angle_owned_matches as match', (join) =>
      join
        .onRef('match.angle_id', '=', 'angle.id')
        .on('match.workspace_id', '=', scope.workspaceId),
    )
    .leftJoin('site_urls as url', (join) =>
      join
        .onRef('url.id', '=', 'match.site_url_id')
        .on('url.workspace_id', '=', scope.workspaceId)
        .on('url.project_id', '=', scope.projectId),
    )
    .select([
      'angle.id',
      'angle.lineage_id',
      'angle.label',
      'angle.topic_id',
      'angle.prompt_ids',
      'angle.engines',
      'angle.citation_count',
      'angle.domain_count',
      'angle.competitor_count',
      'lineage.planned_page_key',
      'match.method',
      'match.site_url_id',
      'match.owned_cited',
      'url.normalized_url',
    ])
    .where('angle.workspace_id', '=', scope.workspaceId)
    .where('angle.project_id', '=', scope.projectId)
    .where('angle.run_id', '=', runId)
    .orderBy('angle.id')
    .execute();
}

async function angleMembers(db: Database, scope: Scope, angleIds: string[]) {
  if (!angleIds.length) return new Map<string, never[]>();
  const rows = await db
    .selectFrom('content_angle_members')
    .select([
      'angle_id',
      'canonical_url',
      'title',
      'domain',
      'classification',
      'matched_competitor',
      'citation_count',
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('angle_id', 'in', angleIds)
    .execute();
  return groupBy(rows, (row) => row.angle_id);
}

/**
 * The text of each prompt as the project's library holds it now, by id. A
 * prompt the library no longer has is absent, and its angle records it with
 * no text.
 */
async function promptTexts(db: Database, scope: Scope, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .select(['prompts.id', 'prompts.text'])
    .where('prompts.workspace_id', '=', scope.workspaceId)
    .where('prompt_sets.workspace_id', '=', scope.workspaceId)
    .where('prompt_sets.project_id', '=', scope.projectId)
    .where('prompts.id', 'in', ids)
    .execute();
  return new Map(rows.map((row) => [row.id, row.text]));
}

/** The Actions on these planned-page keys, by key. */
async function plannedActions(db: Database, scope: Scope, keys: string[]) {
  if (!keys.length) return new Map<string, string>();
  const rows = await db
    .selectFrom('actions')
    .select(['id', 'group_key'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('group_key', 'in', keys)
    .execute();
  return new Map(rows.map((row) => [row.group_key, row.id]));
}

type AngleRow = Awaited<ReturnType<typeof runAngles>>[number];

/** Content-gap hits for one refresh, with why there are none when there is no source. */
export async function contentGapHits(
  db: Database,
  scope: Scope,
  source: ContentGapSource,
): Promise<{ hits: DetectorHit[]; limitations: string[] }> {
  if (source.run === null) return { hits: [], limitations: [source.limitation] };
  const rows = await runAngles(db, scope, source.run.id);
  const members = await angleMembers(
    db,
    scope,
    rows.map((row) => row.id),
  );
  const texts = await promptTexts(db, scope, [...new Set(rows.flatMap((row) => row.prompt_ids))]);
  // A page that later matches a lineage continues the planned page its new-page gap opened.
  const continued = await plannedActions(db, scope, [
    ...new Set(
      rows.flatMap((row) =>
        row.method === 'model_pick' && row.planned_page_key ? [row.planned_page_key] : [],
      ),
    ),
  ]);
  let untracked = 0;
  const angles = rows.flatMap((row): ContentGapAngle[] => {
    const match = angleMatch(row);
    if (match === null) {
      untracked += 1;
      return [];
    }
    return [
      {
        id: row.id,
        lineage_id: row.lineage_id,
        label: row.label,
        topic_id: row.topic_id,
        prompts: [...row.prompt_ids]
          .sort(compareText)
          .map((id) => ({ id, text: texts.get(id) ?? null })),
        engines: [...row.engines].sort(compareText),
        citation_count: row.citation_count,
        domain_count: row.domain_count,
        competitor_count: row.competitor_count,
        members: (members.get(row.id) ?? []).map((member) => ({
          url: member.canonical_url,
          title: member.title,
          domain: member.domain,
          classification: member.classification,
          matched_competitor: member.matched_competitor,
          citation_count: member.citation_count,
        })),
        match,
        continues_action_id:
          match.kind === 'page' && row.planned_page_key
            ? (continued.get(row.planned_page_key) ?? null)
            : null,
      },
    ];
  });
  const hits = detectContentGaps(source.run, angles, {
    min_citations: p.min_citations,
    min_domains: p.min_domains,
  });
  return {
    hits,
    limitations: untracked
      ? [`${untracked} content angles matched a page that is no longer tracked; they raise no gap.`]
      : [],
  };
}

/** The angle's match; null when its matched page is no longer tracked. */
function angleMatch(row: AngleRow): ContentGapAngle['match'] | null {
  if (row.method === 'model_pick') {
    if (row.site_url_id === null || row.normalized_url === null) return null;
    return {
      kind: 'page',
      site_url_id: row.site_url_id,
      url: row.normalized_url,
      owned_cited: row.owned_cited === true,
    };
  }
  return { kind: 'none', planned_page_key: row.planned_page_key ?? plannedPageKey(row.label) };
}

/**
 * Store, once, the planned-page key of every lineage whose new-page gap this
 * refresh surfaced. Runs inside the refresh transaction; a key already stored
 * is never rewritten.
 */
export async function fixPlannedPageKeys(trx: Database, scope: Scope, scored: readonly Scored[]) {
  const keys = new Map<string, string>();
  for (const [hit] of scored) {
    if (hit.rule_id !== g.RULE_NEW_PAGE) continue;
    const evidence = record(hit.evidence);
    if (typeof evidence.lineage_id === 'string' && typeof evidence.planned_page_key === 'string')
      keys.set(evidence.lineage_id, evidence.planned_page_key);
  }
  if (!keys.size) return;
  const values = [...keys].map(([lineage, key]) => sql`(${lineage}::uuid, ${key}::text)`);
  await sql`update content_angle_lineages set planned_page_key = v.key
    from (values ${sql.join(values)}) as v(id, key)
    where content_angle_lineages.id = v.id
      and content_angle_lineages.workspace_id = ${scope.workspaceId}::uuid
      and content_angle_lineages.project_id = ${scope.projectId}::uuid
      and content_angle_lineages.planned_page_key is null`.execute(trx);
}
