import { randomUUID, createHash } from 'node:crypto';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { fenceInspectionTask } from './task-fence.ts';

export type SourceScope = { workspaceId: string; projectId: string };
const p = policy.source_pages;
async function remaining(db: Database, scope: SourceScope, now: Date) {
  const row = await db
    .selectFrom('source_page_inspection_spend')
    .select(sql<string>`coalesce(sum(units), 0)`.as('spent'))
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('created_at', '>=', new Date(now.getTime() - p.budget_window_hours * 3_600_000))
    .executeTakeFirstOrThrow();
  return Math.max(0, p.budget_per_window - Number(row.spent));
}
async function spend(
  db: Database,
  scope: SourceScope,
  kind: string,
  key: string,
  pageId: string | null,
  now: Date,
) {
  return db
    .insertInto('source_page_inspection_spend')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      source_page_id: pageId,
      spend_kind: kind,
      units: 1,
      idempotency_key: key,
      created_at: now,
    })
    .onConflict((oc) => oc.column('idempotency_key').doNothing())
    .returning('id')
    .executeTakeFirst();
}
export async function spendRedirect(
  db: Database,
  scope: SourceScope,
  url: string,
  now = new Date(),
  task?: QueueTask,
) {
  return db.transaction().execute(async (trx) => {
    await fenceInspectionTask(trx, task);
    await requireScope(trx, scope);
    await acquireProjectLock(trx, scope.projectId);
    if (!(await remaining(trx, scope, now))) return false;
    const digest = createHash('sha256').update(url).digest('hex');
    return Boolean(
      await spend(trx, scope, 'redirect', `redirect:${scope.projectId}:${digest}`, null, now),
    );
  });
}
export async function claimPages(
  db: Database,
  scope: SourceScope,
  now = new Date(),
  pageIds?: string[],
  task?: QueueTask,
) {
  if (pageIds && !pageIds.length) return [];
  return db.transaction().execute(async (trx) => {
    await fenceInspectionTask(trx, task);
    await requireScope(trx, scope);
    await acquireProjectLock(trx, scope.projectId);
    const budget = Math.min(p.batch_max, await remaining(trx, scope, now));
    if (!budget) return [];
    const due = await trx
      .selectFrom('placement_checks')
      .select('source_page_id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('due_at', '<=', now)
      .where('state', 'in', ['pending', 'unmet', 'unavailable'])
      .orderBy('due_at')
      .limit(policy.opportunity.placement.PLACEMENT_DUE_PAGES_MAX)
      .execute();
    let query = trx
      .selectFrom('source_pages')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('inspection_state', '!=', 'blocked')
      .where((eb) =>
        eb.or([
          eb('inspection_state', '!=', 'queued'),
          eb('claim_expires_at', 'is', null),
          eb('claim_expires_at', '<', now),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb('last_inspected_at', 'is', null),
          eb('last_inspected_at', '<', new Date(now.getTime() - p.reuse_within_hours * 3_600_000)),
        ]),
      )
      .orderBy(sql`case when inspection_state = 'not_inspected' then 0 when inspection_state = 'stale' then 1
        when id = any(${due.map((d) => d.source_page_id)}::uuid[]) then 2 else 3 end`)
      .orderBy('recurrence_count', 'desc')
      .orderBy(sql`last_cited_at desc nulls last`)
      .orderBy('id')
      .limit(budget);
    if (pageIds) query = query.where('id', 'in', pageIds);
    const lease = new Date(now.getTime() + p.claim_lease_minutes * 60_000);
    const claims = [];
    for (const page of await query.execute()) {
      const kind = ['inspected', 'stale'].includes(page.inspection_state) ? 'recheck' : 'page';
      if (
        !(await spend(
          trx,
          scope,
          kind,
          `${kind}:${page.id}:${Math.floor(lease.getTime() / 1000)}`,
          page.id,
          now,
        ))
      )
        continue;
      await trx
        .updateTable('source_pages')
        .set({ inspection_state: 'queued', claim_expires_at: lease, updated_at: now })
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', '=', page.id)
        .execute();
      claims.push({ id: page.id, url: page.canonical_url, lease });
    }
    return claims;
  });
}

async function requireScope(db: Database, scope: SourceScope) {
  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!project) throw new Error('Source-page project is outside its workspace');
}
