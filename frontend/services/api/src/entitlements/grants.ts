import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { conflict } from '../billing/contracts.ts';
import { refreshRuntime } from '../site-health/plan-runtime.ts';
import { getLogger } from '../logging.ts';

export async function lockAccount(db: Database, workspaceId: string, accountId: string) {
  await advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
  return db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('id', '=', accountId)
    .where('workspace_id', '=', workspaceId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/**
 * The only entitlement lifecycle bump: every grant, revocation and
 * subscription change advances the account's version, then the Site Health
 * runtime is refreshed from the new grants. With `expectedVersion` the bump
 * is optimistic: it applies only if no other writer bumped since that read.
 */
export async function bumpLifecycle(
  db: Database,
  request: { workspaceId: string; accountId: string; at: Date; expectedVersion?: number },
) {
  const { workspaceId, accountId, at, expectedVersion } = request;
  let update = db
    .updateTable('billing_accounts')
    .set({ entitlement_lifecycle_version: sql`entitlement_lifecycle_version + 1`, updated_at: at })
    .where('id', '=', accountId)
    .where('workspace_id', '=', workspaceId);
  if (expectedVersion !== undefined)
    update = update.where('entitlement_lifecycle_version', '=', expectedVersion);
  await update.execute();
  await refreshRuntime(db, workspaceId, accountId, at);
}

const bump = (db: Database, workspaceId: string, accountId: string, at: Date) =>
  bumpLifecycle(db, { workspaceId, accountId, at });

export async function issueBundle(
  db: Database,
  input: {
    workspaceId: string;
    accountId: string;
    key: string;
    sourceKind: string;
    sourceRef: string;
    specs: readonly { key: string; value: number }[];
    revision: string;
    from: Date;
    until: Date | null;
    primary: boolean;
    profile: string;
    priority: number;
    periodStart?: Date;
    periodEnd?: Date;
  },
) {
  const { accountId, workspaceId, key, specs } = input;
  await lockAccount(db, workspaceId, accountId);
  // Existing period bundles retain their original writer's key and UUIDs.
  let priorQuery = db
    .selectFrom('account_grants')
    .selectAll()
    .where('billing_account_id', '=', accountId);
  priorQuery =
    input.periodStart && input.periodEnd && input.sourceRef.startsWith('subscription:')
      ? priorQuery
          .where('source_ref', '=', input.sourceRef)
          .where('period_start', '=', input.periodStart)
          .where('period_end', '=', input.periodEnd)
      : priorQuery.where('idempotency_key', '=', key);
  const prior = await priorQuery.orderBy('key').execute();
  if (prior.length) {
    if (
      prior.length !== specs.length ||
      specs.some(
        (spec) =>
          !prior.some(
            (row) =>
              row.key === spec.key &&
              row.value === spec.value &&
              row.source_kind === input.sourceKind &&
              row.source_ref === input.sourceRef &&
              row.catalog_revision === input.revision &&
              row.bundle_role === (input.primary ? 'primary' : 'supplement') &&
              row.profile_key === input.profile &&
              row.profile_priority === input.priority &&
              row.period_start?.getTime() === input.periodStart?.getTime() &&
              row.period_end?.getTime() === input.periodEnd?.getTime() &&
              row.valid_from.getTime() === input.from.getTime() &&
              row.valid_until?.getTime() === input.until?.getTime(),
          ),
      )
    )
      conflict('grant_idempotency_conflict');
    getLogger('api.entitlements').info('billing.duplicate_grant_prevented', {
      account_id: accountId,
    });
    return prior;
  }
  // The resolver fails closed on an unknown source kind, so never write one.
  if (
    !specs.length ||
    new Set(specs.map((spec) => spec.key)).size !== specs.length ||
    !(policy.entitlements.grant_source_kinds as readonly string[]).includes(input.sourceKind)
  )
    conflict('grant_bundle_invalid');
  for (const spec of specs) {
    const definition =
      policy.entitlements.capabilities[spec.key as keyof typeof policy.entitlements.capabilities];
    if (
      !definition?.issuable ||
      !Number.isSafeInteger(spec.value) ||
      spec.value < 0 ||
      (definition.type === 'flag' && spec.value > 1) ||
      (definition.type === 'level' && spec.value >= definition.levels)
    )
      conflict('grant_bundle_invalid');
  }
  const now = new Date();
  const rows = await db
    .insertInto('account_grants')
    .values(
      specs.map((spec) => ({
        id: randomUUID(),
        billing_account_id: accountId,
        key: spec.key,
        value: spec.value,
        source_kind: input.sourceKind,
        source_ref: input.sourceRef,
        catalog_revision: input.revision,
        valid_from: input.from,
        valid_until: input.until,
        period_start: input.periodStart ?? null,
        period_end: input.periodEnd ?? null,
        bundle_id: key,
        bundle_role: input.primary ? 'primary' : 'supplement',
        profile_key: input.profile,
        profile_priority: input.priority,
        idempotency_key: key,
        created_at: now,
      })),
    )
    .returningAll()
    .execute();
  await bump(db, workspaceId, accountId, now);
  return rows;
}

export async function revokeBundle(
  db: Database,
  input: {
    workspaceId: string;
    accountId: string;
    grantIds: string[];
    key: string;
    reason: string;
    actorKind: string;
    actorId: string | null;
    at: Date;
  },
) {
  await lockAccount(db, input.workspaceId, input.accountId);
  if (!input.grantIds.length) return;
  const rows = await db
    .selectFrom('account_grants')
    .select('id')
    .where('billing_account_id', '=', input.accountId)
    .where('id', 'in', input.grantIds)
    .orderBy('id')
    .forUpdate()
    .execute();
  if (rows.length !== new Set(input.grantIds).size) conflict('grant_not_found');
  if (!Number.isFinite(input.at.getTime())) conflict('invalid_revocation_time');
  const prior = await db
    .selectFrom('grant_revocations')
    .innerJoin('account_grants', 'account_grants.id', 'grant_revocations.grant_id')
    .selectAll('grant_revocations')
    .where('account_grants.billing_account_id', '=', input.accountId)
    .where('grant_revocations.idempotency_key', '=', input.key)
    .execute();
  if (
    (prior.length > 0 &&
      (prior.length !== rows.length ||
        prior.some((row) => !input.grantIds.includes(row.grant_id)))) ||
    prior.some(
      (row) =>
        row.effective_from.getTime() !== input.at.getTime() ||
        row.reason !== input.reason ||
        row.actor_kind !== input.actorKind ||
        row.actor_user_id !== input.actorId,
    )
  )
    conflict('revocation_idempotency_conflict');
  const inserted = await db
    .insertInto('grant_revocations')
    .values(
      rows.map((row) => ({
        id: randomUUID(),
        grant_id: row.id,
        idempotency_key: input.key,
        effective_from: input.at,
        reason: input.reason,
        actor_kind: input.actorKind,
        actor_user_id: input.actorId,
        created_at: new Date(),
      })),
    )
    .onConflict((c) => c.columns(['grant_id', 'idempotency_key']).doNothing())
    .returning('id')
    .execute();
  if (inserted.length) await bump(db, input.workspaceId, input.accountId, new Date());
}
