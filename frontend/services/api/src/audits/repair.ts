import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { auditRepairRequestSchema } from '@citeladder/contracts/audit-requests';
import type { Selectable } from 'kysely';
import type { z } from 'zod';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { ApiError, notFound } from '../errors.ts';
import type { AuditPromptSnapshots, Audits, AuditTasks } from '../generated/db-schema.ts';
import { auditPolicy, type AuditRuntime } from './config.ts';
import { lockAuditEnqueue, reserveAuditCapacity } from './admission.ts';
import { auditEvent, transitionAudit } from './state.ts';
import { compareText } from '../text-order.ts';
import { requireWorkspaceAccess } from '../entitlements/access.ts';
import { reservePromptRuns } from './prompt-runs.ts';

export const repairInput = auditRepairRequestSchema;
const denied = (message: string) => new ApiError(409, message);
type RepairTask = Selectable<AuditTasks>;
type RepairScope = { workspaceId: string; auditId: string };
type Repair = { id: string; key: string; tasks: RepairTask[]; at: Date };
/** The terminal parent audit, locked for the repair. */
async function lockedRepairParent(trx: Database, { workspaceId, auditId }: RepairScope) {
  const parent = await trx
    .selectFrom('audits')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', auditId)
    .forUpdate()
    .executeTakeFirst();
  if (!parent) throw notFound('Audit');
  if (!auditPolicy.constants.audit_terminal_statuses.includes(parent.status))
    throw denied('Only a terminal audit can be repaired');
  return parent;
}
/** The parent's prompt snapshots and the failed BYOK tasks the request selects. */
async function selectedRepairTasks(
  trx: Database,
  {
    workspaceId,
    auditId,
    parent,
    request,
  }: RepairScope & { parent: Selectable<Audits>; request: z.output<typeof repairInput> },
) {
  const prompts = await trx
    .selectFrom('audit_prompt_snapshots')
    .selectAll()
    .where('audit_id', '=', parent.id)
    .execute();
  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const selectedIds = new Set(request.task_ids ?? []);
  const rows = await trx
    .selectFrom('audit_tasks')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('audit_id', '=', auditId)
    .where('status', '=', 'failed')
    .orderBy('randomized_position')
    .execute();
  let tasks = rows.filter(
    (task) =>
      (!request.provider || task.transport_provider === request.provider) &&
      (!request.engine || task.logical_engine === request.engine) &&
      (!selectedIds.size || selectedIds.has(task.id)) &&
      (!request.prompt_id ||
        promptMap.get(task.prompt_snapshot_id)?.prompt_id === request.prompt_id),
  );
  if (
    selectedIds.size &&
    (selectedIds.size !== tasks.length || tasks.some((task) => !selectedIds.has(task.id)))
  )
    throw denied('task_ids must identify failed tasks in this audit');
  if (!selectedIds.size)
    tasks = tasks.filter(
      (task) => record(task.provider_route_snapshot).credential_source === 'byok',
    );
  if (!tasks.length) throw denied('No failed tasks match the repair filters');
  if (tasks.some((task) => record(task.provider_route_snapshot).credential_source !== 'byok'))
    throw denied('Funded audit failures require a new admitted audit; repair supports BYOK tasks');
  return { prompts, tasks };
}
function repairKey(tasks: RepairTask[]) {
  return createHash('sha256')
    .update(
      tasks
        .map((task) => task.id)
        .sort(compareText)
        .join('|'),
    )
    .digest('hex');
}
async function rejectOverlappingRepair(
  trx: Database,
  { workspaceId, auditId, tasks }: RepairScope & { tasks: RepairTask[] },
) {
  const overlapping = await trx
    .selectFrom('audit_tasks as t')
    .innerJoin('audits as a', 'a.id', 't.audit_id')
    .select('t.id')
    .where('a.workspace_id', '=', workspaceId)
    .where('a.parent_audit_id', '=', auditId)
    .where('a.status', 'not in', auditPolicy.constants.audit_terminal_statuses)
    .where(
      't.source_task_id',
      'in',
      tasks.map((task) => task.id),
    )
    .executeTakeFirst();
  if (overlapping) throw denied('A running repair already covers a selected task');
}
async function insertRepairAudit(
  trx: Database,
  {
    workspaceId,
    parent,
    repair,
  }: { workspaceId: string; parent: Selectable<Audits>; repair: Repair },
) {
  const { id, key, tasks, at } = repair;
  await trx
    .insertInto('audits')
    .values({
      id,
      workspace_id: workspaceId,
      project_id: parent.project_id,
      parent_audit_id: parent.id,
      repair_key: key,
      schedule_id: null,
      scheduled_for: null,
      status: 'draft',
      trigger: 'repair',
      benchmark_mode: parent.benchmark_mode,
      audit_scope: parent.audit_scope,
      system_instruction: parent.system_instruction,
      repetitions: parent.repetitions,
      random_seed: randomBytes(8).readBigUInt64BE().toString(),
      requested_count: tasks.length,
      completed_count: 0,
      failed_count: 0,
      configuration: JSON.stringify({
        ...record(parent.configuration),
        repair_parent_audit_id: parent.id,
        repair_source_task_ids: tasks.map((task) => task.id),
      }),
      error_message: '',
      analyzer_version: '',
      summary: null,
      funding_account_id: null,
      funded_budget_period_start: null,
      created_at: at,
      updated_at: at,
      started_at: null,
      completed_at: null,
    })
    .execute();
}
/** Clone the snapshots the repaired tasks use; returns parent snapshot id -> clone id. */
async function cloneRepairSnapshots(
  trx: Database,
  {
    parentId,
    prompts,
    repair,
  }: { parentId: string; prompts: Selectable<AuditPromptSnapshots>[]; repair: Repair },
) {
  const { id, tasks, at } = repair;
  const clones = new Map<string, string>();
  const promptClones = prompts
    .filter((prompt) => tasks.some((task) => task.prompt_snapshot_id === prompt.id))
    .map((prompt) => {
      const cloneId = randomUUID();
      clones.set(prompt.id, cloneId);
      return {
        ...prompt,
        id: cloneId,
        audit_id: id,
        created_at: at,
        generation_evidence:
          prompt.generation_evidence === null ? null : JSON.stringify(prompt.generation_evidence),
      };
    });
  await trx.insertInto('audit_prompt_snapshots').values(promptClones).execute();
  const engines = await trx
    .selectFrom('audit_engine_snapshots')
    .selectAll()
    .where('audit_id', '=', parentId)
    .execute();
  const engineClones = new Map<string, string>();
  const clonedEngines = engines
    .filter((engine) => tasks.some((task) => task.engine_snapshot_id === engine.id))
    .map((engine) => {
      const cloneId = randomUUID();
      engineClones.set(engine.id, cloneId);
      return { ...engine, id: cloneId, audit_id: id, created_at: at };
    });
  await trx.insertInto('audit_engine_snapshots').values(clonedEngines).execute();
  return { clones, engineClones };
}
async function insertRepairTasks(
  trx: Database,
  {
    snapshots,
    repair,
  }: {
    snapshots: Awaited<ReturnType<typeof cloneRepairSnapshots>>;
    repair: Repair;
  },
) {
  const { clones, engineClones } = snapshots;
  const { id, tasks, at } = repair;
  return trx
    .insertInto('audit_tasks')
    .values(
      tasks.map((task, position) => ({
        ...task,
        id: randomUUID(),
        audit_id: id,
        source_task_id: task.id,
        prompt_snapshot_id: clones.get(task.prompt_snapshot_id)!,
        engine_snapshot_id: engineClones.get(task.engine_snapshot_id)!,
        randomized_position: position,
        idempotency_key: `${id}:${task.prompt_index}:${task.repetition}:${task.logical_engine}`,
        provider_route_snapshot: JSON.stringify(task.provider_route_snapshot),
        request_snapshot: JSON.stringify(task.request_snapshot),
        status: 'queued',
        available_at: at,
        priority: 0,
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        completed_at: null,
        created_at: at,
        updated_at: at,
        answer_text: '',
        error_code: '',
        error_detail: '',
        latency_ms: null,
        provider_metadata: null,
        search_used: false,
        search_events: null,
        citations: null,
        score: null,
        result_artifact_id: null,
        provider_task_id: '',
        provider_submission_ref: '',
        provider_task_submitted_at: null,
        provider_poll_count: 0,
        provider_connection_id: null,
        provider_credential_revision: null,
        finish_reason: 'unknown',
        raw_finish_reason: null,
      })),
    )
    .returningAll()
    .execute();
}
/** Reserve the repaired tasks' prompt runs, then queue the repair and record it. */
async function queueRepairAudit(
  trx: Database,
  {
    workspaceId,
    repaired,
    repair,
  }: { workspaceId: string; repaired: RepairTask[]; repair: Repair },
) {
  const { id, tasks, at } = repair;
  await reservePromptRuns(trx, {
    workspaceId,
    auditId: id,
    taskIds: repaired.map((task) => task.id),
    at,
  });
  await transitionAudit(trx, workspaceId, id, 'validating', at, 'repair audit validating');
  await transitionAudit(trx, workspaceId, id, 'queued', at, 'repair audit queued');
  await auditEvent(
    trx,
    { workspaceId, auditId: id },
    auditPolicy.constants.event_audit_created,
    'repair audit created',
    {
      requested_count: tasks.length,
      engines: [...new Set(tasks.map((task) => task.logical_engine))].sort(compareText),
    },
    at,
  );
  await auditEvent(
    trx,
    { workspaceId, auditId: id },
    auditPolicy.constants.event_audit_queued,
    'repair audit queued',
    { task_count: tasks.length },
    at,
  );
}
/** A repair is an immutable BYOK child of selected failed frozen slots, never a replay of paid dispatch. */
export function createRepairAudit(
  db: Database,
  workspaceId: string,
  auditId: string,
  request: z.output<typeof repairInput>,
  runtime: AuditRuntime,
  at = new Date(),
) {
  return db.transaction().execute(async (trx) => {
    await requireWorkspaceAccess(trx, workspaceId);
    // The same enqueue lock as a launch, taken before any audit row lock.
    await lockAuditEnqueue(trx, workspaceId);
    const parent = await lockedRepairParent(trx, { workspaceId, auditId });
    const { prompts, tasks } = await selectedRepairTasks(trx, {
      workspaceId,
      auditId,
      parent,
      request,
    });
    const key = repairKey(tasks);
    const existing = await trx
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .where('parent_audit_id', '=', auditId)
      .where('repair_key', '=', key)
      .executeTakeFirst();
    if (existing) return { auditId: existing.id, created: false };
    await rejectOverlappingRepair(trx, { workspaceId, auditId, tasks });
    // Abuse controls only (active launches, daily task budget); a repair is not a manual run.
    await reserveAuditCapacity(trx, workspaceId, tasks.length, null, runtime, at);
    const repair = { id: randomUUID(), key, tasks, at };
    await insertRepairAudit(trx, { workspaceId, parent, repair });
    const snapshots = await cloneRepairSnapshots(trx, { parentId: parent.id, prompts, repair });
    const repaired = await insertRepairTasks(trx, { snapshots, repair });
    await queueRepairAudit(trx, { workspaceId, repaired, repair });
    return { auditId: repair.id, created: true };
  });
}
