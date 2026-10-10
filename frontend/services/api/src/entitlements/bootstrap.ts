/** Registration provenance selects the lifetime public trial or the operator baseline. */
import { randomUUID, createHash } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { Users } from '../generated/db-schema.ts';
import { runtimeProjection, issueBundle, lockAccount } from './grants.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { requirePlatformAdmin } from '../auth/operators.ts';
import { parseUuid } from '../http/uuid.ts';
import { getLogger } from '../logging.ts';
import { stripTrailing } from '../text-order.ts';
import { resolveAccountEntitlement } from './resolve.ts';

async function projectRuntime(
  db: Database,
  workspaceId: string,
  accountId: string,
  version: number,
  now: Date,
) {
  const resolved = await resolveAccountEntitlement(db, { workspaceId, accountId }, now);
  const runtime = runtimeProjection(
    resolved.status === 'resolved'
      ? { error: null, values: resolved.values }
      : { error: resolved.error, values: new Map() },
  );
  const projection = {
    ...runtime,
    resolved_registry_revision: policy.entitlements.registry_revision,
    resolved_entitlement_lifecycle_version: version,
    resolved_valid_until: resolved.status === 'resolved' ? resolved.validUntil : null,
    updated_at: now,
  };
  await db
    .insertInto('workspace_site_health_runtime')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      created_at: now,
      ...projection,
    })
    .onConflict((conflict) =>
      conflict.column('workspace_id').doUpdateSet(projection)
        .where(sql<boolean>`(workspace_site_health_runtime.discovery_mode, workspace_site_health_runtime.discovery_url_cap,
      workspace_site_health_runtime.sample_url_limit, workspace_site_health_runtime.monitored_url_limit,
      workspace_site_health_runtime.count_disclosure) IS DISTINCT FROM
      (${runtime.discovery_mode}, ${runtime.discovery_url_cap}, ${runtime.sample_url_limit}, ${runtime.monitored_url_limit}, ${runtime.count_disclosure})`),
    )
    .execute();
}

/** Caller owns commit; account row serializes both stacks' baseline issuance. */
export async function ensureWorkspaceBilling(
  db: Database,
  workspaceId: string,
  user: Selectable<Users>,
  options: { provisionAccess?: boolean } = {},
): Promise<void> {
  const now = new Date();
  await db
    .insertInto('billing_accounts')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      owner_user_id: user.id,
      registration_cohort_at: user.created_at,
      status: 'active',
      registration_origin: user.registration_origin,
      billing_country: '',
      country_verification: 'provisional',
      billing_profile: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column('workspace_id').doNothing())
    .execute();
  const account = await db
    .selectFrom('billing_accounts')
    .select(['id', 'entitlement_lifecycle_version'])
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  if (options.provisionAccess === false) return;
  const locked = await lockAccount(db, workspaceId, account.id);
  if (locked.registration_origin === 'public') {
    const trial = policy.entitlements.public_trial;
    const existing = await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .where('source_kind', '=', 'trial')
      .where('source_ref', '=', 'system:public-signup')
      .executeTakeFirst();
    if (existing) return;
    // The trial starts when the person creates their workspace. One person has
    // one trial: a later workspace inherits the exact window of their first.
    const earlier = await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .select(['account_grants.valid_from', 'account_grants.valid_until'])
      .where('billing_accounts.owner_user_id', '=', user.id)
      .where('account_grants.source_kind', '=', 'trial')
      .where('account_grants.source_ref', '=', 'system:public-signup')
      .orderBy('account_grants.valid_from')
      .limit(1)
      .executeTakeFirst();
    const from = earlier?.valid_from ?? locked.created_at;
    const days = resolveSettingSpec(policy.billing.settings.trial_days) as number;
    const until = earlier?.valid_until ?? new Date(from.getTime() + days * 86400000);
    await issueBundle(db, {
      workspaceId,
      accountId: account.id,
      key: trial.revision,
      sourceKind: 'trial',
      sourceRef: 'system:public-signup',
      revision: trial.revision,
      specs: Object.entries(trial.grants).map(([key, value]) => ({ key, value })),
      from,
      until,
      primary: true,
      profile: trial.profile,
      priority: 0,
    });
    getLogger('app.auth').info('auth.trial_issued', {
      account_id: account.id,
      workspace_id: workspaceId,
    });
    return;
  }
  if (locked.registration_origin !== 'operator') throw new Error('registration_origin_unresolved');
  const cfg = policy.entitlements.baseline;
  const idempotencyKey = baselineGrantKey();
  const existing = await db
    .selectFrom('account_grants')
    .select(['key', 'value'])
    .where('billing_account_id', '=', account.id)
    .where('idempotency_key', '=', idempotencyKey)
    .execute();
  const grants = Object.entries(cfg.grants);
  if (existing.length) {
    if (
      existing.length !== grants.length ||
      grants.some(([key, value]) => !existing.some((row) => row.key === key && row.value === value))
    )
      throw new Error('grant_bundle_conflict');
    return;
  }
  await db
    .insertInto('account_grants')
    .values(
      grants.map(([key, value]) => ({
        id: randomUUID(),
        billing_account_id: account.id,
        source_kind: cfg.source_kind,
        source_ref: 'system:public-signup',
        bundle_role: 'primary',
        profile_key: 'free',
        profile_priority: 0,
        bundle_id: idempotencyKey,
        key,
        value,
        period_start: null,
        period_end: null,
        valid_from: now,
        valid_until: null,
        catalog_revision: policy.entitlements.registry_revision,
        idempotency_key: idempotencyKey,
        created_at: now,
      })),
    )
    .execute();
  await db
    .updateTable('billing_accounts')
    .set({ entitlement_lifecycle_version: sql`entitlement_lifecycle_version + 1`, updated_at: now })
    .where('id', '=', account.id)
    .execute();
  await projectRuntime(db, workspaceId, account.id, locked.entitlement_lifecycle_version + 1, now);
}

/** Every issuable flag, the highest level of each leveled capability and a finite counter allowance. */
export function fullAccessSpecs(allowance: number) {
  if (!Number.isSafeInteger(allowance) || allowance < 1)
    throw new Error('invalid_development_allowance');
  return Object.entries(policy.entitlements.capabilities)
    .filter(([, definition]) => definition.issuable)
    .map(([key, definition]) => {
      let value = allowance;
      if (definition.type === 'flag') value = 1;
      else if (definition.type === 'level') value = definition.levels - 1;
      return { key, value };
    });
}

/** The idempotency key (and bundle id) of an operator/legacy account's baseline grants. */
export function baselineGrantKey() {
  return `${policy.entitlements.baseline.revision}:system:public-signup`;
}

/** Preserve family/source keys for idempotent replay of existing baseline grants. */
export async function issueDevelopmentAccess(
  db: Database,
  input: {
    workspaceId: string;
    accountId: string;
    userId: string;
    allowance: number;
    reason: string;
    keyFamily: string;
    initialKey: string;
    dryRun?: boolean;
  },
) {
  await lockAccount(db, input.workspaceId, input.accountId);
  const existing = await db
    .selectFrom('account_grants')
    .select(['key', 'value', 'idempotency_key'])
    .where('billing_account_id', '=', input.accountId)
    .execute();
  const family = existing.filter((row) => row.idempotency_key.startsWith(input.keyFamily));
  const transitions: string[] = [];
  const specs = fullAccessSpecs(input.allowance).flatMap((spec) => {
    const def =
      policy.entitlements.capabilities[spec.key as keyof typeof policy.entitlements.capabilities];
    const values = family.filter((row) => row.key === spec.key).map((row) => row.value);
    const summed = def.type !== 'flag' && def.type !== 'level';
    const current = summed
      ? values.reduce((total, value) => total + value, 0)
      : Math.max(0, ...values);
    if (values.length && spec.value <= current) return [];
    transitions.push(`${spec.key}:${current}->${spec.value}`);
    return [{ key: spec.key, value: summed && values.length ? spec.value - current : spec.value }];
  });
  if (!specs.length) return;
  const key = family.length
    ? `${stripTrailing(input.keyFamily, ':')}:+${createHash('sha256').update(transitions.join('\n')).digest('hex').slice(0, 16)}`
    : input.initialKey;
  await issueBundle(db, {
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    key,
    sourceKind: 'override',
    sourceRef: `override:${input.userId}`,
    specs,
    revision: policy.entitlements.registry_revision,
    from: new Date(),
    until: null,
    primary: false,
    profile: '',
    priority: 0,
  });
  getLogger('api.billing.operator').info(
    input.dryRun ? 'billing.override_grant_previewed' : 'billing.override_grant_issued',
    {
      actor_id: input.userId,
      account_id: input.accountId,
      reason: input.reason,
      dry_run: input.dryRun === true,
    },
  );
}
/** Explicit workspace operator repair. Public signup never calls development issuance. */
export function provisionWorkspaceBilling(
  db: Database,
  input: {
    actor: string;
    workspaceId: string;
    reason: string;
    apply?: boolean;
    developmentAllowance?: number;
  },
) {
  const workspaceId = parseUuid(input.workspaceId);
  if (!workspaceId) throw new Error('invalid_workspace_id');
  if (!input.reason.trim() || input.reason.length > 255) throw new Error('reason_required');
  return operatorTransaction(db, input.apply === true, async (trx) => {
    const actor = await requirePlatformAdmin(trx, input.actor);
    const owner = await trx
      .selectFrom('workspace_members')
      .innerJoin('users', 'users.id', 'workspace_members.user_id')
      .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
      .selectAll('users')
      .where('workspace_members.workspace_id', '=', workspaceId)
      .where('workspace_members.role', '=', 'owner')
      .where('workspaces.is_system', '=', false)
      .executeTakeFirstOrThrow();
    await ensureWorkspaceBilling(trx, workspaceId, owner);
    const account = await trx
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow();
    if (input.developmentAllowance !== undefined) {
      if (!owner.is_active || owner.role !== 'admin' || owner.id !== actor.id)
        throw new Error('development_target_must_be_operator');
      await issueDevelopmentAccess(trx, {
        workspaceId,
        accountId: account.id,
        userId: owner.id,
        allowance: input.developmentAllowance,
        reason: input.reason,
        keyFamily: `development-bootstrap:${owner.id}:`,
        initialKey: `development-bootstrap:${owner.id}:${input.developmentAllowance}`,
        dryRun: input.apply !== true,
      });
    }
    return { workspace_id: workspaceId, account_id: account.id };
  });
}
