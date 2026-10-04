import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy, resolveSettingSpec } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { accountState } from './state.ts';
import { conflict } from '../billing/contracts.ts';
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
 * The Site Health runtime an account state resolves to. An unresolved or
 * missing account gets the sample runtime: no monitored allowance, no count
 * disclosure.
 */
export function runtimeProjection(
  state: { error: string | null; values: ReadonlyMap<string, number> } | null,
) {
  const allowance = !state || state.error ? 0 : (state.values.get('monitored_urls') ?? 0);
  const cfg = policy.site_health_runtime;
  const setting = (key: keyof typeof cfg.settings) =>
    resolveSettingSpec(cfg.settings[key]) as number;
  const full = allowance > 0;
  return {
    discovery_mode: full ? cfg.full_mode : cfg.sample_mode,
    discovery_url_cap: full
      ? Math.min(
          setting('automatic_page_limit'),
          Math.max(cfg.full_minimum, allowance * cfg.full_headroom),
        )
      : setting('sample_discovery_url_cap'),
    sample_url_limit: full ? 0 : setting('sample_url_limit'),
    monitored_url_limit: allowance,
    count_disclosure: full,
  };
}

/** Mutation-only projection, in the transaction that appends billing evidence. */
export async function refreshRuntime(
  db: Database,
  workspaceId: string,
  accountId: string,
  at: Date,
) {
  const state = await accountState(db, workspaceId, accountId, at);
  const projection = {
    ...runtimeProjection(state),
    resolved_registry_revision: policy.entitlements.registry_revision,
    resolved_entitlement_lifecycle_version: state.account.entitlement_lifecycle_version,
    resolved_valid_until: state.error ? null : state.validUntil,
    updated_at: at,
  };
  await db
    .insertInto('workspace_site_health_runtime')
    .values({ id: randomUUID(), workspace_id: workspaceId, created_at: at, ...projection })
    .onConflict((c) => c.column('workspace_id').doUpdateSet(projection))
    .execute();
  return state;
}

async function bump(db: Database, workspaceId: string, accountId: string, at: Date) {
  await db
    .updateTable('billing_accounts')
    .set({ entitlement_lifecycle_version: sql`entitlement_lifecycle_version + 1`, updated_at: at })
    .where('id', '=', accountId)
    .where('workspace_id', '=', workspaceId)
    .execute();
  await refreshRuntime(db, workspaceId, accountId, at);
}

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
    .selectAll()
    .where('grant_id', 'in', input.grantIds)
    .where('idempotency_key', '=', input.key)
    .execute();
  if (
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
