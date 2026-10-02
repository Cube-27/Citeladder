import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { Audits } from '../generated/db-schema.ts';
import { ProviderError, normalizedUsage, type Answer } from '../answer-engines/contracts.ts';
import type { Engine, ProviderTransport } from '../providers/config.ts';
import { debitUsage, releaseUsage } from '../entitlements/ledger.ts';
import { ownedAuditTask, parkAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import { appendCostProjection } from './costs.ts';
import { auditPolicy, type AuditRuntime } from './config.ts';
import { auditEvent } from './state.ts';
import { pauseExecutionCredential, type ExecutionContext } from './execution-context.ts';

export type ExecutionResult = Omit<Answer, 'logical_engine' | 'transport_provider'> & {
  logical_engine: Engine;
  transport_provider: ProviderTransport;
};
export type DeriveExecution = (
  db: Database,
  task: AuditTask,
  audit: Selectable<Audits>,
  artifactId: string,
) => Promise<void>;

/** Release from durable, scoped ledger proof even if a legacy task's funding snapshot is damaged. */
export async function releaseTerminalTaskCredits(db: Database, task: AuditTask, at: Date) {
  const holds = await db
    .selectFrom('consumable_ledger')
    .select(['reservation_id', 'billing_account_id'])
    .distinct()
    .where('workspace_id', '=', task.workspace_id)
    .where('audit_id', '=', task.audit_id)
    .where('subject_kind', '=', 'audit')
    .where('subject_id', '=', task.id)
    .where('capability_key', '=', 'audit_credits')
    .where('entry_kind', '=', 'reservation')
    .orderBy('billing_account_id')
    .orderBy('reservation_id')
    .execute();
  for (const hold of holds)
    await releaseUsage(db, {
      workspaceId: task.workspace_id,
      accountId: hold.billing_account_id,
      reservationId: hold.reservation_id,
      key: `audit:${task.id}:terminal`,
      at,
    });
}

/** Reservations belong to this workspace, audit and task; never infer a hold from an ID alone. */
export async function settleTaskCredits(
  db: Database,
  task: AuditTask,
  billable: boolean,
  terminal: boolean,
  at: Date,
) {
  if (!billable) {
    if (terminal) await releaseTerminalTaskCredits(db, task, at);
    return;
  }
  const route = record(task.provider_route_snapshot);
  if (route.credential_source === 'byok') return;
  const funding = z
    .object({ reservation_id: z.uuid(), funding_account_id: z.uuid() })
    .safeParse(route.funding);
  if (
    route.credential_source !== 'platform' ||
    !funding.success ||
    route.reservation_id !== funding.data.reservation_id
  )
    throw new Error('Invalid frozen audit funding');
  const { reservation_id: reservationId, funding_account_id: accountId } = funding.data;
  const hold = await db
    .selectFrom('consumable_ledger')
    .select('id')
    .where('workspace_id', '=', task.workspace_id)
    .where('billing_account_id', '=', accountId)
    .where('reservation_id', '=', reservationId)
    .where('audit_id', '=', task.audit_id)
    .where('subject_kind', '=', 'audit')
    .where('subject_id', '=', task.id)
    .where('capability_key', '=', 'audit_credits')
    .where('entry_kind', '=', 'reservation')
    .executeTakeFirst();
  if (!hold) throw new Error('Audit reservation not found');
  const request = { workspaceId: task.workspace_id, accountId, reservationId, at };
  if (billable)
    await debitUsage(db, {
      ...request,
      subjectId: task.id,
      attempt: task.attempt_count,
      units: 1,
      key: `audit:${task.id}:attempt:${task.attempt_count}`,
      dispatchKey: String(task.attempt_count),
    });
  if (terminal) await releaseUsage(db, { ...request, key: `audit:${task.id}:terminal` });
}

/** Evidence numbering counts every exchange; surface polling never spends the paid retry budget. */
export async function appendProviderAttempt(
  db: Database,
  task: AuditTask,
  at: Date,
  facts: {
    artifactId?: string;
    error?: ProviderError;
    latencyMs?: number;
  },
) {
  const count = await db
    .selectFrom('provider_attempts')
    .select(sql<string>`count(*)`.as('count'))
    .where('audit_id', '=', task.audit_id)
    .where('task_id', '=', task.id)
    .executeTakeFirstOrThrow();
  return db
    .insertInto('provider_attempts')
    .values({
      id: randomUUID(),
      audit_id: task.audit_id,
      task_id: task.id,
      attempt_number: Number(count.count) + 1,
      logical_engine: task.logical_engine,
      transport_provider: task.transport_provider,
      transport_model: task.transport_model,
      status: facts.error ? 'failed' : 'succeeded',
      error_code: facts.error?.code ?? '',
      error_detail: facts.error ? `Provider execution failed: ${facts.error.code}` : '',
      artifact_id: facts.artifactId ?? null,
      latency_ms: facts.latencyMs ?? null,
      created_at: at,
    })
    .execute();
}

function retryDelay(runtime: AuditRuntime, attempt: number, retryAfter?: number) {
  const settings = runtime.audits;
  if (retryAfter !== undefined && Number.isFinite(retryAfter))
    return Math.min(Math.max(0, retryAfter), settings.retry_max_delay_seconds);
  return (
    Math.min(settings.retry_base_delay_seconds * 2 ** attempt, settings.retry_max_delay_seconds) +
    ((attempt * 0.37) % 1) * settings.retry_jitter_seconds
  );
}

/** Artifact, analysis, attempts, cost, credits, event and terminal queue state share one commit. */
export function persistExecutionSuccess(
  db: Database,
  claimed: AuditTask,
  owner: string,
  result: ExecutionResult,
  derive: DeriveExecution,
  options: { surface?: boolean; at?: Date } = {},
) {
  const at = options.at ?? new Date();
  if (
    result.logical_engine !== claimed.logical_engine ||
    result.transport_provider !== claimed.transport_provider ||
    result.transport_model !== claimed.transport_model
  )
    throw new Error('Execution route mismatch');
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return null;
    const artifactId = randomUUID();
    const previous = record(locked.task.provider_metadata);
    const reported = previous.provider_submission_cost_microusd;
    const usage = {
      ...normalizedUsage(result.normalized_usage),
      ...(options.surface && typeof reported === 'number'
        ? { provider_cost_microusd: reported }
        : {}),
    };
    const metadata = { ...previous, ...result.provider_metadata };
    const artifact = {
      id: artifactId,
      audit_id: claimed.audit_id,
      task_id: claimed.id,
      logical_engine: result.logical_engine,
      transport_provider: result.transport_provider,
      transport_model: result.transport_model,
      answer_text: result.answer_text,
      search_used: result.search_used,
      search_events: JSON.stringify(result.search_events),
      citations: JSON.stringify(result.citations),
      provider_metadata: JSON.stringify(metadata),
      usage: JSON.stringify(usage),
      finish_reason: result.finish_reason,
      raw_finish_reason: result.raw_finish_reason,
      latency_ms: result.latency_ms,
      created_at: at,
    };
    await trx.insertInto('raw_response_artifacts').values(artifact).execute();
    const task = await trx
      .updateTable('audit_tasks')
      .set({
        status: 'succeeded',
        attempt_count: locked.task.attempt_count + (options.surface ? 0 : 1),
        answer_text: result.answer_text,
        search_used: result.search_used,
        search_events: artifact.search_events,
        citations: artifact.citations,
        provider_metadata: artifact.provider_metadata,
        finish_reason: result.finish_reason,
        raw_finish_reason: result.raw_finish_reason,
        latency_ms: result.latency_ms,
        result_artifact_id: artifactId,
        error_code: '',
        error_detail: '',
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        completed_at: at,
        updated_at: at,
      })
      .where('id', '=', claimed.id)
      .where('workspace_id', '=', claimed.workspace_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await appendProviderAttempt(trx, task, at, { artifactId, latencyMs: result.latency_ms });
    await derive(trx, task, locked.audit, artifactId);
    await appendCostProjection(trx, task.workspace_id, artifactId);
    await settleTaskCredits(trx, task, !options.surface, true, at);
    await auditEvent(
      trx,
      task.audit_id,
      auditPolicy.constants.event_task_succeeded,
      'task succeeded',
      { task_id: task.id },
      at,
    );
    return artifactId;
  });
}

/** Pre-call rejection terminalizes the task without inventing a provider attempt or debit. */
export function persistExecutionFailure(
  db: Database,
  claimed: AuditTask,
  owner: string,
  error: ProviderError,
  runtime: AuditRuntime,
  options: {
    preCall?: boolean;
    surface?: boolean;
    context?: ExecutionContext;
    at?: Date;
    recordAttempt?: boolean;
    scraperFailure?: { outcome: string; raw?: unknown };
    paidSurface?: boolean;
    evidence?: (db: Database, task: AuditTask, audit: Selectable<Audits>) => Promise<void>;
  } = {},
) {
  const at = options.at ?? new Date();
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return null;
    const attempt =
      locked.task.attempt_count +
      (options.preCall || (options.surface && !options.paidSurface) ? 0 : 1);
    const retry =
      !options.preCall && !options.surface && error.retryable && attempt < locked.task.max_attempts;
    const failureArtifactId = options.scraperFailure ? randomUUID() : null;
    const metadata: Record<string, unknown> = {
      ...record(locked.task.provider_metadata),
      ...(options.scraperFailure
        ? {
            scraper_outcome: options.scraperFailure.outcome,
            raw_response: options.scraperFailure.raw ?? {},
          }
        : {}),
    };
    if (failureArtifactId)
      await trx
        .insertInto('raw_response_artifacts')
        .values({
          id: failureArtifactId,
          audit_id: claimed.audit_id,
          task_id: claimed.id,
          logical_engine: claimed.logical_engine,
          transport_provider: claimed.transport_provider,
          transport_model: claimed.transport_model,
          answer_text: '',
          search_used: false,
          search_events: null,
          citations: null,
          finish_reason: 'unknown',
          raw_finish_reason: '',
          latency_ms: null,
          provider_metadata: JSON.stringify(metadata),
          usage:
            typeof metadata.provider_submission_cost_microusd === 'number'
              ? JSON.stringify({
                  provider_cost_microusd: metadata.provider_submission_cost_microusd,
                })
              : null,
          created_at: at,
        })
        .execute();
    const task = await trx
      .updateTable('audit_tasks')
      .set({
        attempt_count: attempt,
        error_code: error.code,
        error_detail: `Provider execution failed: ${error.code}`,
        updated_at: at,
        ...(failureArtifactId
          ? { result_artifact_id: failureArtifactId, provider_metadata: JSON.stringify(metadata) }
          : {}),
      })
      .where('id', '=', claimed.id)
      .where('workspace_id', '=', claimed.workspace_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (!options.preCall && options.recordAttempt !== false)
      await appendProviderAttempt(trx, task, at, {
        error,
        ...(failureArtifactId ? { artifactId: failureArtifactId } : {}),
      });
    if (failureArtifactId) await appendCostProjection(trx, task.workspace_id, failureArtifactId);
    await options.evidence?.(trx, task, locked.audit);
    await settleTaskCredits(
      trx,
      task,
      Boolean(options.paidSurface) || (!options.preCall && !options.surface),
      !retry,
      at,
    );
    if (error.code === 'auth_failure' && options.context)
      await pauseExecutionCredential(trx, options.context, runtime, at);
    if (retry)
      await parkAuditTask(
        trx,
        task,
        'retry_wait',
        new Date(at.getTime() + retryDelay(runtime, attempt, error.retryAfterSeconds) * 1000),
        at,
      );
    else
      await trx
        .updateTable('audit_tasks')
        .set({
          status: 'failed',
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          completed_at: at,
        })
        .where('id', '=', task.id)
        .where('workspace_id', '=', task.workspace_id)
        .execute();
    await auditEvent(
      trx,
      task.audit_id,
      retry ? auditPolicy.constants.event_task_retry : auditPolicy.constants.event_task_failed,
      retry ? 'task retry' : 'task failed',
      { task_id: task.id, error_code: error.code },
      at,
    );
    return { retry, attempt };
  });
}
