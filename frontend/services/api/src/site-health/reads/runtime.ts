/**
 * The workspace's Site Health runtime, resolved at read time.
 *
 * Grant changes persist `workspace_site_health_runtime` (`../plan-runtime.ts`); these reads
 * resolve the same projection from the account's grants as of now instead of
 * refreshing that row, so a read never writes. The browser reads the runtime
 * through the workspace entitlement (`site_health`), which resolves it from
 * the same grants.
 */
import type { Database } from '../../db/database.ts';
import { accountState } from '../../entitlements/state.ts';
import { runtimeProjection } from '../plan-runtime.ts';

async function runtimeState(db: Database, workspaceId: string, at: Date) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const state = account ? await accountState(db, workspaceId, account.id, at) : null;
  return runtimeProjection(state);
}

/** Active monitored URLs across the workspace: what `monitored_urls` occupancy counts. */
export async function monitoredUrlCount(db: Database, workspaceId: string) {
  const row = await db
    .selectFrom('monitored_site_urls')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('workspace_id', '=', workspaceId)
    .where('active', '=', true)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** Active monitored URLs across the workspace against its monitored allowance. */
export async function monitoredQuota(db: Database, workspaceId: string, at: Date) {
  const [runtime, used] = await Promise.all([
    runtimeState(db, workspaceId, at),
    monitoredUrlCount(db, workspaceId),
  ]);
  return { used, limit: runtime.monitored_url_limit };
}
