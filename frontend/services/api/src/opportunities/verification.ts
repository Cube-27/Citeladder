import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { utcText } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { epochMicros, parseDatetime } from '../http/datetimes.ts';
import { parseUuid } from '../http/uuid.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { record } from '../traffic/performance.ts';
import { taskProject, type Executor } from '../workers/executor.ts';
import { observationKind } from './verification-decisions.ts';
import { evidenceFor, type Source } from './verification-evidence.ts';
import { buildVerificationResult, type Declaration } from './verification-result.ts';
const p = policy.opportunity.opportunities;
async function verificationSource(db: Database, task: QueueTask, project: string): Promise<Source> {
  const payload = record(task.payload);
  const kind = String(payload.trigger_kind || '');
  const id = parseUuid(payload.trigger_id);
  if (!id) throw new Error('Implementation verification trigger is invalid');
  const scope = new WorkspaceScope(task.workspace_id);
  let observed: string | null | undefined;
  if (kind === 'site_crawl')
    observed = (
      await scope
        .selectFrom(db, 'site_crawls')
        .select(utcText(sql.ref('completed_at')).as('time'))
        .where('project_id', '=', project)
        .where('id', '=', id)
        .executeTakeFirst()
    )?.time;
  else if (kind === 'audit')
    observed = (
      await scope
        .selectFrom(db, 'audits')
        .select(utcText(sql.ref('completed_at')).as('time'))
        .where('project_id', '=', project)
        .where('id', '=', id)
        .executeTakeFirst()
    )?.time;
  else if (kind === 'traffic_snapshot')
    observed = (
      await scope
        .selectFrom(db, 'traffic_snapshots')
        .select(utcText(sql.ref('created_at')).as('time'))
        .where('project_id', '=', project)
        .where('id', '=', id)
        .executeTakeFirst()
    )?.time;
  else if (kind === 'source_page_inspection') {
    let query = scope
      .selectFrom(db, 'placement_checks')
      .select(utcText(sql`max(observed_at)`).as('time'))
      .where('project_id', '=', project);
    const since =
      typeof payload.settled_since === 'string' ? parseDatetime(payload.settled_since) : null;
    if (since)
      query = query.where(
        'updated_at',
        '>=',
        sql<Date>`${String(payload.settled_since)}::timestamptz`,
      );
    observed = (await query.executeTakeFirst())?.time;
  } else throw new Error('Implementation verification trigger kind is invalid');
  if (!observed) throw new Error('Implementation verification source is not terminal');
  return { kind, id, observed_at: `${observed}Z` };
}
/** Exact source timestamp used by verification idempotency. */
function sourceRevision(text: string): string {
  const parsed = parseDatetime(text);
  if (!parsed) throw new Error('Invalid verification timestamp');
  return epochMicros(parsed).toString();
}
async function declarations(
  db: Database,
  task: QueueTask,
  project: string,
  source: Source,
  after: Declaration | undefined,
): Promise<Declaration[]> {
  let query = new WorkspaceScope(task.workspace_id)
    .selectFrom(db, 'opportunity_implementation_events')
    .selectAll()
    .select([
      utcText(sql.ref('created_at')).as('created_text'),
      utcText(sql.ref('declared_implemented_at')).as('declared_text'),
    ])
    .where('project_id', '=', project)
    .where('declared_implemented_at', '<=', sql<Date>`${source.observed_at}::timestamptz`);
  if (after)
    query = query.where((eb) =>
      eb.or([
        eb('created_at', '>', sql<Date>`${after.created_at}::timestamptz`),
        eb.and([
          eb('created_at', '=', sql<Date>`${after.created_at}::timestamptz`),
          eb('id', '>', after.id),
        ]),
      ]),
    );
  const rows = await query
    .orderBy('created_at')
    .orderBy('id')
    .limit(p.IMPLEMENTATION_VERIFICATION_BATCH_MAX)
    .execute();
  return rows.map((row) => ({
    ...row,
    created_at: `${row.created_text}Z`,
    declared_implemented_at: `${row.declared_text}Z`,
  }));
}
/** The queue claim is already committed; this transaction only reads persisted evidence. */
export const verifyImplementationEvents: Executor = async (task, context) => {
  const project = await taskProject(context.db, task);
  await context.db.transaction().execute(async (db) => {
    const source = await verificationSource(db, task, project);
    let after: Declaration | undefined;
    for (;;) {
      const rows = await declarations(db, task, project, source, after);
      for (const declaration of rows) {
        const result = await evidenceFor(db, declaration, source);
        const kind = observationKind(
          result,
          Array.isArray(declaration.expected_checks) ? declaration.expected_checks.length : 0,
        );
        if (!kind) continue;
        const comparison = await buildVerificationResult(
          db,
          declaration,
          source.kind === 'audit' ? source.id : null,
        );
        await db
          .insertInto('opportunity_verification_events')
          .values({
            id: randomUUID(),
            workspace_id: task.workspace_id,
            project_id: project,
            implementation_event_id: declaration.id,
            observation_kind: kind,
            observed_at: source.observed_at,
            created_at: sql`now()`,
            crawl_id: source.kind === 'site_crawl' ? source.id : null,
            audit_id: source.kind === 'audit' ? source.id : null,
            source_analysis_ids: sql`${JSON.stringify([...result.analysis_ids])}::jsonb`,
            source_rule_evaluation_ids: sql`${JSON.stringify([...result.rule_evaluation_ids])}::jsonb`,
            source_metric_ids: sql`${JSON.stringify([...result.metric_ids])}::jsonb`,
            result: sql`${JSON.stringify(comparison)}::jsonb`,
            verifier_version: p.IMPLEMENTATION_VERIFIER_VERSION,
            limitations: sql`${JSON.stringify(result.limitations)}::jsonb`,
            idempotency_key: `verification:${declaration.id}:${source.kind}:${source.id}:${sourceRevision(source.observed_at)}:${p.IMPLEMENTATION_VERIFIER_VERSION}`,
          })
          .onConflict((oc) => oc.columns(['workspace_id', 'idempotency_key']).doNothing())
          .execute();
      }
      if (rows.length < p.IMPLEMENTATION_VERIFICATION_BATCH_MAX) break;
      after = rows.at(-1);
    }
  });
};
