/**
 * Re-derive every Action of a project from its new live Opportunity set
 * (`actions.sync_actions`), inside the refresh transaction and under its
 * project lock, so members, priority and diagnosis always describe the
 * snapshot that superseded the old rows.
 *
 * `actions` has two writers across the stack boundary. This refresh derives
 * evidence Actions and restamps every row's members; the Python Agent only
 * inserts its own `agent`-origin rows (`attach_or_create_action`, insert on
 * conflict do nothing on `(project_id, group_key)`), and this insert adopts
 * such a row on the same key. Identity and origin never change here, and an Action no member targets any more keeps its row with
 * its evidence cleared.
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import { policy } from '../config.ts';
import { groupMembers, type ActionMember } from '../analysis/opportunities/actions.ts';
import type { Database } from '../db/database.ts';
import { pyJson } from '../python/json.ts';
import { record } from '../traffic/performance.ts';
import type { NewOpportunity } from './refresh-compute.ts';
import type { Scope } from './sources.ts';

const a = policy.opportunity.actions;

/** One new row as the grouping reads it. */
export function actionMember(
  row: Omit<NewOpportunity, 'source_analysis_ids' | 'source_issue_ids' | 'source_metric_ids'> & {
    source_analysis_ids: string[] | null;
    source_issue_ids: string[] | null;
    source_metric_ids: string[] | null;
  },
): ActionMember {
  const evidence = record(row.evidence);
  const prompt = evidence.prompt_text || evidence.prompt;
  return {
    opportunity_id: row.id,
    rule_id: row.rule_id,
    target_key: row.target_key,
    target_url: row.target_url,
    target_prompt_id: row.target_prompt_id,
    target_theme: row.target_theme,
    label_hint: typeof prompt === 'string' ? prompt : null,
    title: row.title || row.rule_id,
    priority_score: row.priority_score || 0,
    source_analysis_ids: [...(row.source_analysis_ids ?? [])],
    source_issue_ids: [...(row.source_issue_ids ?? [])],
    source_metric_ids: [...(row.source_metric_ids ?? [])],
  };
}

type Group = ReturnType<typeof groupMembers>[number];

/** The persisted fields one group writes onto its Action. */
function groupFields(group: Group, snapshotId: string) {
  return {
    target_label: group.target.label,
    target_url: group.target.url,
    target_prompt_id: group.target.prompt_id,
    priority_score: group.priority_score,
    families: pyJson(group.families),
    approach: group.approach,
    skill_id: group.skill_id,
    diagnosis: pyJson(group.diagnosis),
    member_opportunity_ids: pyJson(group.members.map((member) => member.opportunity_id)),
    opportunity_snapshot_id: snapshotId,
    evidence_cleared_at: null,
  };
}

/**
 * Upsert the project's Actions for `rows` and return each row's Action id.
 * The caller inserts the rows with that id, after this runs.
 */
export async function syncActions(
  trx: Database,
  scope: Scope,
  rows: NewOpportunity[],
  snapshotId: string,
  families: string[],
): Promise<Map<string, string>> {
  const groups = groupMembers(rows.map(actionMember), families);
  const existing = new Map(
    (
      await trx
        .selectFrom('actions')
        .select(['id', 'group_key', 'origin', 'evidence_cleared_at'])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .forUpdate()
        .execute()
    ).map((action) => [action.group_key, action]),
  );
  const now = new Date();
  const actionFor = new Map<string, string>();
  for (const group of groups) {
    const found = existing.get(group.target.group_key);
    let id = found?.id;
    if (id) {
      await trx
        .updateTable('actions')
        .set({ ...groupFields(group, snapshotId), updated_at: now })
        .where('id', '=', id)
        .execute();
    } else {
      // An Agent attach may insert this key after the locked read above; the
      // refresh then adopts that row instead of failing on the unique key.
      ({ id } = await trx
        .insertInto('actions')
        .values({
          id: randomUUID(),
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          group_key: group.target.group_key,
          target_kind: group.target.kind,
          origin: a.ACTION_ORIGIN_EVIDENCE,
          status: a.ACTION_STATUS_OPEN,
          ...groupFields(group, snapshotId),
          created_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) =>
          conflict
            .constraint('uq_actions_project_group')
            .doUpdateSet({ ...groupFields(group, snapshotId), updated_at: now }),
        )
        .returning('id')
        .executeTakeFirstOrThrow());
    }
    for (const member of group.members) actionFor.set(member.opportunity_id, id);
  }
  const seen = new Set(groups.map((group) => group.target.group_key));
  const cleared = [...existing.values()].filter((action) => !seen.has(action.group_key));
  if (cleared.length) {
    await trx
      .updateTable('actions')
      .set({
        member_opportunity_ids: '[]',
        families: '[]',
        priority_score: null,
        opportunity_snapshot_id: snapshotId,
        evidence_cleared_at: sql<Date>`case
          when evidence_cleared_at is null and origin = ${a.ACTION_ORIGIN_EVIDENCE} then ${now}::timestamptz
          else evidence_cleared_at end`,
        updated_at: now,
      })
      .where(
        'id',
        'in',
        cleared.map((action) => action.id),
      )
      .execute();
  }
  return actionFor;
}
