import { randomUUID } from 'node:crypto';
import type { Selectable } from 'kysely';
import { policy } from '../config.ts';
import { resolveSettingSpec } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import type { WorkspaceSiteHealthRuntime } from '../generated/db-schema.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { billingAccountId } from '../entitlements/ledger.ts';
import { accountState } from '../entitlements/state.ts';

export function runtimeProjection(
  state: { error: string | null; values: ReadonlyMap<string, number> } | null,
) {
  const allowance = !state || state.error ? 0 : (state.values.get('monitored_urls') ?? 0);
  const cfg = policy.site_health_runtime;
  const setting = (key: keyof typeof cfg.settings) =>
    resolveSettingSpec(cfg.settings[key], process.env) as number;
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

/**
 * Lock the workspace's runtime row FOR UPDATE, first creating it with the
 * sample runtime when absent. It is the first Site Health lock after the
 * project, so the caller must not yet hold the capacity lock or a billing row.
 */
export async function holdRuntime(db: Database, workspaceId: string) {
  const at = new Date();
  await db
    .insertInto('workspace_site_health_runtime')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      created_at: at,
      updated_at: at,
      ...runtimeProjection(null),
      resolved_registry_revision: policy.entitlements.registry_revision,
      resolved_entitlement_lifecycle_version: 0,
    })
    .onConflict((c) => c.column('workspace_id').doNothing())
    .execute();
  return db
    .selectFrom('workspace_site_health_runtime')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export async function resolveRuntime(
  db: Database,
  held: Selectable<WorkspaceSiteHealthRuntime>,
  at: Date,
) {
  const accountId = await billingAccountId(db, held.workspace_id);
  if (!accountId) return { state: null, runtime: held };
  await lockAccount(db, held.workspace_id, accountId);
  const state = await accountState(db, held.workspace_id, accountId, at);
  const runtime = await db
    .updateTable('workspace_site_health_runtime')
    .set({
      ...runtimeProjection(state),
      resolved_registry_revision: policy.entitlements.registry_revision,
      resolved_entitlement_lifecycle_version: state.account.entitlement_lifecycle_version,
      updated_at: at,
    })
    .where('id', '=', held.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { state, runtime };
}

export async function refreshRuntime(db: Database, workspaceId: string) {
  if (db.isTransaction)
    throw new Error('refreshRuntime runs after the billing transaction commits');
  await db
    .transaction()
    .execute(async (trx) => resolveRuntime(trx, await holdRuntime(trx, workspaceId), new Date()));
}
