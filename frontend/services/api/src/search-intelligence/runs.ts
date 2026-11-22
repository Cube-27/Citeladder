import { asApiErrorCode, type ApiErrorCode } from '@citeladder/contracts/error-codes';

import { policy } from '../config.ts';
import { holdProviderCredits } from '../billing/metering.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { jsonObjects } from '../db/json.ts';
import { ApiError, notFound } from '../errors.ts';
import { enqueueTask, taskKey } from '../queue/enqueue.ts';
import type { Preferences } from '../routes/search-intelligence-contracts.ts';
import type { Scope } from './reads.ts';
import { closeCollecting } from './acquisition-state.ts';
import { settleResearchCharge } from './charges.ts';
import { runConnection } from './credentials.ts';
import { runView } from './views.ts';

const si = policy.search_intelligence;
const { statuses: taskStatuses, terminal: TERMINAL_TASK_STATUSES } = policy.task_queue;

const RUN_REVIEWED = 'reviewed';
const RUN_QUEUED = 'queued';
const RUN_SUCCEEDED = 'succeeded';
const RUN_CANCELLED = 'cancelled';
const ACTIVE_RUN_STATUSES = [RUN_QUEUED, 'running'];
const FINISHED_RUN_STATUSES = new Set([
  RUN_SUCCEEDED,
  'failed',
  RUN_CANCELLED,
  'partial',
  'uncertain',
]);

const conflict = (code: ApiErrorCode, message: string) => new ApiError(409, message, { code });

function lockRun(trx: Database, scope: Scope, runId: string) {
  return scope.workspace
    .selectFrom(trx, 'search_intelligence_runs')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('id', '=', runId)
    .forUpdate()
    .executeTakeFirst();
}

type LockedRun = NonNullable<Awaited<ReturnType<typeof lockRun>>>;

async function assertConfirmable(trx: Database, scope: Scope, run: LockedRun, now: Date) {
  if (run.status !== RUN_REVIEWED)
    throw conflict(asApiErrorCode('review_not_confirmable'), 'Review is no longer confirmable');
  if (run.expires_at <= now)
    throw conflict(asApiErrorCode('review_expired'), 'Review expired; create a new cost review');
  if (run.pricing_version !== si.price_version)
    throw conflict(asApiErrorCode('pricing_changed'), 'Pricing changed; create a new cost review');
  if (!(await runConnection(trx, run)))
    throw conflict(
      asApiErrorCode('connection_changed'),
      'DataForSEO connection changed; create a new review',
    );
  const active = await scope.workspace
    .selectFrom(trx, 'search_intelligence_runs')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .where('id', '!=', run.id)
    .where('status', 'in', ACTIVE_RUN_STATUSES)
    .executeTakeFirst();
  if (active !== undefined)
    throw conflict(
      asApiErrorCode('acquisition_in_progress'),
      'Another Keyword research analysis is already active',
    );
}

async function holdCredits(trx: Database, run: LockedRun) {
  if (run.credential_source !== 'platform' || !run.estimated_credits) return null;
  return holdProviderCredits(
    trx,
    { workspaceId: run.workspace_id, feature: 'search_intelligence' },
    { provider: 'dataforseo', model: si.transport_provider },
    run.estimated_credits,
  );
}

async function enqueueAcquisition(trx: Database, scope: Scope, runId: string): Promise<string> {
  const created = await enqueueTask(trx, {
    workspaceId: scope.workspace.workspaceId,
    projectId: scope.projectId,
    kind: si.task_kind,
    payload: { run_id: runId },
    keyParts: [runId],
  });
  if (created !== null) return created;
  const existing = await scope.workspace
    .selectFrom(trx, 'analytics_tasks')
    .select('id')
    .where('idempotency_key', '=', taskKey(si.task_kind, [runId]))
    .executeTakeFirstOrThrow();
  return existing.id;
}

export function confirmRun(db: Database, scope: Scope, runId: string) {
  return inTransaction(db, async (trx) => {
    await scope.workspace
      .selectFrom(trx, 'projects')
      .select('id')
      .where('id', '=', scope.projectId)
      .forNoKeyUpdate()
      .execute();
    const run = await lockRun(trx, scope, runId);
    if (run === undefined) throw notFound('Run');
    if (run.confirmed_at !== null) return runView(run);
    const now = new Date();
    await assertConfirmable(trx, scope, run, now);
    const plan = jsonObjects(run.call_plan, 'search_intelligence_runs.call_plan');
    const transition =
      plan.length === 0
        ? { status: RUN_SUCCEEDED, completed_at: now }
        : {
            status: RUN_QUEUED,
            platform_call_id: await holdCredits(trx, run),
            analytics_task_id: await enqueueAcquisition(trx, scope, run.id),
          };
    const confirmed = await trx
      .updateTable('search_intelligence_runs')
      .set({ ...transition, confirmed_at: now, updated_at: now })
      .where('id', '=', run.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return runView(confirmed);
  });
}

export async function cancelRun(db: Database, scope: Scope, runId: string) {
  const view = await inTransaction(db, async (trx) => {
    const run = await lockRun(trx, scope, runId);
    if (run === undefined) throw notFound('Run');
    if (FINISHED_RUN_STATUSES.has(run.status)) return runView(run);
    const now = new Date();
    const cancelled = await trx
      .updateTable('search_intelligence_runs')
      .set({ status: RUN_CANCELLED, cancelled_at: now, updated_at: now })
      .where('id', '=', run.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (run.analytics_task_id !== null) {
      await trx
        .updateTable('analytics_tasks')
        .set({ status: taskStatuses.cancelled, completed_at: now, updated_at: now })
        .where('id', '=', run.analytics_task_id)
        .where('workspace_id', '=', scope.workspace.workspaceId)
        .where('status', 'not in', TERMINAL_TASK_STATUSES)
        .execute();
    }
    await closeCollecting(
      trx,
      { workspaceId: run.workspace_id, projectId: run.project_id, runId },
      now,
    );
    return runView(cancelled);
  });
  if (view.credential_mode !== 'funded') return view;
  const settled = await settleResearchCharge(db, {
    workspaceId: scope.workspace.workspaceId,
    runId,
  });
  return settled ? runView(settled) : view;
}

export async function savePreferences(db: Database, scope: Scope, preferences: Preferences) {
  const updated = await db
    .updateTable('projects')
    .set({ search_intelligence_preferences: JSON.stringify(preferences), updated_at: new Date() })
    .where('id', '=', scope.projectId)
    .where('workspace_id', '=', scope.workspace.workspaceId)
    .executeTakeFirst();
  if (updated.numUpdatedRows === 0n) throw notFound('Project');
  return preferences;
}
