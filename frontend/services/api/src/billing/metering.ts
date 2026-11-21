import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { billingAccountId, hold, settle, LedgerError } from '../entitlements/ledger.ts';
import { runMetered } from '../models/meter-scope.ts';
import { gatewayCalls, type ModelGateway } from '../models/gateway.ts';
import { callOutputCap, ModelError, type Complete } from '../models/http.ts';
import type { JevClient } from '../models/jev.ts';
import {
  PRICING_REVISION,
  chargeCredits,
  chargeMode,
  costCredits,
  costMicrousd,
  modelPrice,
  requestFeeMicrousd,
  requestInputBytes,
  reservationCredits,
  tokenCount,
  unknownUsageCredits,
  type MeteredFeature,
  type TokenUsage,
} from './ai-pricing.ts';
import { widen } from '../widen.ts';

const logger = getLogger('api.billing.metering');
const AI_CREDITS = policy.entitlements.ai_credits;

export type MeterContext = { workspaceId: string; feature: MeteredFeature };
type Provider = 'model_gateway' | 'jev' | 'tavily' | 'keenable' | 'dataforseo';
type CallSpec = {
  provider: Provider;
  model: string;
  inputBytes?: number;
  maxOutputTokens?: number;
};
export type Outcome<T> = { value: T; usage: TokenUsage | null };

function usageOf(error: unknown): TokenUsage | null {
  return error instanceof ModelError && error.usage ? error.usage : null;
}
function errorCode(error: unknown) {
  if (error instanceof ModelError) return `model_${error.code}`.slice(0, 64);
  if (error instanceof ApiError) return error.code.slice(0, 64);
  return 'call_failed';
}
function tokens(usage: TokenUsage | null) {
  return {
    input_tokens: tokenCount(usage?.input_tokens),
    cached_input_tokens: tokenCount(usage?.cached_input_tokens),
    output_tokens: tokenCount(usage?.output_tokens),
  };
}

const unresolved = () =>
  new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
    code: 'entitlement_unresolved',
  });

function callRow(context: MeterContext, spec: CallSpec, at: Date) {
  return {
    id: randomUUID(),
    workspace_id: context.workspaceId,
    billing_account_id: widen<string | null>(null),
    feature: context.feature,
    provider: spec.provider,
    model: spec.model.slice(0, 255),
    charge: chargeMode(context.feature),
    status: 'reserved',
    pricing_revision: PRICING_REVISION,
    reservation_id: null,
    reserved_credits: 0,
    credits: 0,
    // A hold its owner settles (a whole analysis, B41) is never swept as abandoned.
    owner_settled: false,
    ...tokens(null),
    cost_microusd: widen<number | null>(null),
    error_code: '',
    created_at: at,
    settled_at: widen<Date | null>(null),
  };
}

function uncharged(spec: CallSpec, usage: TokenUsage | null, error: unknown) {
  const fee = requestFeeMicrousd(spec.provider);
  if (fee !== null) return error ? 0 : fee;
  const price = modelPrice(spec.model);
  return price && usage ? costMicrousd(price, usage) : null;
}

async function record(
  db: Database,
  context: MeterContext,
  spec: CallSpec,
  usage: TokenUsage | null,
  error: unknown,
) {
  const now = new Date();
  await db
    .insertInto('platform_calls')
    .values({
      ...callRow(context, spec, now),
      status: error ? 'failed' : 'settled',
      ...tokens(usage),
      cost_microusd: uncharged(spec, usage, error),
      error_code: error ? errorCode(error) : '',
      settled_at: now,
    })
    .execute();
}

async function openHold(
  trx: Database,
  context: MeterContext,
  spec: CallSpec,
  reserved: number,
  ownerSettled = false,
) {
  const accountId = await billingAccountId(trx, context.workspaceId);
  if (!accountId) throw unresolved();
  const at = new Date();
  const row = {
    ...callRow(context, spec, at),
    billing_account_id: accountId,
    reserved_credits: reserved,
    owner_settled: ownerSettled,
  };
  const { id } = row;
  await trx.insertInto('platform_calls').values(row).execute();
  let reservationId: string;
  try {
    ({ reservationId } = await hold(trx, {
      capability: AI_CREDITS,
      subject: { kind: 'platform_call', id, workspaceId: context.workspaceId },
      units: reserved,
      at,
    }));
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'funded_credits_exhausted')
      throw new ApiError(403, 'Your AI credits are used up', {
        code: 'ai_credits_exhausted',
      });
    if (error instanceof LedgerError && error.code === 'entitlement_unresolved') throw unresolved();
    throw error;
  }
  await trx
    .updateTable('platform_calls')
    .set({ reservation_id: reservationId })
    .where('id', '=', id)
    .execute();
  return id;
}

/**
 * Commits the hold and the call record before dispatch. A charged call must
 * bound its size: an unbounded hold would floor at one credit and cap the
 * charge there, so a feature switched to credits without bounds fails loudly.
 */
function reserve(db: Database, context: MeterContext, spec: CallSpec) {
  if (spec.inputBytes === undefined || spec.maxOutputTokens === undefined)
    throw new Error(`Charged feature ${context.feature} must bound its call size`);
  const price = modelPrice(spec.model);
  if (!price)
    throw new ApiError(503, 'AI pricing is not configured for this model', {
      code: 'ai_pricing_unavailable',
    });
  const reserved = reservationCredits(price, spec.inputBytes, spec.maxOutputTokens);
  return db.transaction().execute((trx) => openHold(trx, context, spec, reserved));
}

function lockHeld(trx: Database, callId: string) {
  return trx
    .selectFrom('platform_calls')
    .selectAll()
    .where('id', '=', callId)
    .where('status', '=', 'reserved')
    .forUpdate()
    .executeTakeFirst();
}

async function closeHold(
  trx: Database,
  call: NonNullable<Awaited<ReturnType<typeof lockHeld>>>,
  outcome: {
    credits: number;
    failed: boolean;
    usage: TokenUsage | null;
    cost: number | null;
    error: unknown;
  },
) {
  const { credits, failed } = outcome;
  if (!call.reservation_id || !call.billing_account_id) return;
  const at = new Date();
  await settle(trx, {
    workspaceId: call.workspace_id,
    reservationId: call.reservation_id,
    spent: credits,
    attempt: 1,
    dispatch: 'settle',
    at,
  });
  await trx
    .updateTable('platform_calls')
    .set({
      status: failed ? 'failed' : 'settled',
      credits,
      ...tokens(outcome.usage),
      cost_microusd: outcome.cost,
      error_code: failed ? errorCode(outcome.error) : '',
      settled_at: at,
    })
    .where('id', '=', call.id)
    .execute();
}

export function holdProviderCredits(
  trx: Database,
  context: MeterContext,
  spec: { provider: Provider; model: string },
  credits: number,
) {
  return openHold(trx, context, spec, credits, true);
}

export async function settleProviderCredits(trx: Database, callId: string, costMicrousd: number) {
  const call = await lockHeld(trx, callId);
  if (!call) return null;
  const credits = Math.min(call.reserved_credits, costCredits(costMicrousd));
  await closeHold(trx, call, {
    credits,
    failed: false,
    usage: null,
    cost: costMicrousd,
    error: null,
  });
  return credits;
}

async function settleCall(
  db: Database,
  callId: string,
  usage: TokenUsage | null,
  failed: boolean,
  error: unknown = null,
) {
  await db.transaction().execute(async (trx) => {
    const call = await lockHeld(trx, callId);
    if (!call) return;
    const price = modelPrice(call.model);
    const charged = usage && price ? chargeCredits(price, usage) : null;
    const credits =
      failed && charged === null
        ? 0
        : Math.min(call.reserved_credits, charged ?? unknownUsageCredits(call.reserved_credits));
    const cost = price && usage ? costMicrousd(price, usage) : null;
    await closeHold(trx, call, { credits, failed, usage, cost, error });
  });
}

async function unchargedDailySpend(db: Database, at = new Date()) {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const row = await db
    .selectFrom('internal_costs')
    .select(sql<string>`coalesce(sum(cost_microusd), 0)`.as('spent'))
    .where('source', '=', 'platform_call')
    .where('charge', '<>', 'credits')
    .where('occurred_at', '>=', day)
    .executeTakeFirstOrThrow();
  return BigInt(row.spent);
}

async function assertSpendOpen(db: Database, context: MeterContext): Promise<null> {
  const ceiling = BigInt(policy.costs.platform.daily_uncharged_ceiling_microusd);
  const spent = await unchargedDailySpend(db);
  if (spent < ceiling) return null;
  logger.warning('billing.platform_spend_breaker_open', {
    workspace_id: context.workspaceId,
    feature: context.feature,
    spent_microusd: spent.toString(),
    ceiling_microusd: ceiling.toString(),
  });
  throw new ApiError(503, 'Platform AI work is paused for today', {
    code: 'platform_spend_paused',
  });
}

async function metered<T>(
  db: Database,
  context: MeterContext,
  spec: CallSpec,
  call: () => Promise<Outcome<T>>,
): Promise<T> {
  const charged = chargeMode(context.feature) === 'credits';
  // The hold commits before network I/O, so it never shares the caller's transaction.
  if (charged && db.isTransaction)
    throw new Error('A charged platform call must not run in a transaction');
  const callId = charged ? await reserve(db, context, spec) : await assertSpendOpen(db, context);
  // A failed settlement is retried once (settling is idempotent), because the
  // abandoned-call sweep knows no outcome and charges the fallback even for a
  // call that failed. A second failure never replaces the provider's outcome:
  // the hold stays reserved for the sweep.
  const settleHeld = async (id: string, usage: TokenUsage | null, error: unknown) => {
    try {
      await settleCall(db, id, usage, error !== null, error).catch(() =>
        settleCall(db, id, usage, error !== null, error),
      );
    } catch (error_) {
      logger.exception('billing.platform_call_unsettled', error_, {
        workspace_id: context.workspaceId,
        feature: context.feature,
        call_id: id,
      });
    }
  };
  const finish = (usage: TokenUsage | null, error: unknown) =>
    callId === null ? record(db, context, spec, usage, error) : settleHeld(callId, usage, error);
  let outcome: Outcome<T>;
  try {
    outcome = await runMetered(context, call);
  } catch (error) {
    await finish(usageOf(error), error);
    throw error;
  }
  await finish(outcome.usage, null);
  return outcome.value;
}

function featureOutputCap(feature: MeteredFeature) {
  const caps: Record<string, number> = policy.models.feature_output_tokens;
  if (!Object.hasOwn(caps, feature))
    throw new Error(`Gateway feature ${feature} must declare its output cap`);
  return caps[feature]!;
}

function meteredGateway(db: Database, gateway: ModelGateway, context: MeterContext) {
  const cap = callOutputCap(gateway.maxOutputTokens, featureOutputCap(context.feature));
  const complete: Complete = (system, user, signal, onText, schema, maxOutputTokens) => {
    const outputTokens = callOutputCap(cap, maxOutputTokens);
    return metered(
      db,
      context,
      {
        provider: 'model_gateway',
        model: gateway.model,
        inputBytes: requestInputBytes(system, user, schema),
        maxOutputTokens: outputTokens,
      },
      async () => {
        const result = await gateway.complete(system, user, signal, onText, schema, outputTokens);
        return { value: result, usage: result.usage };
      },
    );
  };
  return { ...gateway, maxOutputTokens: cap, ...gatewayCalls(complete) };
}

export async function settleAbandonedCalls(db: Database, now = new Date(), limit = 100) {
  const cutoff = new Date(now.getTime() - policy.billing.ai_credits.unsettled_after_seconds * 1000);
  const stale = await db
    .selectFrom('platform_calls')
    .select('id')
    .where('status', '=', 'reserved')
    .where('owner_settled', '=', false)
    .where('created_at', '<', cutoff)
    .orderBy('created_at')
    .limit(limit)
    .execute();
  for (const call of stale) await settleCall(db, call.id, null, false); // NOSONAR -- one bounded settle transaction at a time.
  return stale.length;
}

export function meterFor(db: Database, workspaceId: string) {
  return {
    gateway: (gateway: ModelGateway, feature: MeteredFeature): ModelGateway =>
      meteredGateway(db, gateway, { workspaceId, feature }),
    call: <T>(feature: MeteredFeature, spec: CallSpec, call: () => Promise<Outcome<T>>) =>
      metered(db, { workspaceId, feature }, spec, call),
    jev: (client: JevClient, feature: MeteredFeature): JevClient => ({
      ...client,
      decide: (state, questions, signal) =>
        metered(
          db,
          { workspaceId, feature },
          { provider: 'jev', model: client.model },
          async () => {
            const result = await client.decide(state, questions, signal);
            return {
              value: result,
              usage: (result.usage ?? null) as TokenUsage | null,
            };
          },
        ),
    }),
  };
}
export type Meter = ReturnType<typeof meterFor>;
