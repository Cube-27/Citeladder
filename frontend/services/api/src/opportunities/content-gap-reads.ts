/**
 * What the Action list reads about content gaps (content optimization
 * section 2): each Action's live content-gap findings, summarized from their
 * persisted evidence, and whether the latest refresh had content-gap evidence
 * at all. Reads only persisted rows, scoped to the workspace and project.
 */
import {
  actionContentGapSchema,
  contentGapRuleSchema,
  type ActionContentGap,
  type ContentGapSourceState,
} from '@citeladder/contracts/actions';
import { opportunityEvidenceSchemas } from '@citeladder/contracts/opportunity-evidence';

import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { compareText } from '../text-order.ts';
import { CONTENT_GAPS_OUT_OF_DATE } from './content-gap-hits.ts';
import { latestSnapshot, type Scope } from './sources.ts';

type ListedAction = { id: string; member_ids: readonly string[] };

/** One finding's summary, or null when its evidence is not a content-gap angle. */
function summary(row: { id: string; rule_id: string; evidence: unknown }): ActionContentGap | null {
  const rule = contentGapRuleSchema.safeParse(row.rule_id);
  if (!rule.success) return null;
  const evidence = opportunityEvidenceSchemas[rule.data].safeParse(row.evidence);
  if (!evidence.success) return null;
  const { angle_label, prompt_ids, citation_count, domain_count, competitor_count } = evidence.data;
  return actionContentGapSchema.parse({
    opportunity_id: row.id,
    rule_id: rule.data,
    angle_label,
    prompt_count: prompt_ids.length,
    citation_count,
    domain_count,
    competitor_count,
  });
}

const byCitations = (a: ActionContentGap, b: ActionContentGap) =>
  b.citation_count - a.citation_count || compareText(a.angle_label, b.angle_label);

/** Each Action's live content-gap findings, most cited first, by Action id. */
export async function actionContentGaps(
  db: Database,
  scope: Scope,
  actions: readonly ListedAction[],
): Promise<Map<string, ActionContentGap[]>> {
  const ids = [...new Set(actions.flatMap((action) => action.member_ids))];
  const rows = ids.length
    ? await db
        .selectFrom('opportunities')
        .select(['id', 'rule_id', 'evidence'])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', 'in', ids)
        .where('rule_id', 'in', contentGapRuleSchema.options)
        .where('superseded_at', 'is', null)
        .execute()
    : [];
  const found = new Map(
    rows.flatMap((row) => {
      const gap = summary(row);
      return gap ? [[row.id, gap] as const] : [];
    }),
  );
  return new Map(
    actions.map((action) => [
      action.id,
      action.member_ids.flatMap((id) => found.get(id) ?? []).sort(byCitations),
    ]),
  );
}

/**
 * The content-gap evidence the latest Opportunity snapshot read: the run it
 * recorded as its source, else the out-of-date limitation, else none yet.
 */
export async function contentGapSourceState(
  db: Database,
  scope: Scope,
): Promise<ContentGapSourceState> {
  const snapshot = await latestSnapshot(db, scope);
  if (!snapshot) return 'not_computed';
  const identity = record(record(snapshot.coverage).source_identity);
  if (typeof identity.content_angle_run_id === 'string') return 'current';
  const limitations = Array.isArray(snapshot.limitations) ? snapshot.limitations : [];
  return limitations.includes(CONTENT_GAPS_OUT_OF_DATE) ? 'out_of_date' : 'not_computed';
}
