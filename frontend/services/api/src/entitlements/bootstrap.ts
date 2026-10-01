/** Public auth provisions only the configured free baseline. Billing owns other grants. */
import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { Users } from '../generated/db-schema.ts';
import { runtimeProjection } from './grants.ts';
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
    .forUpdate()
    .executeTakeFirstOrThrow();
  const cfg = policy.entitlements.baseline;
  const idempotencyKey = `${cfg.revision}:system:public-signup`;
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
  await projectRuntime(db, workspaceId, account.id, account.entitlement_lifecycle_version + 1, now);
}
