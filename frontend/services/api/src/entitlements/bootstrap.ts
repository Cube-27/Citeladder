import { randomUUID, createHash } from 'node:crypto';
import { sql, type RawBuilder, type Selectable } from 'kysely';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { policy } from '../config.ts';
import { resolveSettingSpec } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import type { Users } from '../generated/db-schema.ts';
import { issueBundle, lockAccount, sourceRef, type GrantSource } from './grants.ts';

const PUBLIC_SIGNUP: GrantSource = { kind: 'public_signup' };
import { operatorTransaction } from '../db/operator-transaction.ts';
import { requirePlatformAdmin } from '../auth/operators.ts';
import { parseUuid } from '../http/uuid.ts';
import { getLogger } from '../logging.ts';
import { stripTrailing } from '../text-order.ts';
import { workspaceOwner } from '../workspaces/owned.ts';
import { refreshRuntime } from '../site-health/plan-runtime.ts';

function canonicalMailbox(email: RawBuilder<unknown>) {
  const lowered = sql<string>`lower(${email})`;
  const domain = sql<string>`case split_part(${lowered}, '@', 2) when 'googlemail.com' then 'gmail.com' else split_part(${lowered}, '@', 2) end`;
  const local = sql<string>`split_part(split_part(${lowered}, '@', 1), '+', 1)`;
  return sql<string>`(case when ${domain} = 'gmail.com' then replace(${local}, '.', '') else ${local} end || '@' || ${domain})`;
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
      .where('source_ref', '=', sourceRef(PUBLIC_SIGNUP))
      .executeTakeFirst();
    if (existing) return;
    // The trial starts when the person creates their workspace. One mailbox has
    // one trial: a later workspace, or an account under an alias of the same
    // mailbox, inherits the exact window of the first.
    const { mailbox } = await db
      .selectNoFrom(canonicalMailbox(sql.val(user.email)).as('mailbox'))
      .executeTakeFirstOrThrow();
    await subjectXactLock(db, `trial-mailbox:${mailbox}`);
    const earlier = await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .innerJoin('users', 'users.id', 'billing_accounts.owner_user_id')
      .select(['account_grants.valid_from', 'account_grants.valid_until'])
      .where(canonicalMailbox(sql.ref('users.email')), '=', mailbox)
      .where('account_grants.source_kind', '=', 'trial')
      .where('account_grants.source_ref', '=', sourceRef(PUBLIC_SIGNUP))
      .orderBy('account_grants.valid_from')
      .limit(1)
      .executeTakeFirst();
    const from = earlier?.valid_from ?? locked.created_at;
    const days = resolveSettingSpec(policy.billing.settings.trial_days, process.env);
    const until = earlier?.valid_until ?? new Date(from.getTime() + days * 86400000);
    await issueBundle(db, {
      workspaceId,
      accountId: account.id,
      key: trial.revision,
      sourceKind: 'trial',
      source: PUBLIC_SIGNUP,
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
  await issueBundle(db, {
    workspaceId,
    accountId: account.id,
    key: idempotencyKey,
    sourceKind: cfg.source_kind,
    source: PUBLIC_SIGNUP,
    revision: policy.entitlements.registry_revision,
    specs: grants.map(([key, value]) => ({ key, value })),
    from: now,
    until: null,
    primary: true,
    profile: 'free',
    priority: 0,
  });
}

export function fullAccessSpecs(allowance: number) {
  if (!Number.isSafeInteger(allowance) || allowance < 1)
    throw new Error('invalid_development_allowance');
  // The checkout allow-list (B2) and operator controls (BL9) are explicit
  // operator grants, never part of access.
  const explicit = new Set<string>([
    policy.entitlements.billing_checkout,
    policy.entitlements.operator_controls,
  ]);
  return Object.entries(policy.entitlements.capabilities)
    .filter(([key, definition]) => definition.issuable && !explicit.has(key))
    .map(([key, definition]) => {
      let value = allowance;
      if (definition.type === 'flag') value = 1;
      else if (definition.type === 'level') value = definition.levels - 1;
      return { key, value };
    });
}

export function baselineGrantKey() {
  return `${policy.entitlements.baseline.revision}:system:public-signup`;
}

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
    source: { kind: 'override', actorId: input.userId },
    reason: input.reason,
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
export async function provisionWorkspaceBilling(
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
  const provisioned = await operatorTransaction(db, input.apply === true, async (trx) => {
    const actor = await requirePlatformAdmin(trx, input.actor);
    const owner = await workspaceOwner(trx, workspaceId);
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
  // Grants committed under the capacity lock; the runtime follows in its own order.
  if (input.apply === true) await refreshRuntime(db, workspaceId);
  return provisioned;
}
