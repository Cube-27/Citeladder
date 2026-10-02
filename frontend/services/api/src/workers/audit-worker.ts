import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { getLogger } from '../logging.ts';
import { AuditQueue, ownedAuditTask, parkAuditTask, type AuditTask } from '../queue/audit-queue.ts';
import { ProviderError } from '../answer-engines/contracts.ts';
import { executeAnswer } from '../answer-engines/execute.ts';
import { acquireCapacity, releaseCapacity, type CapacityDecision } from '../providers/capacity.ts';
import { providerPolicy } from '../providers/config.ts';
import {
  createDataforseoClient,
  searchPolicy,
  SubmissionUncertain,
  type SearchEngine,
} from '../search-surfaces/dataforseo.ts';
import {
  parseOverview,
  parseScraper,
  surfaceFailure,
  type OverviewResult,
  overviewAnswer,
} from '../search-surfaces/parsing.ts';
import { reconcilePage } from '../search-surfaces/reconciliation.ts';
import {
  directRequest,
  frozenSurfaceRequest,
  loadExecutionContext,
  pauseExecutionCredential,
  type ExecutionContext,
} from '../audits/execution-context.ts';
import { commitSubmissionIntent, surfaceRecoveryDeadline } from '../audits/submission-intent.ts';
import {
  persistExecutionFailure,
  persistExecutionSuccess,
  type DeriveExecution,
  type ExecutionResult,
} from '../audits/result-persistence.ts';
import { persistOverview, persistSurfaceExchange } from '../audits/surface-persistence.ts';
import { auditPolicy, type AuditRuntime } from '../audits/config.ts';
import { auditEvent } from '../audits/state.ts';
import { AuditMaintenance, repairOwnedCompletion } from '../audits/maintenance.ts';

const logger = getLogger('workers.audit');
const reconciliationState = z.object({
  offset: z.number().int().nonnegative(),
  matches: z.record(z.string(), z.number().nullable()),
  upper: z.string(),
});
type DispatchState = { started: boolean; rateError?: ProviderError };

type ProjectionOwners = {
  execution: DeriveExecution;
  prepare?: (context: ExecutionContext, result: ExecutionResult) => Promise<DeriveExecution>;
  finalize: (workspaceId: string, auditId: string) => Promise<unknown>;
};

/** One lease advances one stored phase. Provider retries live exclusively in PostgreSQL. */
export class AuditWorker {
  readonly owner: string;
  readonly #db: Database;
  readonly #queue: AuditQueue;
  readonly #runtime: AuditRuntime;
  readonly #key: string;
  readonly #projections: ProjectionOwners;
  readonly #send: typeof fetch;
  readonly #executeAnswer: typeof executeAnswer;
  readonly #taskScope: { workspaceId: string; auditId: string } | undefined;
  readonly #now: () => Date;
  readonly #env: Record<string, string | undefined>;
  readonly #maintenance: AuditMaintenance;
  #lastSweep = -Infinity;
  constructor(
    db: Database,
    runtime: AuditRuntime,
    encryptionKey: string,
    projections: ProjectionOwners,
    options: {
      owner?: string;
      send?: typeof fetch;
      execute?: typeof executeAnswer;
      taskScope?: { workspaceId: string; auditId: string };
      now?: () => Date;
      env?: Record<string, string | undefined>;
    } = {},
  ) {
    this.#db = db;
    this.#runtime = runtime;
    this.#key = encryptionKey;
    this.#projections = projections;
    this.#send = options.send ?? globalThis.fetch;
    this.#executeAnswer = options.execute ?? executeAnswer;
    this.#taskScope = options.taskScope;
    this.#now = options.now ?? (() => new Date());
    this.#env = options.env ?? process.env;
    this.owner = options.owner ?? `audit-worker-ts-${randomBytes(6).toString('hex')}`;
    this.#queue = new AuditQueue(db, runtime.audits.lease_ttl_seconds, this.#now);
    this.#maintenance = new AuditMaintenance(db, projections.finalize);
  }
  async runOnce(signal?: AbortSignal) {
    const at = this.#now();
    if (at.getTime() - this.#lastSweep >= this.#runtime.audits.poll_interval_seconds * 1000) {
      this.#lastSweep = at.getTime();
      await this.#maintenance.runOnce(at);
    }
    const tasks = await this.#queue.claim(
      this.owner,
      this.#runtime.audits.worker_concurrency,
      this.#taskScope,
    );
    await Promise.all(tasks.map((task) => this.#execute(task, signal)));
    return tasks.length;
  }
  async #execute(claimed: AuditTask, signal?: AbortSignal) {
    const abort = new AbortController();
    let beating: Promise<unknown> | undefined;
    const heartbeat = setInterval(
      () => {
        if (beating) return;
        beating = this.#queue
          .heartbeat(claimed, this.owner)
          .then((live) => {
            if (!live) abort.abort();
          })
          .catch(() => {
            logger.info('audit_heartbeat_failed', { task_id: claimed.id });
          })
          .finally(() => {
            beating = undefined;
          });
      },
      Math.max(1, this.#runtime.audits.heartbeat_interval_seconds) * 1000,
    );
    const dispatchSignal = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]);
    let context: ExecutionContext | null = null;
    const dispatch: DispatchState = { started: false };
    try {
      if (await repairOwnedCompletion(this.#db, claimed, this.owner, this.#now())) return;
      // Start the parent now; publish task running only after acquiring provider capacity.
      const running = await this.#queue.markRunning(claimed, this.owner, false);
      if (!running) return;
      claimed = running.task;
      if ((await this.#checkDeadline(claimed)).expired) return;
      context = await this.#loadContext(claimed);
      if (!context) return;
      const surface = context.task.transport_provider === 'dataforseo';
      const { expired, recovery } = await this.#checkDeadline(claimed, context);
      if (expired) return;
      const capacity = { ...context.capacity };
      if (
        ['chatgpt_search', 'gemini_consumer'].includes(claimed.logical_engine) &&
        claimed.provider_submission_ref &&
        !claimed.provider_task_id &&
        capacity.source === 'byok'
      ) {
        capacity.engine = providerPolicy.scraper_reconciliation_capacity_engine;
        capacity.accountPoolIdentity = createHash('sha256')
          .update(`${capacity.accountPoolIdentity}:${capacity.engine}`)
          .digest('hex');
      }
      const decision = await acquireCapacity(this.#db, capacity, this.#runtime, this.#now());
      if (!decision.acquired) {
        await this.#parkCapacity(claimed, decision, recovery);
        return;
      }

      try {
        // Recheck ownership after acquiring capacity, immediately before any network boundary.
        const live = await this.#db
          .transaction()
          .execute((trx) => ownedAuditTask(trx, claimed, this.owner));
        if (!live || dispatchSignal.aborted) return;
        if (!(await this.#queue.markRunning(claimed, this.owner))) return;
        if (surface) await this.#surface(context, dispatchSignal);
        else {
          await this.#dispatchDirect(claimed, context, dispatch, dispatchSignal);
        }
      } catch (error) {
        if (error instanceof ProviderError) dispatch.rateError = error;
        throw error;
      } finally {
        await releaseCapacity(
          this.#db,
          capacity,
          this.#runtime,
          {
            rateLimited: dispatch.rateError?.code === 'rate_limit',
            retryAfterSeconds: dispatch.rateError?.retryAfterSeconds,
          },
          this.#now(),
        );
      }
    } catch (error) {
      logger.info('audit_task_internal_failure', {
        task_id: claimed.id,
        error_code: error instanceof ProviderError ? error.code : 'unknown',
      });
      if (claimed.transport_provider === 'dataforseo')
        await this.#failSurface(claimed, context, 'submission_unreconciled', false);
      else
        await persistExecutionFailure(
          this.#db,
          claimed,
          this.owner,
          error instanceof ProviderError ? error : new ProviderError('unknown'),
          this.#runtime,
          { preCall: !dispatch.started, ...(context ? { context } : {}), at: this.#now() },
        );
    } finally {
      clearInterval(heartbeat);
      await beating;
      await this.#projections.finalize(claimed.workspace_id, claimed.audit_id);
    }
  }
  async #dispatchDirect(
    claimed: AuditTask,
    context: ExecutionContext,
    dispatch: DispatchState,
    signal: AbortSignal,
  ) {
    const request = directRequest(context);
    dispatch.started = true;
    let answer;
    try {
      answer = await this.#executeAnswer(
        request,
        { secret: context.secret, base_url: context.endpoint },
        this.#runtime.providers,
        this.#send,
        signal,
      );
    } catch (error) {
      const safe = error instanceof ProviderError ? error : new ProviderError('unknown');
      dispatch.rateError = safe;
      await persistExecutionFailure(this.#db, claimed, this.owner, safe, this.#runtime, {
        context,
        at: this.#now(),
      });
      return;
    }
    await persistExecutionSuccess(
      this.#db,
      claimed,
      this.owner,
      answer,
      await this.#prepare(context, answer),
      { at: this.#now() },
    );
  }
  async #loadContext(claimed: AuditTask) {
    try {
      return await loadExecutionContext(
        this.#db,
        claimed,
        this.owner,
        this.#runtime,
        this.#key,
        this.#now(),
        this.#env,
      );
    } catch (error) {
      const safe =
        error instanceof ProviderError
          ? error
          : new ProviderError(auditPolicy.constants.error_no_connection);
      if (claimed.transport_provider === 'dataforseo')
        await this.#failSurface(claimed, null, 'credential_unavailable_for_retrieval', false);
      else
        await persistExecutionFailure(this.#db, claimed, this.owner, safe, this.#runtime, {
          preCall: true,
          at: this.#now(),
        });
      return null;
    }
  }
  async #checkDeadline(claimed: AuditTask, context?: ExecutionContext) {
    const task = context?.task ?? claimed;
    const recovery = surfaceRecoveryDeadline(
      task,
      Number(
        record(task.request_snapshot).recovery_deadline_hours ??
          this.#runtime.search.recoveryDeadlineHours,
      ),
    );
    if (recovery && this.#now() >= recovery) {
      await this.#failSurface(claimed, context ?? null, 'submission_unreconciled', false);
      return { expired: true, recovery };
    }
    const audit = context?.audit;
    const runExpired =
      !recovery &&
      audit?.started_at &&
      this.#now().getTime() - audit.started_at.getTime() >=
        Number(
          record(audit.configuration).max_run_seconds ?? this.#runtime.audits.max_run_seconds,
        ) *
          1000;
    if (!runExpired) return { expired: false, recovery };
    if (task.transport_provider === 'dataforseo')
      await this.#failSurface(claimed, context ?? null, 'poll_ceiling_exceeded', false);
    else
      await persistExecutionFailure(
        this.#db,
        claimed,
        this.owner,
        new ProviderError(auditPolicy.constants.error_run_deadline),
        this.#runtime,
        { preCall: true, at: this.#now() },
      );
    return { expired: true, recovery };
  }
  #parkCapacity(
    task: AuditTask,
    decision: Extract<CapacityDecision, { acquired: false }>,
    deadline: Date | null,
  ) {
    const at = this.#now(),
      available = deadline && decision.availableAt > deadline ? deadline : decision.availableAt;
    return this.#db.transaction().execute(async (trx) => {
      const locked = await ownedAuditTask(trx, task, this.owner);
      if (!locked) return;
      await parkAuditTask(trx, locked.task, 'capacity_wait', available, at);
      await auditEvent(
        trx,
        task.audit_id,
        auditPolicy.constants.event_task_capacity_wait,
        'task capacity wait',
        {
          task_id: task.id,
          attempt: locked.task.attempt_count + 1,
          code: decision.code,
          pool_kind: decision.poolKind,
          available_at: available.toISOString(),
          retry_after_seconds: Math.max(0, (available.getTime() - at.getTime()) / 1000),
        },
        at,
      );
    });
  }
  async #prepare(context: ExecutionContext, result: ExecutionResult) {
    return this.#projections.prepare
      ? this.#projections.prepare(context, result)
      : this.#projections.execution;
  }
  async #surface(context: ExecutionContext, signal: AbortSignal) {
    const task = context.task,
      engine = task.logical_engine as SearchEngine,
      c = searchPolicy.constants;
    const client = createDataforseoClient(
      { secret: context.secret, base_url: context.endpoint },
      this.#runtime.providers,
      Number(record(task.request_snapshot).timeout_seconds ?? this.#runtime.search.timeoutSeconds),
      this.#send,
      signal,
    );
    if (task.provider_task_id) {
      if (engine === 'google_ai_overview' && task.provider_poll_count >= c.poll_ceiling) {
        await this.#failSurface(task, context, 'poll_ceiling_exceeded', false);
        return;
      }
      try {
        const payload = await client.retrieve(engine, task.provider_task_id);
        const result =
          engine === 'google_ai_overview'
            ? parseOverview(payload, task.provider_task_id)
            : parseScraper(payload, task.provider_task_id, engine);
        if (result === 'still_pending')
          await persistSurfaceExchange(
            this.#db,
            task,
            this.owner,
            { poll: true, delaySeconds: c.poll_interval_seconds },
            this.#now(),
          );
        else if (engine === 'google_ai_overview')
          await persistOverview(
            this.#db,
            task,
            this.owner,
            result as OverviewResult,
            this.#runtime,
            this.#now(),
            true,
            false,
            searchPolicy.surface.successful_outcomes.includes((result as OverviewResult).outcome)
              ? await this.#prepare(context, overviewAnswer(result as OverviewResult))
              : this.#projections.execution,
          );
        else
          await persistExecutionSuccess(
            this.#db,
            task,
            this.owner,
            result as Exclude<typeof result, OverviewResult>,
            await this.#prepare(context, result as ExecutionResult),
            { surface: true, at: this.#now() },
          );
      } catch (error) {
        const safe = error instanceof ProviderError ? error : new ProviderError('parse_error');
        if (safe.retryable)
          await persistSurfaceExchange(
            this.#db,
            task,
            this.owner,
            { error: safe, poll: true, delaySeconds: c.poll_interval_seconds },
            this.#now(),
          );
        else await this.#failSurface(task, context, 'provider_error', true, safe);
        if (safe.code === 'rate_limit') throw safe;
      }
      return;
    }
    if (task.provider_submission_ref) {
      await this.#reconcile(context, client);
      return;
    }
    const intent = await commitSubmissionIntent(this.#db, context, this.owner, this.#now());
    if (!intent) return;
    if (!intent.fresh) {
      await this.#reconcile({ ...context, task: intent.task }, client);
      return;
    }
    const request = frozenSurfaceRequest(
      context,
      intent.task.provider_submission_ref,
      this.#runtime,
    );
    try {
      const submission = await client.submit(engine, request);
      await persistSurfaceExchange(
        this.#db,
        intent.task,
        this.owner,
        {
          taskId: submission.taskId,
          chargeMicrousd: submission.chargeMicrousd,
          raw: submission.envelope,
          paid: true,
          delaySeconds: c.first_poll_delay_seconds,
        },
        this.#now(),
      );
    } catch (error) {
      if (error instanceof SubmissionUncertain)
        await persistSurfaceExchange(
          this.#db,
          intent.task,
          this.owner,
          {
            error,
            paid: true,
            uncertain: true,
            chargeMicrousd: error.submission?.chargeMicrousd,
            delaySeconds: c.poll_interval_seconds,
          },
          this.#now(),
        );
      else {
        const safe = error instanceof ProviderError ? error : new ProviderError('client_error');
        await this.#failSurface(intent.task, context, 'provider_error', true, safe, true);
        if (safe.code === 'rate_limit') throw safe;
      }
    }
  }
  async #reconcile(context: ExecutionContext, client: ReturnType<typeof createDataforseoClient>) {
    const task = context.task,
      engine = task.logical_engine as SearchEngine,
      c = searchPolicy.constants,
      at = this.#now();
    if (engine === 'google_ai_overview' && task.provider_poll_count >= c.poll_ceiling) {
      await this.#failSurface(task, context, 'submission_unreconciled', false);
      return;
    }
    const saved = reconciliationState.safeParse(record(task.provider_metadata).reconciliation).data;
    const upper = saved?.upper
      ? new Date(saved.upper)
      : new Date(at.getTime() - c.reconcile_window_lag_seconds * 1000);
    const from = new Date(
      (
        task.provider_task_submitted_at ??
        new Date(upper.getTime() - c.reconcile_window_hours * 3600000)
      ).getTime() -
        c.reconcile_window_lag_seconds * 1000,
    );
    try {
      const page = await client.reconcilePage(engine, from, upper, saved?.offset ?? 0);
      const result = reconcilePage(
        page,
        engine,
        task.provider_submission_ref,
        saved ?? { offset: 0, matches: {}, upper: upper.toISOString() },
      );
      if (result.ambiguous) {
        await this.#failSurface(task, context, 'submission_unreconciled', true);
        return;
      }
      await persistSurfaceExchange(
        this.#db,
        task,
        this.owner,
        {
          reconciliation: result.state,
          poll: !result.match,
          resetPoll: Boolean(result.match),
          taskId: result.match?.id,
          chargeMicrousd: result.match?.chargeMicrousd,
          uncertain: !result.match,
          delaySeconds: result.match ? c.first_poll_delay_seconds : c.poll_interval_seconds,
        },
        at,
      );
    } catch (error) {
      const safe =
        error instanceof ProviderError
          ? error
          : new ProviderError('reconciliation_unavailable', true);
      if (safe.code === 'auth_failure') await this.#pauseAuth(context);
      await persistSurfaceExchange(
        this.#db,
        task,
        this.owner,
        { error: safe, poll: true, uncertain: true, delaySeconds: c.poll_interval_seconds },
        at,
      );
      if (safe.code === 'rate_limit') throw safe;
    }
  }
  #pauseAuth(context: ExecutionContext) {
    return this.#db.transaction().execute(async (trx) => {
      if (await ownedAuditTask(trx, context.task, this.owner))
        await pauseExecutionCredential(trx, context, this.#runtime, this.#now());
    });
  }
  async #failSurface(
    task: AuditTask,
    context: ExecutionContext | null,
    code: string,
    actualExchange: boolean,
    error?: ProviderError,
    paidSurface = false,
  ) {
    if (error?.code === 'auth_failure' && context) await this.#pauseAuth(context);
    if (task.logical_engine === 'google_ai_overview') {
      const result =
        code === 'provider_error'
          ? {
              ...surfaceFailure('submission_unreconciled'),
              outcome: 'provider_error',
              error_code: error?.code ?? code,
            }
          : surfaceFailure(code);
      await persistOverview(
        this.#db,
        task,
        this.owner,
        result,
        this.#runtime,
        this.#now(),
        actualExchange,
        paidSurface,
      );
    } else
      await persistExecutionFailure(
        this.#db,
        task,
        this.owner,
        error ?? new ProviderError(code),
        this.#runtime,
        {
          surface: true,
          paidSurface,
          recordAttempt: actualExchange,
          scraperFailure: { outcome: code },
          ...(context ? { context } : {}),
          at: this.#now(),
        },
      );
  }
}
