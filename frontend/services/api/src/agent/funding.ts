/** Adapter orchestration; entitlement resolution, rates and ledger remain owned elsewhere. */
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { accountState } from '../entitlements/state.ts';
import { reserveUsage, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import { agentCreditRate, chargeCredits } from '../billing/ai-credits.ts';
import { enforceWorkspaceRequest } from '../abuse/usage.ts';
import { AppRouteUnavailable, resolveAppRoute } from '../providers/app-models.ts';
import { agentSettings } from './config.ts';
import { AgentError, type Run, type Scope } from './contracts.ts';
import type { Admission, FundingIdentity } from './store.ts';
import type { Funding } from './model-calls.ts';
import type { GatewaySettings } from '../models/gateway.ts';

type Settings = ReturnType<typeof agentSettings>;
async function rateFor(db: Database, model: string) {
  try {
    return await agentCreditRate(db, model);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503)
      throw new AgentError('funding_unavailable');
    throw error;
  }
}
async function account(db: Database, workspaceId: string) {
  const row = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!row) throw new AgentError('funding_unavailable');
  return row.id;
}
async function capability(db: Database, workspaceId: string) {
  const id = await account(db, workspaceId);
  const state = await accountState(db, workspaceId, id, new Date());
  if (state.error || (state.values.get('agent') ?? 0) < 1)
    throw new AgentError('capability_unavailable');
  return id;
}
async function development(db: Database, userId: string | null, settings: Settings) {
  if (!userId || !settings.devEmail || !settings.devPasswordConfigured) return false;
  const user = await db
    .selectFrom('users')
    .select(['email', 'role', 'is_active'])
    .where('id', '=', userId)
    .executeTakeFirst();
  return (
    !!user?.is_active &&
    user.role === 'admin' &&
    user.email.trim().toLowerCase() === settings.devEmail
  );
}
async function customerRoute(db: Database, workspaceId: string) {
  try {
    return await resolveAppRoute(db, workspaceId);
  } catch (error) {
    if (error instanceof AppRouteUnavailable) throw new AgentError('route_unavailable');
    throw error;
  }
}
async function identity(
  db: Database,
  scope: Scope,
  settings: Settings,
  platform: GatewaySettings,
): Promise<FundingIdentity> {
  await capability(db, scope.workspaceId);
  const route = await customerRoute(db, scope.workspaceId);
  if (route)
    return {
      funding_source: 'customer_byok',
      requested_model: route.model,
      route_id: route.routeId,
      connection_id: route.connectionId,
      credential_revision: route.credentialRevision,
      route_revision: route.routeRevision,
    };
  if (![platform.apiKey, platform.baseUrl, platform.model].every((value) => value.trim()))
    throw new AgentError('funding_unavailable');
  const unmetered = await development(db, scope.userId, settings);
  if (!unmetered && !(await rateFor(db, platform.model)).rate)
    throw new AgentError('funding_unavailable');
  return {
    funding_source: unmetered ? 'development' : 'platform',
    requested_model: platform.model,
    route_id: null,
    connection_id: null,
    credential_revision: null,
    route_revision: null,
  };
}
export function agentAdmission(settings: Settings, platform: GatewaySettings): Admission {
  return async (db, scope) => {
    const funding = await identity(db, scope, settings, platform);
    const active = await db
      .selectFrom('agent_runs')
      .select(sql<string>`count(*)`.as('count'))
      .where('workspace_id', '=', scope.workspaceId)
      .where('status', 'in', policy.task_queue.active)
      .executeTakeFirstOrThrow();
    if (Number(active.count) >= settings.activeLimit)
      throw new ApiError(429, 'Workspace active Agent limit exceeded', {
        headers: { 'retry-after': String(settings.retryAfterSeconds) },
      });
    await enforceWorkspaceRequest(db, scope.workspaceId, {
      operation: 'agent.runs',
      limit: settings.dailyLimit,
      windowSeconds: 86400,
    });
    return funding;
  };
}
async function recheck(db: Database, run: Run, settings: Settings, platform: GatewaySettings) {
  await capability(db, run.workspace_id);
  if (run.funding_source === 'customer_byok') {
    const route = await customerRoute(db, run.workspace_id);
    if (
      !route ||
      route.routeId !== run.route_id ||
      route.connectionId !== run.connection_id ||
      route.routeRevision !== run.route_revision ||
      route.credentialRevision !== run.credential_revision ||
      route.model !== run.requested_model
    )
      throw new AgentError('route_unavailable');
    return;
  }
  if (run.requested_model !== platform.model) throw new AgentError('model_changed');
  if (!platform.apiKey || !platform.baseUrl) throw new AgentError('funding_unavailable');
  if (run.funding_source === 'development' && !(await development(db, run.user_id, settings)))
    throw new AgentError('funding_unavailable');
}
export function agentFunding(settings: Settings, platform: GatewaySettings): Funding {
  return {
    reserve: async (db, run, dispatchId) => {
      await recheck(db, run, settings, platform);
      if (run.funding_source !== 'platform')
        return { reservationId: null, credits: 0, pricingRevision: '' };
      const { revision, rate } = await rateFor(db, run.requested_model);
      if (!rate) throw new AgentError('funding_unavailable');
      let reservationId: string;
      try {
        reservationId = await reserveUsage(db, {
          accountId: await account(db, run.workspace_id),
          capability: 'ai_credits',
          subject: { kind: 'agent', id: run.id, workspaceId: run.workspace_id },
          units: rate.call_credit_cap,
          key: `agent:${dispatchId}:hold`,
          at: new Date(),
        });
      } catch (error) {
        if (
          error instanceof LedgerError &&
          [
            'funded_credits_exhausted',
            'entitlement_unresolved',
            'capability_not_consumable',
          ].includes(error.message)
        )
          throw new AgentError('funding_unavailable');
        throw error;
      }
      return { reservationId, credits: rate.call_credit_cap, pricingRevision: revision };
    },
    settle: async (db, attempt, result) => {
      if (attempt.funding_source !== 'platform') return { credits: 0, status: 'zero_debit' };
      if (!attempt.reservation_id) throw new AgentError('funding_unavailable');
      // Missing historical terms close against the exact dispatch hold; never today’s policy.
      const saved = await db
        .selectFrom('billing_catalog_revisions')
        .select('id')
        .where('revision', '=', attempt.pricing_revision)
        .executeTakeFirst();
      const rate = saved
        ? (await agentCreditRate(db, attempt.requested_model, attempt.pricing_revision)).rate
        : null;
      const charged = rate && result ? chargeCredits(rate, result.usage) : null;
      const credits = Math.min(
        Number(attempt.reserved_credits),
        charged ?? rate?.unknown_usage_charge ?? Number(attempt.reserved_credits),
      );
      const accountId = await account(db, attempt.workspace_id);
      const key = `agent:${attempt.id}:settle:${attempt.dispatch_id}`;
      const at = new Date();
      if (credits)
        await debitUsage(db, {
          workspaceId: attempt.workspace_id,
          accountId,
          reservationId: attempt.reservation_id,
          subjectId: attempt.run_id,
          attempt: attempt.run_attempt,
          units: credits,
          key,
          dispatchKey: attempt.dispatch_id,
          at,
        });
      await releaseUsage(db, {
        workspaceId: attempt.workspace_id,
        accountId,
        reservationId: attempt.reservation_id,
        key: `${key}:excess`,
        at,
      });
      return { credits, status: rate ? 'settled' : 'unknown_policy' };
    },
  };
}
