import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import { policy } from '../config.ts';
import { getLogger } from '../logging.ts';
import { searchPolicy } from '../search-surfaces/dataforseo.ts';
import { ownedAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import { releaseTerminalTaskCredits } from './result-persistence.ts';
import { auditPolicy } from './config.ts';
import { auditEvent, transitionAudit } from './state.ts';

const batchSize = auditPolicy.constants.audit_lease_sweep_batch_size;
type Parent = { workspaceId: string; auditId: string };
/** A prior Python writer could commit evidence before its separate queue transition. */
export async function repairOwnedCompletion(
  db: Database,
  claimed: AuditTask,
  owner: string,
  at: Date,
) {
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return false;
    const { task, audit } = locked;
    const observation =
      task.logical_engine === 'google_ai_overview'
        ? await trx
            .selectFrom('aio_observations')
            .select(['outcome', 'error_code'])
            .where('workspace_id', '=', task.workspace_id)
            .where('audit_id', '=', task.audit_id)
            .where('task_id', '=', task.id)
            .executeTakeFirst()
        : undefined;
    if (!task.result_artifact_id && !observation) return false;
    const successfulObservation =
      observation && searchPolicy.surface.successful_outcomes.includes(observation.outcome);
    let failed = Boolean(task.error_code) || Boolean(observation && !successfulObservation);
    if (task.result_artifact_id) {
      const artifact = await trx
        .selectFrom('raw_response_artifacts')
        .select(['id', 'logical_engine', 'transport_provider', 'transport_model'])
        .where('id', '=', task.result_artifact_id)
        .where('task_id', '=', task.id)
        .where('audit_id', '=', audit.id)
        .executeTakeFirstOrThrow();
      if (
        artifact.logical_engine !== task.logical_engine ||
        artifact.transport_provider !== task.transport_provider ||
        artifact.transport_model !== task.transport_model
      )
        throw new Error('Persisted execution identity mismatch');
    } else if (successfulObservation)
      throw new Error('Successful observation has no immutable artifact');
    if (successfulObservation) failed = false;
    await releaseTerminalTaskCredits(trx, task, at);
    await trx
      .updateTable('audit_tasks')
      .set({
        status: failed ? 'failed' : 'succeeded',
        completed_at: at,
        updated_at: at,
        error_code: failed ? observation?.error_code || task.error_code || 'provider_error' : '',
        error_detail: failed ? task.error_detail : '',
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
      })
      .where('workspace_id', '=', task.workspace_id)
      .where('audit_id', '=', audit.id)
      .where('id', '=', task.id)
      .execute();
    return true;
  });
}

/** Scope, cancellation, queue transitions and unused funding release commit together. */
export async function cancelAudit(
  db: Database,
  workspaceId: string,
  auditId: string,
  at = new Date(),
) {
  return db.transaction().execute(async (trx) => {
    const audit = await trx
      .selectFrom('audits')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', auditId)
      .forUpdate()
      .executeTakeFirst();
    if (!audit) throw notFound('Audit');
    if (!auditPolicy.constants.audit_active_statuses.includes(audit.status))
      throw new ApiError(409, 'Only active audits can be cancelled');
    await transitionAudit(trx, workspaceId, auditId, 'cancelled', at, 'audit cancelled');
    const tasks = await trx
      .updateTable('audit_tasks')
      .set({
        status: 'cancelled',
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        completed_at: at,
        updated_at: at,
        error_code: 'cancelled',
      })
      .where('workspace_id', '=', workspaceId)
      .where('audit_id', '=', auditId)
      .where('status', 'not in', policy.task_queue.terminal)
      .returningAll()
      .execute();
    for (const task of tasks) await releaseTerminalTaskCredits(trx, task, at);
    await trx
      .updateTable('audits')
      .set({ completed_at: at })
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', auditId)
      .execute();
    await auditEvent(
      trx,
      auditId,
      auditPolicy.constants.event_audit_cancelled,
      'audit cancelled',
      { status: 'cancelled' },
      at,
    );
    return auditId;
  });
}

export class AuditMaintenance {
  readonly db: Database;
  readonly finalize: (workspaceId: string, auditId: string) => Promise<unknown>;
  constructor(db: Database, finalize: (workspaceId: string, auditId: string) => Promise<unknown>) {
    this.db = db;
    this.finalize = finalize;
  }
  async runOnce(at = new Date(), canAdmit = () => true) {
    if (!canAdmit()) return 0;
    const expired = await this.db
      .selectFrom('audit_tasks')
      .select(['id', 'workspace_id', 'audit_id', 'project_id'])
      .where('status', 'in', ['leased', 'running'])
      .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
      .orderBy('lease_expires_at')
      .orderBy('id')
      .limit(batchSize)
      .execute();
    const parents = new Map<string, Parent>();
    let reclaimed = 0;
    for (const candidate of expired) {
      if (!canAdmit()) break;
      const terminal = await this.db.transaction().execute(async (trx) => {
        // Match all other audit writers' lock order. SKIP LOCKED never waits on a live writer.
        const audit = await trx
          .selectFrom('audits')
          .selectAll()
          .where('workspace_id', '=', candidate.workspace_id)
          .where('id', '=', candidate.audit_id)
          .where('project_id', '=', candidate.project_id)
          .forUpdate()
          .skipLocked()
          .executeTakeFirst();
        if (!audit) return null;
        const task = await trx
          .selectFrom('audit_tasks')
          .selectAll()
          .where('workspace_id', '=', candidate.workspace_id)
          .where('id', '=', candidate.id)
          .where('audit_id', '=', audit.id)
          .where('status', 'in', ['leased', 'running'])
          .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
          .forUpdate()
          .skipLocked()
          .executeTakeFirst();
        if (!task) return null;
        const parentTerminal = auditPolicy.constants.audit_terminal_statuses.includes(audit.status);
        const uncertain = Boolean(
          task.provider_submission_ref && !task.provider_task_id && !parentTerminal,
        );
        const attempts = task.attempt_count + (uncertain || parentTerminal ? 0 : 1);
        const failed = !uncertain && (parentTerminal || attempts >= task.max_attempts);
        await trx
          .updateTable('audit_tasks')
          .set({
            status: uncertain
              ? 'submission_uncertain'
              : failed
                ? audit.status === 'cancelled'
                  ? 'cancelled'
                  : 'failed'
                : 'retry_wait',
            attempt_count: attempts,
            available_at: at,
            lease_owner: null,
            lease_expires_at: null,
            heartbeat_at: null,
            updated_at: at,
            ...(failed
              ? {
                  completed_at: at,
                  error_code:
                    task.error_code ||
                    (audit.status === 'cancelled'
                      ? 'cancelled'
                      : policy.task_queue.max_attempts_error),
                  error_detail: task.error_detail || 'lease expired after max attempts exhausted',
                }
              : {}),
          })
          .where('workspace_id', '=', task.workspace_id)
          .where('audit_id', '=', audit.id)
          .where('id', '=', task.id)
          .execute();
        if (failed) await releaseTerminalTaskCredits(trx, task, at);
        return failed;
      });
      if (terminal === null) continue;
      reclaimed++;
      if (terminal)
        parents.set(candidate.audit_id, {
          workspaceId: candidate.workspace_id,
          auditId: candidate.audit_id,
        });
    }
    // Reconcile funding left owing by older workers or cross-queue sweeper terminalization.
    const owing = await this.db
      .selectFrom('consumable_ledger as l')
      .innerJoin('audit_tasks as t', (join) =>
        join
          .onRef('t.workspace_id', '=', 'l.workspace_id')
          .onRef('t.audit_id', '=', 'l.audit_id')
          .onRef('t.id', '=', 'l.subject_id'),
      )
      .select(['t.id', 't.workspace_id', 't.audit_id'])
      .where('l.subject_kind', '=', 'audit')
      .where('l.capability_key', '=', 'audit_credits')
      .where('t.status', 'in', policy.task_queue.terminal)
      .groupBy(['t.id', 't.workspace_id', 't.audit_id'])
      .having(
        sql<number>`sum(case when l.entry_kind = 'reservation' then l.units when l.entry_kind = 'release' then -l.units else 0 end)`,
        '>',
        0,
      )
      .orderBy('t.id')
      .limit(batchSize)
      .execute();
    for (const candidate of owing) {
      if (!canAdmit()) break;
      await this.db.transaction().execute(async (trx) => {
        const audit = await trx
          .selectFrom('audits')
          .select('id')
          .where('workspace_id', '=', candidate.workspace_id)
          .where('id', '=', candidate.audit_id)
          .forUpdate()
          .executeTakeFirst();
        if (!audit) return;
        const task = await trx
          .selectFrom('audit_tasks')
          .selectAll()
          .where('workspace_id', '=', candidate.workspace_id)
          .where('audit_id', '=', audit.id)
          .where('id', '=', candidate.id)
          .where('status', 'in', policy.task_queue.terminal)
          .forUpdate()
          .executeTakeFirst();
        if (task) await releaseTerminalTaskCredits(trx, task, at);
      });
      parents.set(candidate.audit_id, {
        workspaceId: candidate.workspace_id,
        auditId: candidate.audit_id,
      });
    }
    // A separate sweeper may have failed the final BYOK task without owning audit finalization.
    const ready = await this.db
      .selectFrom('audits as a')
      .select(['a.id', 'a.workspace_id'])
      .where('a.status', 'in', ['queued', 'running', 'analyzing'])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('audit_tasks as t')
            .select('t.id')
            .whereRef('t.audit_id', '=', 'a.id')
            .whereRef('t.workspace_id', '=', 'a.workspace_id'),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('audit_tasks as t')
              .select('t.id')
              .whereRef('t.audit_id', '=', 'a.id')
              .whereRef('t.workspace_id', '=', 'a.workspace_id')
              .where('t.status', 'not in', policy.task_queue.terminal),
          ),
        ),
      )
      .orderBy('a.updated_at')
      .limit(batchSize)
      .execute();
    for (const audit of ready)
      parents.set(audit.id, { workspaceId: audit.workspace_id, auditId: audit.id });
    const inspectionOwing = await this.db
      .selectFrom('audits as a')
      .select(['a.id', 'a.workspace_id'])
      .where('a.status', 'in', ['completed', 'partially_completed'])
      .where((eb) =>
        eb.not(
          eb.exists(
            // The unique idempotency key the inspection enqueue writes.
            eb
              .selectFrom('analytics_tasks as t')
              .select('t.id')
              .where(
                sql<boolean>`t.idempotency_key = 'analytics:source_page_inspection:' || a.project_id::text || ':' || a.id::text`,
              ),
          ),
        ),
      )
      .orderBy('a.completed_at')
      .limit(batchSize)
      .execute();
    for (const audit of inspectionOwing)
      parents.set(audit.id, { workspaceId: audit.workspace_id, auditId: audit.id });
    await this.finalizeParents(parents.values(), canAdmit);
    return reclaimed;
  }

  private async finalizeParents(parents: Iterable<Parent>, canAdmit: () => boolean) {
    for (const parent of parents) {
      if (!canAdmit()) break;
      try {
        await this.finalize(parent.workspaceId, parent.auditId); // NOSONAR -- Settle each parent before admitting the next within budget.
      } catch {
        getLogger('workers.audit').info('audit_maintenance_finalize_failed', {
          audit_id: parent.auditId,
        });
      }
    }
  }
}
