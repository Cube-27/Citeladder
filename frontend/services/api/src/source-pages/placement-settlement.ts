import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import {
  evaluatePlacement,
  type PlacementReading,
} from '../analysis/opportunities/placement-outcome.ts';
import type { SourceScope } from './admission.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { fenceInspectionTask } from './task-fence.ts';

const p = policy.opportunity.placement;
async function reading(
  db: Database,
  scope: SourceScope,
  page: string,
  snapshotId: string,
  roster?: string,
): Promise<PlacementReading | null> {
  const snapshot = await db
    .selectFrom('source_page_snapshots')
    .select(['id', 'extracted_chars', 'page_facts'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('source_page_id', '=', page)
    .where('id', '=', snapshotId)
    .executeTakeFirst();
  if (!snapshot) return null;
  const presences = await db
    .selectFrom('source_page_entity_presences')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('source_page_id', '=', page)
    .where('snapshot_id', '=', snapshotId)
    .orderBy('entity_kind')
    .execute();
  const brand = presences.find((row) => row.entity_kind === 'brand');
  const facts = record(snapshot.page_facts);
  return {
    snapshot_id: snapshotId,
    roster_version: roster ?? presences[0]?.roster_version ?? '',
    extracted_chars: facts.text_truncated === true ? 0 : snapshot.extracted_chars,
    brand_presence: brand?.presence ?? null,
    brand_present: brand?.presence === 'present',
    brand_match_count: brand?.match_count ?? 0,
    outbound_domains: strings(facts.outbound_domains),
    headings: strings(facts.headings),
  };
}
export async function settlePlacements(
  db: Database,
  scope: SourceScope,
  now = new Date(),
  task?: QueueTask,
  onSettled?: (trx: Database) => Promise<void>,
) {
  return db.transaction().execute(async (trx) => {
    await fenceInspectionTask(trx, task);
    const checks = await trx
      .selectFrom('placement_checks')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('state', 'in', ['pending', 'unmet', 'unavailable'])
      .where('due_at', '<=', now)
      .orderBy('due_at')
      .limit(p.PLACEMENT_DUE_PAGES_MAX)
      .forUpdate()
      .execute();
    let count = 0;
    for (const check of checks) {
      const snapshot = await trx
        .selectFrom('source_page_snapshots')
        .select(['id', 'fetched_at'])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('source_page_id', '=', check.source_page_id)
        .where('outcome', '=', 'inspected')
        .where('fetched_at', '>', check.declared_at)
        .where(sql<boolean>`id is distinct from ${check.observation_snapshot_id}::uuid`)
        .orderBy('fetched_at', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      if (!snapshot) continue;
      const observation = await reading(trx, scope, check.source_page_id, snapshot.id);
      if (!observation) continue;
      const baseline = check.baseline_snapshot_id
        ? await reading(
            trx,
            scope,
            check.source_page_id,
            check.baseline_snapshot_id,
            check.baseline_roster_version ?? undefined,
          )
        : null;
      const detail = record(check.expected_detail);
      const verdict = evaluatePlacement(
        {
          expected_change: check.expected_change,
          brand_name: String(detail.brand_name ?? ''),
          owned_domains: strings(detail.owned_domains),
          discrepancies: strings(detail.discrepancies),
        },
        baseline,
        observation,
      );
      const attempts = check.attempts + 1;
      const retry =
        verdict.state === p.PLACEMENT_STATE_UNMET ||
        (verdict.state === p.PLACEMENT_STATE_UNAVAILABLE &&
          p.PLACEMENT_RETRYABLE_REASONS.includes(verdict.reason ?? ''));
      await trx
        .updateTable('placement_checks')
        .set({
          state: verdict.state,
          state_reason:
            retry && attempts >= p.PLACEMENT_RECHECK_MAX_ATTEMPTS
              ? p.PLACEMENT_REASON_EXHAUSTED
              : verdict.reason,
          observation_snapshot_id: snapshot.id,
          observed_at: snapshot.fetched_at,
          attempts,
          updated_at: now,
          due_at:
            retry && attempts < p.PLACEMENT_RECHECK_MAX_ATTEMPTS
              ? new Date(now.getTime() + p.PLACEMENT_RECHECK_INTERVAL_HOURS * 3_600_000)
              : null,
        })
        .where('id', '=', check.id)
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .execute();
      count++;
    }
    if (count && onSettled) await onSettled(trx);
    return count;
  });
}
