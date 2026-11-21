import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { requireFlag } from '../entitlements/access.ts';
import {
  billingAccountId,
  hold,
  refundSubject,
  remaining,
  settle,
  LedgerError,
} from '../entitlements/ledger.ts';
import {
  PRICING_REVISION,
  affordableOutputTokens,
  cachedReservationCredits,
  chargeCredits,
  costMicrousd,
  modelPrice,
  unknownUsageCredits,
  type ModelPrice,
} from '../billing/ai-pricing.ts';
import { conversationInputBytes } from '../models/conversation.ts';
import { spendBudget } from '../abuse/usage.ts';
import { agentSettings } from './config.ts';
import { AgentError, agentPolicy, type Run, type Scope } from './contracts.ts';
import type { Admission, FundingIdentity } from './store.ts';
import type { Funding } from './model-calls.ts';
import type { GatewaySettings } from '../models/gateway.ts';

type Settings = ReturnType<typeof agentSettings>;

async function account(db: Database, workspaceId: string) {
  const id = await billingAccountId(db, workspaceId);
  if (!id) throw new AgentError('funding_unavailable');
  return id;
}
async function capability(db: Database, workspaceId: string) {
  const id = await account(db, workspaceId);
  try {
    await requireFlag(db, workspaceId, 'agent');
  } catch (error) {
    if (error instanceof ApiError) throw new AgentError('capability_unavailable');
    throw error;
  }
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
    await spendBudget(db, settings.dailyRuns, scope.workspaceId);
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
async function inputBound(db: Database, run: Run, bytes: number) {
  const previous = await db
    .selectFrom('agent_model_attempts')
    .select(['input_tokens', 'output_tokens', 'input_bytes'])
    .where('workspace_id', '=', run.workspace_id)
    .where('run_id', '=', run.id)
    .where('run_attempt', '=', run.attempt_count)
    .where('outcome', '=', 'completed')
    .orderBy('ordinal', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (
    !previous ||
    previous.input_tokens === null ||
    previous.output_tokens === null ||
    previous.input_bytes === null
  )
    return bytes;
  const read = Number(previous.input_tokens) + Number(previous.output_tokens);
  const added = Math.max(0, bytes - Number(previous.input_bytes));
  return Math.min(bytes, read + added + agentPolicy.hold_input_margin_tokens);
}
function sizedHold(
  price: ModelPrice,
  available: number,
  bound: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxWebSearches: number;
  },
) {
  const full = cachedReservationCredits(
    price,
    bound.maxInputTokens,
    bound.maxOutputTokens,
    bound.maxWebSearches,
  );
  if (full <= available) return { credits: full, outputTokens: bound.maxOutputTokens };
  const outputTokens = affordableOutputTokens(price, {
    ...bound,
    credits: available,
  });
  if (outputTokens < Math.min(agentPolicy.hold_min_reply_tokens, bound.maxOutputTokens))
    throw new AgentError('funding_unavailable');
  return {
    credits: cachedReservationCredits(
      price,
      bound.maxInputTokens,
      outputTokens,
      bound.maxWebSearches,
    ),
    outputTokens,
  };
}
export function agentFunding(settings: Settings, platform: GatewaySettings): Funding {
  return {
    reserve: async (db, run, dispatchId, _model, request) => {
      await recheck(db, run, settings, platform);
      if (run.funding_source !== 'platform')
        return { reservationId: null, credits: 0, pricingRevision: '' };
      const price = modelPrice(run.requested_model, platform.model);
      if (!price) throw new AgentError('funding_unavailable');
      const maxInputTokens = await inputBound(db, run, conversationInputBytes(request));
      const accountId = await account(db, run.workspace_id);
      const at = new Date();
      try {
        const available = await remaining(db, {
          accountId,
          workspaceId: run.workspace_id,
          capability: policy.entitlements.ai_credits,
          at,
        });
        const { credits, outputTokens } = sizedHold(price, available.units, {
          maxInputTokens,
          maxOutputTokens: platform.maxOutputTokens,
          maxWebSearches: request.webSearches,
        });
        const { reservationId } = await hold(db, {
          capability: policy.entitlements.ai_credits,
          subject: { kind: 'agent', id: run.id, workspaceId: run.workspace_id },
          dispatchId,
          units: credits,
          at,
        });
        return {
          reservationId,
          credits,
          pricingRevision: PRICING_REVISION,
          outputTokens,
        };
      } catch (error) {
        if (
          error instanceof LedgerError &&
          [
            'funded_credits_exhausted',
            'entitlement_unresolved',
            'capability_not_consumable',
          ].includes(error.code)
        )
          throw new AgentError('funding_unavailable');
        throw error;
      }
    },
    settle: async (db, attempt, usage) => {
      const price = modelPrice(attempt.requested_model, platform.model);
      const cost = price && usage ? costMicrousd(price, usage) : null;
      if (attempt.funding_source !== 'platform')
        return { credits: 0, status: 'zero_debit', costMicrousd: cost };
      if (!attempt.reservation_id) throw new AgentError('funding_unavailable');
      const reserved = Number(attempt.reserved_credits);
      const charged = price && usage ? chargeCredits(price, usage) : null;
      const failed = attempt.outcome !== 'completed';
      const credits =
        failed && charged === null
          ? 0
          : Math.min(reserved, charged ?? unknownUsageCredits(reserved));
      await account(db, attempt.workspace_id);
      await settle(db, {
        workspaceId: attempt.workspace_id,
        reservationId: attempt.reservation_id,
        spent: credits,
        attempt: attempt.run_attempt,
        dispatch: attempt.dispatch_id,
        at: new Date(),
      });
      return {
        credits,
        status: credits ? 'settled' : 'zero_debit',
        costMicrousd: cost,
      };
    },
    refund: async (db, run) => {
      if (run.funding_source !== 'platform') return;
      await account(db, run.workspace_id);
      await refundSubject(db, {
        subject: { kind: 'agent', id: run.id, workspaceId: run.workspace_id },
        at: new Date(),
      });
    },
  };
}
