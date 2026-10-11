/**
 * The one platform-AI metering owner (B11-B15, B18, B31). Every platform
 * provider call outside the Agent's own dispatch runs through `metered`:
 *
 * - a charged feature commits its credit hold (the call's maximum at the
 *   serving model's price) before any network I/O, then settles once to the
 *   reported tokens; unreadable usage settles at a fixed fallback no larger
 *   than the hold, and a failed call that reports no usage is not charged;
 * - an included or uncharged feature is recorded with its tokens after the call.
 *
 * Customers see only the credits; prices and the markup stay internal (B23).
 */
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { reserveUsage, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import { runMetered } from '../models/meter-scope.ts';
import { gatewayCalls, type ModelGateway } from '../models/gateway.ts';
import { ModelError, type Complete } from '../models/http.ts';
import type { JevClient } from '../models/jev.ts';
import {
  PRICING_REVISION,
  chargeCredits,
  chargeMode,
  costMicrousd,
  modelPrice,
  requestInputBytes,
  reservationCredits,
  tokenCount,
  unknownUsageCredits,
  type MeteredFeature,
  type TokenUsage,
} from './ai-pricing.ts';

const logger = getLogger('api.billing.metering');
const AI_CREDITS = policy.entitlements.ai_credits;

export type MeterContext = { workspaceId: string; feature: MeteredFeature };
type Provider = 'model_gateway' | 'jev' | 'tavily' | 'keenable';
type CallSpec = {
  provider: Provider;
  model: string;
  /** Upper bound of the request’s input, in UTF-8 bytes; charged calls only. */
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

/** A `platform_calls` row for `context` and `spec`, before its outcome fields. */
function callRow(context: MeterContext, spec: CallSpec, at: Date) {
  return {
    id: randomUUID(),
    workspace_id: context.workspaceId,
    billing_account_id: null as string | null,
    feature: context.feature,
    provider: spec.provider,
    model: spec.model.slice(0, 255),
    charge: chargeMode(context.feature),
    status: 'reserved',
    pricing_revision: PRICING_REVISION,
    reservation_id: null,
    reserved_credits: 0,
    credits: 0,
    ...tokens(null),
    cost_microusd: null as number | null,
    error_code: '',
    created_at: at,
    settled_at: null as Date | null,
  };
}

/** Records an included or uncharged call after it ran; the record never fails the call. */
async function record(
  db: Database,
  context: MeterContext,
  spec: CallSpec,
  usage: TokenUsage | null,
  error: unknown,
) {
  const price = modelPrice(spec.model);
  const now = new Date();
  try {
    await db
      .insertInto('platform_calls')
      .values({
        ...callRow(context, spec, now),
        status: error ? 'failed' : 'settled',
        ...tokens(usage),
        cost_microusd: price && usage ? costMicrousd(price, usage) : null,
        error_code: error ? errorCode(error) : '',
        settled_at: now,
      })
      .execute();
  } catch (error_) {
    logger.warning('billing.platform_call_unrecorded', {
      workspace_id: context.workspaceId,
      feature: context.feature,
      exception: error_ instanceof Error ? error_.message : String(error_),
    });
  }
}

/** Commits the hold and the call record before dispatch. */
function reserve(db: Database, context: MeterContext, spec: CallSpec) {
  const price = modelPrice(spec.model);
  if (!price)
    throw new ApiError(503, 'AI pricing is not configured for this model', {
      code: 'ai_pricing_unavailable',
    });
  const reserved = reservationCredits(price, spec.inputBytes ?? 0, spec.maxOutputTokens ?? 0);
  return db.transaction().execute(async (trx) => {
    const account = await trx
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', context.workspaceId)
      .executeTakeFirst();
    if (!account) throw unresolved();
    const at = new Date();
    const row = {
      ...callRow(context, spec, at),
      billing_account_id: account.id,
      reserved_credits: reserved,
    };
    const { id } = row;
    await trx.insertInto('platform_calls').values(row).execute();
    let reservationId: string;
    try {
      reservationId = await reserveUsage(trx, {
        accountId: account.id,
        capability: AI_CREDITS,
        subject: {
          kind: 'platform_call',
          id,
          workspaceId: context.workspaceId,
        },
        units: reserved,
        key: `call:${id}`,
        at,
      });
    } catch (error) {
      if (error instanceof LedgerError && error.message === 'funded_credits_exhausted')
        throw new ApiError(403, 'Your AI credits are used up', {
          code: 'ai_credits_exhausted',
        });
      if (error instanceof LedgerError && error.message === 'entitlement_unresolved')
        throw unresolved();
      throw error;
    }
    await trx
      .updateTable('platform_calls')
      .set({ reservation_id: reservationId })
      .where('id', '=', id)
      .execute();
    return id;
  });
}

/**
 * Settles a reserved call once. A call that succeeded with unreadable usage
 * (or was lost to a crash) charges the fallback; a failure with no usage
 * charges nothing.
 */
async function settleCall(
  db: Database,
  callId: string,
  usage: TokenUsage | null,
  failed: boolean,
  error: unknown = null,
) {
  await db.transaction().execute(async (trx) => {
    const call = await trx
      .selectFrom('platform_calls')
      .selectAll()
      .where('id', '=', callId)
      .forUpdate()
      .executeTakeFirst();
    if (call?.status !== 'reserved' || !call.reservation_id || !call.billing_account_id) return;
    const price = modelPrice(call.model);
    const charged = usage && price ? chargeCredits(price, usage) : null;
    const credits =
      failed && charged === null
        ? 0
        : Math.min(call.reserved_credits, charged ?? unknownUsageCredits(call.reserved_credits));
    const at = new Date();
    const request = {
      workspaceId: call.workspace_id,
      accountId: call.billing_account_id,
      reservationId: call.reservation_id,
      at,
    };
    if (credits > 0)
      await debitUsage(trx, {
        ...request,
        subjectId: call.id,
        attempt: 1,
        units: credits,
        key: `call:${call.id}:debit`,
        dispatchKey: 'settle',
      });
    await releaseUsage(trx, { ...request, key: `call:${call.id}:release` });
    await trx
      .updateTable('platform_calls')
      .set({
        status: failed ? 'failed' : 'settled',
        credits,
        ...tokens(usage),
        cost_microusd: price && usage ? costMicrousd(price, usage) : null,
        error_code: failed ? errorCode(error) : '',
        settled_at: at,
      })
      .where('id', '=', call.id)
      .execute();
  });
}

/** Runs one platform provider call under its metering context. */
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
  const callId = charged ? await reserve(db, context, spec) : null;
  const finish = (usage: TokenUsage | null, error: unknown) =>
    callId === null
      ? record(db, context, spec, usage, error)
      : settleCall(db, callId, usage, error !== null, error);
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

/** The gateway with every call metered for `context`; the raw gateway refuses unmetered calls. */
function meteredGateway(db: Database, gateway: ModelGateway, context: MeterContext) {
  const complete: Complete = (system, user, signal, onText, schema) =>
    metered(
      db,
      context,
      {
        provider: 'model_gateway',
        model: gateway.model,
        inputBytes: requestInputBytes(system, user, schema),
        maxOutputTokens: gateway.maxOutputTokens,
      },
      async () => {
        const result = await gateway.complete(system, user, signal, onText, schema);
        return { value: result, usage: result.usage };
      },
    );
  return { ...gateway, ...gatewayCalls(complete) };
}

/** Charges the fallback for holds a crash left unsettled past the configured age. */
export async function settleAbandonedCalls(db: Database, now = new Date(), limit = 100) {
  const cutoff = new Date(now.getTime() - policy.billing.ai_credits.unsettled_after_seconds * 1000);
  const stale = await db
    .selectFrom('platform_calls')
    .select('id')
    .where('status', '=', 'reserved')
    .where('created_at', '<', cutoff)
    .orderBy('created_at')
    .limit(limit)
    .execute();
  for (const call of stale) await settleCall(db, call.id, null, false);
  return stale.length;
}

/**
 * A workspace's metering handle, passed to each feature that reaches a paid
 * provider. Tests that exercise feature logic pass a recording double instead.
 */
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
