import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { conflict } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { capacityLock } from './ledger.ts';

export async function lockAccount(db: Database, workspaceId: string, accountId: string) {
  await capacityLock(db, accountId);
  return db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('id', '=', accountId)
    .where('workspace_id', '=', workspaceId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

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
}

const invalidBundle = () =>
  conflict('grant_bundle_invalid', 'The grant bundle names an unknown or out-of-range capability.');

const bump = (db: Database, workspaceId: string, accountId: string, at: Date) =>
  bumpLifecycle(db, { workspaceId, accountId, at });

export type GrantSource =
  | { kind: 'subscription'; subscriptionId: string }
  | { kind: 'activation'; activationId: string }
  | { kind: 'override'; actorId: string }
  | { kind: 'intro'; introId: string }
  | { kind: 'public_signup' };

export function sourceRef(source: GrantSource): string {
  switch (source.kind) {
    case 'subscription':
      return `subscription:${source.subscriptionId}`;
    case 'activation':
      return `activation:${source.activationId}`;
    case 'override':
      return `override:${source.actorId}`;
    case 'intro':
      return `intro:${source.introId}`;
    case 'public_signup':
      return 'system:public-signup';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

const GRANT_SOURCES = new Map<string, (id: string) => GrantSource>([
  ['subscription', (subscriptionId) => ({ kind: 'subscription', subscriptionId })],
  ['activation', (activationId) => ({ kind: 'activation', activationId })],
  ['override', (actorId) => ({ kind: 'override', actorId })],
  ['intro', (introId) => ({ kind: 'intro', introId })],
]);

export function grantSource(ref: string): GrantSource | null {
  if (ref === 'system:public-signup') return { kind: 'public_signup' };
  const separator = ref.indexOf(':');
  const [kind, id] = [ref.slice(0, separator), ref.slice(separator + 1)];
  if (separator < 1 || !id) return null;
  return GRANT_SOURCES.get(kind)?.(id) ?? null;
}

function bundleReason(source: GrantSource, raw: string | undefined) {
  const reason = raw?.trim() ?? '';
  if (reason.length > 255 || (source.kind === 'override' && !reason))
    conflict('grant_bundle_invalid', 'An override needs a reason, of at most 255 characters.');
  return reason;
}

export async function issueBundle(
  db: Database,
  input: {
    workspaceId: string;
    accountId: string;
    key: string;
    sourceKind: string;
    source: GrantSource;
    specs: readonly { key: string; value: number }[];
    revision: string;
    from: Date;
    until: Date | null;
    primary: boolean;
    profile: string;
    priority: number;
    periodStart?: Date;
    periodEnd?: Date;
    reason?: string;
  },
) {
  const { accountId, workspaceId, key, specs } = input;
  const ref = sourceRef(input.source);
  const reason = bundleReason(input.source, input.reason);
  await lockAccount(db, workspaceId, accountId);
  let priorQuery = db
    .selectFrom('account_grants')
    .selectAll()
    .where('billing_account_id', '=', accountId);
  priorQuery =
    input.periodStart && input.periodEnd && input.source.kind === 'subscription'
      ? priorQuery
          .where('source_ref', '=', ref)
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
              row.source_ref === ref &&
              row.catalog_revision === input.revision &&
              row.bundle_role === (input.primary ? 'primary' : 'supplement') &&
              row.profile_key === input.profile &&
              row.profile_priority === input.priority &&
              row.period_start?.getTime() === input.periodStart?.getTime() &&
              row.period_end?.getTime() === input.periodEnd?.getTime() &&
              row.valid_from.getTime() === input.from.getTime() &&
              row.valid_until?.getTime() === input.until?.getTime() &&
              row.reason === reason,
          ),
      )
    )
      conflict(
        'grant_idempotency_conflict',
        'This grant key was already used for a different grant.',
      );
    getLogger('api.entitlements').info('billing.duplicate_grant_prevented', {
      account_id: accountId,
    });
    return prior;
  }
  if (
    !specs.length ||
    new Set(specs.map((spec) => spec.key)).size !== specs.length ||
    !policy.entitlements.grant_source_kinds.includes(input.sourceKind)
  )
    invalidBundle();
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
      invalidBundle();
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
        source_ref: ref,
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
        reason,
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
  if (rows.length !== new Set(input.grantIds).size)
    conflict('grant_not_found', 'A grant to revoke was not found on this account.');
  if (!Number.isFinite(input.at.getTime()))
    conflict('invalid_revocation_time', 'The revocation time is not a valid date.');
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
    conflict(
      'revocation_idempotency_conflict',
      'This revocation key was already used for a different revocation.',
    );
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
