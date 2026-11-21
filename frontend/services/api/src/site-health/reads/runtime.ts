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

export async function monitoredUrlCount(db: Database, workspaceId: string) {
  const row = await db
    .selectFrom('monitored_site_urls')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('workspace_id', '=', workspaceId)
    .where('active', '=', true)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function monitoredQuota(db: Database, workspaceId: string, at: Date) {
  const [runtime, used] = await Promise.all([
    runtimeState(db, workspaceId, at),
    monitoredUrlCount(db, workspaceId),
  ]);
  return { used, limit: runtime.monitored_url_limit };
}
