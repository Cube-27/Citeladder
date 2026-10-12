/**
 * Agent funding: the Agent always uses the platform gateway and spends AI
 * credits (B19). Each dispatch holds its maximum cost at the shared token
 * prices and settles once to the reported tokens; the ledger and the pricing
 * are the same ones every other platform AI call uses (B12-B15).
 */
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { accountState } from '../entitlements/state.ts';
import { reserveUsage, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import {
  PRICING_REVISION,
  cachedReservationCredits,
  chargeCredits,
  modelPrice,
  unknownUsageCredits,
} from '../billing/ai-pricing.ts';
import { conversationInputBytes } from '../models/conversation.ts';
import { enforceWorkspaceRequest } from '../abuse/usage.ts';
import { agentSettings } from './config.ts';
import { AgentError, type Run, type Scope } from './contracts.ts';
import type { Admission, FundingIdentity } from './store.ts';
import type { Funding } from './model-calls.ts';
import type { GatewaySettings } from '../models/gateway.ts';

type Settings = ReturnType<typeof agentSettings>;

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
function configured(platform: GatewaySettings) {
  return [platform.apiKey, platform.baseUrl, platform.model].every((value) => value.trim());
}
async function identity(
  db: Database,
  scope: Scope,
  settings: Settings,
  platform: GatewaySettings,
): Promise<FundingIdentity> {
  await capability(db, scope.workspaceId);
  if (!configured(platform)) throw new AgentError('funding_unavailable');
  const unmetered = await development(db, scope.userId, settings);
  return {
    funding_source: unmetered ? 'development' : 'platform',
    requested_model: platform.model,
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
      windowSeconds: settings.dailyWindowSeconds,
    });
    return funding;
  };
}
async function recheck(db: Database, run: Run, settings: Settings, platform: GatewaySettings) {
  await capability(db, run.workspace_id);
  if (run.requested_model !== platform.model) throw new AgentError('model_changed');
  if (!platform.apiKey || !platform.baseUrl) throw new AgentError('funding_unavailable');
  if (run.funding_source === 'development' && !(await development(db, run.user_id, settings)))
    throw new AgentError('funding_unavailable');
}
export function agentFunding(settings: Settings, platform: GatewaySettings): Funding {
  return {
    reserve: async (db, run, dispatchId, _model, request) => {
      await recheck(db, run, settings, platform);
      if (run.funding_source !== 'platform')
        return { reservationId: null, credits: 0, pricingRevision: '' };
      const price = modelPrice(run.requested_model, platform.model);
      if (!price) throw new AgentError('funding_unavailable');
      const credits = cachedReservationCredits(
        price,
        conversationInputBytes(request),
        platform.maxOutputTokens,
      );
      try {
        const reservationId = await reserveUsage(db, {
          accountId: await account(db, run.workspace_id),
          capability: policy.entitlements.ai_credits,
          subject: { kind: 'agent', id: run.id, workspaceId: run.workspace_id },
          units: credits,
          key: `agent:${dispatchId}:hold`,
          at: new Date(),
        });
        return { reservationId, credits, pricingRevision: PRICING_REVISION };
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
    },
    settle: async (db, attempt, result) => {
      if (attempt.funding_source !== 'platform') return { credits: 0, status: 'zero_debit' };
      if (!attempt.reservation_id) throw new AgentError('funding_unavailable');
      const reserved = Number(attempt.reserved_credits);
      const price = modelPrice(attempt.requested_model, platform.model);
      const charged = price && result ? chargeCredits(price, result.usage) : null;
      // A failed call that reports no usage is not charged; unreadable usage pays the fallback.
      const credits = !result ? 0 : Math.min(reserved, charged ?? unknownUsageCredits(reserved));
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
      return { credits, status: credits ? 'settled' : 'zero_debit' };
    },
  };
}
