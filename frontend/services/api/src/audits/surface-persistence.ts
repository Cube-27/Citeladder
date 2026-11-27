import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { ProviderError } from '../providers/errors.ts';
import { type OverviewResult, overviewAnswer } from '../search-surfaces/parsing.ts';
import { searchPolicy, serpEngine } from '../search-surfaces/dataforseo.ts';
import { ownedAuditTask, parkAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import {
  persistSurfaceFailure,
  persistExecutionSuccess,
  appendProviderAttempt,
  retryDelay,
  type DeriveExecution,
} from './result-persistence.ts';
import { type AuditRuntime } from './config.ts';
import { fitsIndexKey } from '../db/index-key.ts';

async function appendObservation(db: Database, task: AuditTask, result: OverviewResult, at: Date) {
  const request = record(task.request_snapshot);
  const observation = await db
    .insertInto('aio_observations')
    .values({
      id: randomUUID(),
      workspace_id: task.workspace_id,
      audit_id: task.audit_id,
      task_id: task.id,
      outcome: result.outcome,
      error_code: result.error_code,
      provider_status_code: result.provider_status_code,
      aio_present: result.aio_present,
      aio_serp_position: result.aio_serp_position,
      location_code: Number(request.location_code),
      language_code: String(request.language_code),
      device: String(request.device),
      provider_task_id: task.provider_task_id,
      provider_submission_ref: task.provider_submission_ref,
      provider_connection_id: task.provider_connection_id,
      element_count: result.elements.length,
      reference_count: result.references.length,
      observed_at: result.observed_at,
      retrieved_at: at,
      created_at: at,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const links = result.links.filter((link) => fitsIndexKey(link.url));
  if (links.length)
    await db
      .insertInto('aio_entity_links')
      .values(
        links.map((link) => ({
          ...link,
          id: randomUUID(),
          workspace_id: task.workspace_id,
          observation_id: observation.id,
          created_at: at,
        })),
      )
      .execute();
}
export const isOverviewObservation = (result: OverviewResult) =>
  searchPolicy.surface.successful_outcomes.includes(result.outcome);

export function persistOverviewObservation(
  db: Database,
  task: AuditTask,
  owner: string,
  result: OverviewResult,
  derive: DeriveExecution,
  at = new Date(),
) {
  if (!isOverviewObservation(result)) throw new Error('Overview failure is not an observation');
  return persistExecutionSuccess(
    db,
    task,
    owner,
    overviewAnswer(serpEngine(task.logical_engine), result),
    async (trx, current, audit, artifactId) => {
      await appendObservation(trx, current, result, at);
      await derive(trx, current, audit, artifactId);
    },
    { surface: true, at },
  );
}

export function persistOverviewFailure(
  db: Database,
  task: AuditTask,
  owner: string,
  result: OverviewResult,
  runtime: AuditRuntime,
  options: { exchange: 'none' | 'unpaid' | 'paid'; at?: Date },
) {
  if (isOverviewObservation(result)) throw new Error('Overview observation is not a failure');
  const at = options.at ?? new Date();
  return persistSurfaceFailure(
    db,
    task,
    owner,
    new ProviderError(result.error_code || result.outcome),
    runtime,
    {
      exchange: options.exchange,
      at,
      record: {
        kind: 'observation',
        append: (trx, current) => appendObservation(trx, current, result, at),
      },
    },
  );
}

type Delay = { delaySeconds: number };
type SurfaceExchange = Delay &
  (
    | { kind: 'still_pending' }
    | { kind: 'poll_failed'; error: ProviderError }
    | { kind: 'submitted'; taskId: string; chargeMicrousd: number | null; raw: unknown }
    | { kind: 'submission_uncertain'; error: ProviderError; chargeMicrousd: number | null }
    | {
        kind: 'reconciled';
        reconciliation: unknown;
        taskId: string;
        chargeMicrousd: number | null;
      }
    | { kind: 'unreconciled'; reconciliation: unknown }
    | { kind: 'reconcile_failed'; error: ProviderError }
  );

type ExchangeWrite = {
  metadata: Record<string, unknown>;
  taskId: string | null;
  chargeMicrousd: number | null;
  poll: 'advance' | 'reset' | 'hold';
  paid: boolean;
  error: ProviderError | null;
  uncertain: boolean;
};

function exchangeWrite(exchange: SurfaceExchange): ExchangeWrite {
  const none = { metadata: {}, taskId: null, chargeMicrousd: null, error: null };
  switch (exchange.kind) {
    case 'still_pending':
      return { ...none, poll: 'advance', paid: false, uncertain: false };
    case 'poll_failed':
      return { ...none, error: exchange.error, poll: 'advance', paid: false, uncertain: false };
    case 'submitted':
      return {
        ...none,
        metadata: { provider_submission_payload: exchange.raw },
        taskId: exchange.taskId,
        chargeMicrousd: exchange.chargeMicrousd,
        poll: 'hold',
        paid: true,
        uncertain: false,
      };
    case 'submission_uncertain':
      return {
        ...none,
        chargeMicrousd: exchange.chargeMicrousd,
        error: exchange.error,
        poll: 'hold',
        paid: true,
        uncertain: true,
      };
    case 'reconciled':
      return {
        ...none,
        metadata: { reconciliation: exchange.reconciliation },
        taskId: exchange.taskId,
        chargeMicrousd: exchange.chargeMicrousd,
        poll: 'reset',
        paid: false,
        uncertain: false,
      };
    case 'unreconciled':
      return {
        ...none,
        metadata: { reconciliation: exchange.reconciliation },
        poll: 'advance',
        paid: false,
        uncertain: true,
      };
    case 'reconcile_failed':
      return { ...none, error: exchange.error, poll: 'advance', paid: false, uncertain: true };
    default: {
      const unknownExchange: never = exchange;
      throw new Error(`Unknown surface exchange: ${JSON.stringify(unknownExchange)}`);
    }
  }
}

function pollCount(poll: ExchangeWrite['poll'], current: number) {
  if (poll === 'reset') return 0;
  return poll === 'advance' ? current + 1 : current;
}

export function persistSurfaceExchange(
  db: Database,
  input: { claimed: AuditTask; owner: string; exchange: SurfaceExchange; at?: Date },
) {
  const { claimed, owner, exchange, at = new Date() } = input;
  const write = exchangeWrite(exchange);
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return false;
    const metadata = { ...record(locked.task.provider_metadata), ...write.metadata };
    if (
      write.chargeMicrousd !== null &&
      typeof metadata.provider_submission_cost_microusd !== 'number'
    )
      metadata.provider_submission_cost_microusd = write.chargeMicrousd;
    const task = await trx
      .updateTable('audit_tasks')
      .set({
        provider_metadata: JSON.stringify(metadata),
        provider_task_id: write.taskId ?? locked.task.provider_task_id,
        provider_poll_count: pollCount(write.poll, locked.task.provider_poll_count),
        attempt_count: locked.task.attempt_count + (write.paid ? 1 : 0),
        updated_at: at,
      })
      .where('id', '=', claimed.id)
      .where('workspace_id', '=', claimed.workspace_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await appendProviderAttempt(trx, task, at, write.error ? { error: write.error } : {});
    await parkAuditTask(
      trx,
      task,
      write.uncertain ? 'submission_uncertain' : 'awaiting_provider_result',
      new Date(at.getTime() + exchange.delaySeconds * 1000),
      at,
    );
    return true;
  });
}

export function releaseRefusedSubmission(
  db: Database,
  claimed: AuditTask,
  owner: string,
  error: ProviderError,
  runtime: AuditRuntime,
  at = new Date(),
) {
  return db.transaction().execute(async (trx) => {
    const locked = await ownedAuditTask(trx, claimed, owner);
    if (!locked) return false;
    const task = await trx
      .updateTable('audit_tasks')
      .set({ provider_submission_ref: '', provider_task_submitted_at: null, updated_at: at })
      .where('id', '=', claimed.id)
      .where('workspace_id', '=', claimed.workspace_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await appendProviderAttempt(trx, task, at, { error });
    const delay = retryDelay(runtime, task.attempt_count, error.retryAfterSeconds);
    await parkAuditTask(trx, task, 'retry_wait', new Date(at.getTime() + delay * 1000), at);
    return true;
  });
}
