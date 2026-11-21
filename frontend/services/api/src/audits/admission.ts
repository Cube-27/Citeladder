import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { capacityLock } from '../entitlements/ledger.ts';
import { spendBudget } from '../abuse/usage.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { accountState } from '../entitlements/state.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import type { FrozenRoute, prepareAudit } from './freeze.ts';
import { auditPolicy, type AuditRuntime } from './config.ts';
import { getLogger } from '../logging.ts';
import { TASK_CAPABILITIES } from './prompt-runs.ts';

export type FrozenAudit = Awaited<ReturnType<typeof prepareAudit>>;
const unresolved = (workspaceId: string, accountId?: string) => {
  getLogger('api.entitlements').info(policy.billing.contracts.telemetry_entitlement_unresolved, {
    workspace_id: workspaceId,
    account_id: accountId ?? null,
    operation: 'audit.admission',
  });
  return new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
    code: 'entitlement_unresolved',
  });
};
const unavailableCredential = () =>
  new ApiError(403, 'No executable credential available for this task', {
    code: 'execution_credentials_unavailable',
  });

export function lockAuditEnqueue(db: Database, workspaceId: string) {
  return subjectXactLock(db, `audit-enqueue:${workspaceId}`);
}

/** Called under the workspace enqueue lock, before taking the account capacity lock. */
export async function reserveAuditCapacity(
  db: Database,
  workspaceId: string,
  slots: number,
  launchId: string | null,
  runtime: AuditRuntime,
  at: Date,
) {
  let launches = db
    .selectFrom('audits')
    .select(sql<string>`count(distinct coalesce(launch_id, id))`.as('count'))
    .where('workspace_id', '=', workspaceId)
    .where('status', 'in', auditPolicy.constants.audit_active_statuses);
  if (launchId) launches = launches.where('launch_id', 'is distinct from', launchId);
  const active = await launches.executeTakeFirstOrThrow();
  if (Number(active.count) >= runtime.activeLimit)
    throw new ApiError(429, 'Workspace active audit limit exceeded', {
      headers: { 'retry-after': String(runtime.retrySeconds) },
    });
  await spendBudget(db, runtime.dailyTasks, workspaceId, { amount: slots, at });
}

const MANUAL_RUN_WINDOW_SECONDS =
  policy.entitlements.capabilities.manual_runs_per_day.rolling_window_seconds;

export async function manualRunUsage(
  db: Database,
  accountId: string,
  { at, launchId }: { at: Date; launchId: string | null },
) {
  let launches = db
    .selectFrom('audits as a')
    .innerJoin('billing_accounts as b', 'b.workspace_id', 'a.workspace_id')
    .select((eb) => [
      sql<string>`count(distinct coalesce(a.launch_id, a.id))`.as('count'),
      eb.fn.min('a.created_at').as('oldest'),
    ])
    .where('b.id', '=', accountId)
    .where('a.trigger', '=', 'manual')
    .where('a.created_at', '>', new Date(at.getTime() - MANUAL_RUN_WINDOW_SECONDS * 1000));
  if (launchId) launches = launches.where('a.launch_id', 'is distinct from', launchId);
  const recent = await launches.executeTakeFirstOrThrow();
  return {
    used: Number(recent.count),
    resetsAt: recent.oldest
      ? new Date(recent.oldest.getTime() + MANUAL_RUN_WINDOW_SECONDS * 1000)
      : null,
  };
}

async function assertManualRunAllowance(
  db: Database,
  accountId: string,
  allowance: number,
  window: { at: Date; launchId: string | null },
) {
  const { used, resetsAt } = await manualRunUsage(db, accountId, window);
  if (used >= allowance)
    throw new ApiError(429, 'The account manual run allowance is exhausted', {
      code: 'manual_run_rate_exceeded',
      details: { allowance, used, remaining: 0, reset_at: resetsAt?.toISOString() ?? null },
    });
}
export async function admitAudit(
  db: Database,
  workspaceId: string,
  funded: boolean,
  trigger: string,
  runtime: AuditRuntime,
  { at, launchId }: { at: Date; launchId: string | null },
) {
  if (!funded && trigger !== 'manual') return null;
  const account = await db
    .selectFrom('billing_accounts')
    .select(['id', 'entitlement_lifecycle_version'])
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!account) {
    if (funded) throw unresolved(workspaceId);
    return null;
  }
  // The account lock follows the workspace lock and serializes rate and budget admission.
  await capacityLock(db, account.id);
  const state = await accountState(db, workspaceId, account.id, at);
  if (state.error) throw unresolved(workspaceId, account.id);
  if (trigger === 'manual' && state.values.has('manual_runs_per_day'))
    await assertManualRunAllowance(db, account.id, state.values.get('manual_runs_per_day')!, {
      at,
      launchId,
    });
  if (!funded) return null;
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  // Repricing appends a projection per pricing version: each execution counts its latest once.
  // The cost rows alone decide, as internal_costs does, so a deleted project's spend still counts;
  // the workspace's one account funds every platform-funded audit in it.
  const latest = db
    .selectFrom('execution_cost_projections as p')
    .select(
      sql<string>`coalesce(p.provider_reported_cost_microusd, p.projected_total_cost_microusd)`.as(
        'cost',
      ),
    )
    .where('p.workspace_id', '=', workspaceId)
    .where('p.funded_budget_period_start', '>=', month)
    .where('p.funded_budget_period_start', '<', end)
    .distinctOn('p.raw_response_artifact_id')
    .orderBy('p.raw_response_artifact_id')
    .orderBy('p.created_at', 'desc')
    .orderBy('p.id', 'desc')
    .as('latest');
  const spent = await db
    .selectFrom(latest)
    .select(sql<string>`coalesce(sum(latest.cost), 0)`.as('amount'))
    .executeTakeFirstOrThrow();
  const ceiling =
    (BigInt(runtime.fundedBudgetMinor) * BigInt(policy.costs.microusd_per_usd)) / 100n;
  if (BigInt(spent.amount) >= ceiling) {
    getLogger('api.entitlements').info(policy.billing.contracts.telemetry_funded_budget_exhausted, {
      workspace_id: workspaceId,
      account_id: account.id,
      spent_microusd: spent.amount,
      ceiling_microusd: ceiling.toString(),
    });
    throw new ApiError(403, 'The account funded monthly budget is exhausted', {
      code: 'funded_budget_exhausted',
    });
  }
  return {
    accountId: account.id,
    month,
    provenance: {
      registry_revision: policy.entitlements.registry_revision,
      entitlement_lifecycle_version: account.entitlement_lifecycle_version,
      resolved_at: at.toISOString(),
    },
  };
}
export type FundedAdmission = NonNullable<Awaited<ReturnType<typeof admitAudit>>>;

export async function platformRoute(
  db: Database,
  route: FrozenRoute,
  runtime: AuditRuntime,
  at: Date,
  devTestLogin: boolean,
  proof: {
    workspaceId: string;
    accountId: string;
    taskId: string;
    reservationId: string;
  },
) {
  if (devTestLogin && !runtime.devTestAllowPlatform) throw unavailableCredential();
  const hold = await db
    .selectFrom('consumable_ledger')
    .select('id')
    .where('workspace_id', '=', proof.workspaceId)
    .where('billing_account_id', '=', proof.accountId)
    .where('subject_kind', '=', 'audit')
    .where('subject_id', '=', proof.taskId)
    .where('reservation_id', '=', proof.reservationId)
    .where('entry_kind', '=', 'reservation')
    .where('capability_key', 'in', TASK_CAPABILITIES)
    .executeTakeFirst();
  if (!hold) throw unavailableCredential();
  const candidates = await db
    .selectFrom('provider_routes as r')
    .innerJoin('provider_connections as c', 'c.id', 'r.connection_id')
    .innerJoin('workspaces as w', 'w.id', 'c.workspace_id')
    .select(['c.id', 'c.base_url', 'c.paused_at', 'c.pause_until'])
    .where('w.is_system', '=', true)
    .whereRef('r.workspace_id', '=', 'c.workspace_id')
    .where('r.logical_engine', '=', route.logical_engine)
    .where('r.transport_provider', '=', route.transport_provider)
    .where('r.transport_model', '=', route.transport_model)
    .where('c.transport_provider', '=', route.transport_provider)
    .where('c.credential_source', '=', 'platform')
    .where('c.active', '=', true)
    .where('r.active', '=', true)
    .where('c.last_test_status', '=', 'ok')
    .where((eb) =>
      eb.or([eb('c.api_key_encrypted', '!=', ''), eb('c.platform_credential_ref', '!=', '')]),
    )
    .orderBy('r.is_default', 'desc')
    .orderBy('r.created_at')
    .orderBy('r.id')
    .execute();
  for (const candidate of candidates) {
    if (candidate.paused_at && (!candidate.pause_until || candidate.pause_until > at)) continue;
    try {
      return {
        connection_id: candidate.id,
        base_url: approvedEndpoint(route.transport_provider, candidate.base_url, runtime.providers),
      };
    } catch {}
  }
  throw unavailableCredential();
}
