import { randomUUID } from 'node:crypto';
import { reserveTrialAnswer } from './trial-answers.ts';
import { requireWorkspaceAccess } from '../entitlements/access.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { reserveUsage, releaseUsage } from '../entitlements/ledger.ts';
import { ApiError, notFound } from '../errors.ts';
import { searchPolicy } from '../search-surfaces/dataforseo.ts';
import type { Engine } from '../providers/config.ts';
import { auditSlots, prepareAudit } from './freeze.ts';
import {
  admitAudit,
  platformRoute,
  reserveAuditCapacity,
  type FrozenAudit,
  type FundedAdmission,
} from './admission.ts';
import { auditEvent, transitionAudit } from './state.ts';
import { auditPolicy, auditRuntime, type AuditRuntime } from './config.ts';
import { auditInput, type AuditInput } from './inputs.ts';

export type AuditLaunch = {
  trigger?: string;
  scheduleId?: string;
  scheduledFor?: Date;
  devTestLogin?: boolean;
};
export type AuditScope = { workspaceId: string; projectId: string };

/** A shell that commits only the complete frozen plan, queue and funding proof. */
export function createAudit(
  db: Database,
  workspaceId: string,
  request: AuditInput,
  launch: AuditLaunch = {},
  runtime: AuditRuntime = auditRuntime(),
  at = new Date(),
) {
  return inTransaction(db, (trx) =>
    createAuditInTransaction(trx, workspaceId, request, launch, runtime, at),
  );
}

/** The scheduler holds its scoped occurrence row; planner and cadence advancement share that transaction. */
export async function createAuditInTransaction(
  trx: Database,
  workspaceId: string,
  request: AuditInput,
  launch: AuditLaunch,
  runtime: AuditRuntime,
  at: Date,
) {
  const input = auditInput.parse(request);
  const access = await requireWorkspaceAccess(trx, workspaceId);
  const trigger = (launch.trigger ?? 'manual').trim().toLowerCase();
  await subjectXactLock(trx, `audit-enqueue:${workspaceId}`);
  if (launch.scheduleId) {
    if (!launch.scheduledFor || trigger !== 'scheduled')
      throw new ApiError(400, 'Scheduled launch requires its occurrence');
    const schedule = await trx
      .selectFrom('audit_schedules')
      .select('id')
      .where('id', '=', launch.scheduleId)
      .where('workspace_id', '=', workspaceId)
      .where('project_id', '=', input.project_id)
      .executeTakeFirst();
    if (!schedule) throw notFound('Audit schedule');
    const prior = await trx
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .where('project_id', '=', input.project_id)
      .where('schedule_id', '=', launch.scheduleId)
      .where('scheduled_for', '=', launch.scheduledFor)
      .executeTakeFirst();
    if (prior) return prior.id;
  } else if (launch.scheduledFor)
    throw new ApiError(400, 'Scheduled occurrence requires its schedule');
  const plan = await prepareAudit(
    trx,
    workspaceId,
    input,
    runtime.audits,
    runtime.providers,
    trigger,
    runtime.search,
    at,
  );
  const slots = auditSlots(
    plan.prompts.length,
    plan.routes.map((route) => route.logical_engine),
    plan.repetitions,
    plan.seed,
  );
  if (
    access.status === 'trial_active' &&
    (plan.repetitions !== policy.entitlements.public_trial.repetitions ||
      plan.routes.some(
        (route) => !policy.entitlements.public_trial.engines.includes(route.logical_engine),
      ))
  )
    throw new ApiError(
      403,
      'The requested engine or repetition count is outside the trial allowance',
    );
  await reserveAuditCapacity(trx, workspaceId, slots.length, runtime, at);
  const funded = await admitAudit(
    trx,
    workspaceId,
    plan,
    input.credential_mode === 'funded',
    trigger,
    runtime,
    at,
  );
  const id = randomUUID();
  await trx
    .insertInto('audits')
    .values({
      id,
      workspace_id: workspaceId,
      project_id: input.project_id,
      schedule_id: launch.scheduleId ?? null,
      scheduled_for: launch.scheduledFor ?? null,
      status: 'draft',
      trigger,
      benchmark_mode: plan.mode,
      audit_scope: input.audit_scope,
      system_instruction: plan.systemInstruction,
      repetitions: plan.repetitions,
      random_seed: plan.seed,
      configuration: JSON.stringify(plan.configuration),
      requested_count: slots.length,
      completed_count: 0,
      failed_count: 0,
      error_message: '',
      funding_account_id: funded?.accountId ?? null,
      funded_budget_period_start: funded?.month ?? null,
      funded_reserved_cost_microusd: funded?.cost ?? null,
      created_at: at,
      updated_at: at,
      started_at: null,
      completed_at: null,
      analyzer_version: '',
      summary: null,
      parent_audit_id: null,
      repair_key: null,
    })
    .execute();
  const snapshots = await persistSnapshots(trx, id, plan, at);
  const provenance = await persistTasks(
    trx,
    { workspaceId, projectId: input.project_id },
    id,
    plan,
    slots,
    snapshots,
    funded,
    runtime,
    at,
    launch.devTestLogin ?? false,
  );
  await trx
    .updateTable('audits')
    .set({ configuration: JSON.stringify({ ...plan.configuration, ...provenance }) })
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .execute();
  await transitionAudit(trx, workspaceId, id, 'validating', at, 'audit validating');
  await transitionAudit(trx, workspaceId, id, 'queued', at, 'audit queued');
  await auditEvent(
    trx,
    id,
    auditPolicy.constants.event_audit_created,
    'audit created',
    { requested_count: slots.length, engines: plan.configuration.engines },
    at,
  );
  await auditEvent(
    trx,
    id,
    auditPolicy.constants.event_audit_queued,
    'audit queued',
    { task_count: slots.length },
    at,
  );
  return id;
}

async function persistSnapshots(db: Database, auditId: string, plan: FrozenAudit, at: Date) {
  const prompts = plan.prompts.map((prompt, index) => ({
    id: randomUUID(),
    audit_id: auditId,
    prompt_id: prompt.id,
    prompt_index: index,
    text: prompt.text,
    theme: prompt.theme,
    intent: prompt.intent,
    buyer_stage: prompt.buyer_stage,
    prompt_intent: prompt.prompt_intent,
    cohort: prompt.cohort,
    generation_evidence: JSON.stringify(prompt.generation_evidence),
    created_at: at,
  }));
  const engines = plan.routes.map((route) => ({
    id: randomUUID(),
    audit_id: auditId,
    ...route,
    created_at: at,
  }));
  await db.insertInto('audit_prompt_snapshots').values(prompts).execute();
  await db.insertInto('audit_engine_snapshots').values(engines).execute();
  return { prompts, engines: new Map(engines.map((row) => [row.logical_engine, row])) };
}
function frozenSearch(plan: FrozenAudit, engine: Engine) {
  if (!['google_ai_overview', 'chatgpt_search', 'gemini_consumer'].includes(engine)) return null;
  const scraper = engine === 'chatgpt_search' || engine === 'gemini_consumer';
  return {
    timeout_seconds: plan.searchTimeoutSeconds,
    location_code: plan.project.serp_location_code,
    language_code: plan.project.serp_language_code || searchPolicy.constants.default_language_code,
    device: plan.project.serp_device || searchPolicy.constants.default_device,
    ...(scraper
      ? {
          provider_product: searchPolicy.scraper.products[engine],
          request_settings: searchPolicy.scraper.request_settings[engine],
          recovery_deadline_hours: plan.recoveryDeadlineHours,
        }
      : {}),
  };
}
async function persistTasks(
  db: Database,
  scope: AuditScope,
  auditId: string,
  plan: FrozenAudit,
  slots: ReturnType<typeof auditSlots>,
  snapshots: Awaited<ReturnType<typeof persistSnapshots>>,
  funded: FundedAdmission | null,
  runtime: AuditRuntime,
  at: Date,
  devTestLogin: boolean,
) {
  const taskCredentials: Record<string, unknown> = {},
    taskReservations: Record<string, string> = {};
  const engineRoutes = { ...plan.configuration.engine_routes };
  for (const [position, slot] of slots.entries()) {
    const route = plan.routes.find((row) => row.logical_engine === slot.engine)!;
    const prompt = snapshots.prompts[slot.prompt]!,
      engine = snapshots.engines.get(slot.engine)!;
    const taskId = randomUUID();
    await db
      .insertInto('audit_tasks')
      .values({
        id: taskId,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        audit_id: auditId,
        prompt_snapshot_id: prompt.id,
        engine_snapshot_id: engine.id,
        prompt_index: slot.prompt,
        repetition: slot.repetition,
        randomized_position: position,
        logical_engine: slot.engine,
        transport_provider: route.transport_provider,
        transport_model: route.transport_model,
        prompt_text: prompt.text,
        idempotency_key: `${auditId}:${slot.prompt}:${slot.repetition}:${slot.engine}`,
        max_attempts: plan.measurement.max_attempts,
        status: 'pending_reservation',
        available_at: at,
        priority: 0,
        attempt_count: 0,
        completed_at: null,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        answer_text: '',
        error_code: '',
        error_detail: '',
        latency_ms: null,
        provider_metadata: null,
        search_used: false,
        search_events: null,
        citations: null,
        request_snapshot: JSON.stringify({
          ...frozenSearch(plan, slot.engine),
          original_prompt_id: plan.prompts[slot.prompt]!.id,
        }),
        provider_route_snapshot: null,
        provider_submission_ref: '',
        provider_task_id: '',
        provider_task_submitted_at: null,
        provider_poll_count: 0,
        provider_connection_id: null,
        provider_credential_revision: null,
        finish_reason: 'unknown',
        raw_finish_reason: null,
        result_artifact_id: null,
        score: null,
        source_task_id: null,
        created_at: at,
        updated_at: at,
      })
      .execute();
    const binding = await bindTask(
      db,
      scope,
      auditId,
      taskId,
      route,
      funded,
      runtime,
      at,
      devTestLogin,
      plan,
    );
    await reserveTrialAnswer(
      db,
      scope.workspaceId,
      auditId,
      taskId,
      plan.prompts[slot.prompt]!.id,
      at,
    );
    await db
      .updateTable('audit_tasks')
      .set({ status: 'queued', provider_route_snapshot: JSON.stringify(binding) })
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', taskId)
      .execute();
    await db
      .updateTable('audit_engine_snapshots')
      .set({ connection_id: binding.connection_id, base_url: binding.base_url })
      .where('id', '=', engine.id)
      .where('audit_id', '=', auditId)
      .execute();
    taskCredentials[taskId] = {
      credential_source: binding.credential_source,
      connection_id: binding.connection_id,
      reservation_id: binding.reservation_id,
    };
    if (binding.reservation_id) taskReservations[taskId] = binding.reservation_id;
    engineRoutes[slot.engine] = {
      ...route,
      ...auditPolicy.route_policies[slot.engine],
      connection_id: binding.connection_id,
      base_url: binding.base_url,
      ...{ credential_source: binding.credential_source },
    };
  }
  if (funded && funded.cost > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Funded cost exceeds JSON integer precision');
  return {
    engine_routes: engineRoutes,
    task_credentials: taskCredentials,
    ...(funded
      ? {
          task_reservations: taskReservations,
          funding: {
            credential_mode: 'funded',
            capability_key: 'audit_credits',
            funding_account_id: funded.accountId,
            admission_at: at.toISOString(),
            budget_period_start: funded.month.toISOString(),
            reserved_cost_microusd: Number(funded.cost),
            entitlement: funded.provenance,
          },
        }
      : {}),
  };
}

async function bindTask(
  db: Database,
  scope: AuditScope,
  auditId: string,
  taskId: string,
  route: FrozenAudit['routes'][number],
  funded: FundedAdmission | null,
  runtime: AuditRuntime,
  at: Date,
  devTestLogin: boolean,
  plan: FrozenAudit,
) {
  let reservationId: string | null = null;
  if (funded) {
    try {
      reservationId = await reserveUsage(db, {
        accountId: funded.accountId,
        capability: 'audit_credits',
        subject: { kind: 'audit', id: taskId, workspaceId: scope.workspaceId, auditId },
        units: plan.measurement.max_attempts,
        key: `${auditId}:${taskId}:funded-reserve`,
        at,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'funded_credits_exhausted')
        throw new ApiError(403, 'Funded credits are exhausted', {
          code: 'funded_credits_exhausted',
        });
      throw error;
    }
  }
  const byok = route.connection_id !== null;
  const connection = byok
    ? { connection_id: route.connection_id!, base_url: route.base_url }
    : funded && reservationId
      ? await platformRoute(db, route, runtime, at, devTestLogin, {
          workspaceId: scope.workspaceId,
          accountId: funded.accountId,
          taskId,
          reservationId,
        })
      : null;
  if (!connection)
    throw new ApiError(403, 'No executable credential available for this task', {
      code: 'execution_credentials_unavailable',
    });
  if (byok && funded && reservationId) {
    await releaseUsage(db, {
      workspaceId: scope.workspaceId,
      accountId: funded.accountId,
      reservationId,
      key: `${auditId}:${taskId}:byok-release`,
      at,
    });
    reservationId = null;
  }
  const allocations = reservationId
    ? await db
        .selectFrom('consumable_ledger')
        .select(['grant_id', 'units'])
        .where('workspace_id', '=', scope.workspaceId)
        .where('billing_account_id', '=', funded!.accountId)
        .where('reservation_id', '=', reservationId)
        .where('entry_kind', '=', 'reservation')
        .orderBy('allocation_order')
        .execute()
    : [];
  return {
    ...route,
    ...connection,
    credential_source: byok ? 'byok' : 'platform',
    reservation_id: reservationId,
    ...auditPolicy.route_policies[route.logical_engine],
    ...plan.measurement,
    ...(reservationId && funded
      ? {
          funding: {
            credential_mode: 'funded',
            capability_key: 'audit_credits',
            funding_account_id: funded.accountId,
            reservation_id: reservationId,
            reserved_units: plan.measurement.max_attempts,
            grant_allocations: allocations,
            entitlement: funded.provenance,
          },
        }
      : {}),
  };
}
