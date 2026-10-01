/**
 * The workspace's Site Health runtime, resolved at read time.
 *
 * Billing mutations persist `workspace_site_health_runtime`; these reads
 * resolve the same projection from the account's grants as of now instead of
 * refreshing that row, so a read never writes.
 */
import type { siteHealthEntitlementSchema } from '@citeladder/contracts/site-health';
import type { z } from 'zod';

import { policy } from '../../config.ts';
import type { Database } from '../../db/database.ts';
import { accountState } from '../../entitlements/state.ts';
import { runtimeProjection } from '../../entitlements/grants.ts';
import { siteReadSettings } from '../runtime.ts';

const MONITORED = 'monitored_urls';

async function runtimeState(db: Database, workspaceId: string, at: Date) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const state = account ? await accountState(db, workspaceId, account.id, at) : null;
  return { account, state, runtime: runtimeProjection(state) };
}

export async function entitlementView(
  db: Database,
  workspaceId: string,
  at: Date,
): Promise<z.input<typeof siteHealthEntitlementSchema>> {
  const { account, state, runtime } = await runtimeState(db, workspaceId, at);
  const resolved = state !== null && state.error === null;
  let accessMode: 'unresolved' | 'full' | 'sample' = 'unresolved';
  if (resolved) accessMode = runtime.monitored_url_limit > 0 ? 'full' : 'sample';
  return {
    workspace_id: workspaceId,
    access_mode: accessMode,
    sample_url_limit: runtime.sample_url_limit,
    monitored_url_limit: resolved ? runtime.monitored_url_limit : 0,
    count_disclosure: resolved && runtime.count_disclosure,
    resolver_status: resolved ? 'resolved' : 'entitlement_unresolved',
    registry_revision: policy.entitlements.registry_revision,
    entitlement_lifecycle_version: account?.entitlement_lifecycle_version ?? 0,
    valid_until: resolved ? (state.validUntil?.toISOString() ?? null) : null,
    contributing_grant_ids: resolved
      ? state.selected.filter((grant) => grant.key === MONITORED).map((grant) => grant.id)
      : [],
    advanced_controls_enabled: siteReadSettings().advancedControls,
  };
}

/** Active monitored URLs across the workspace against its monitored allowance. */
export async function monitoredQuota(db: Database, workspaceId: string, at: Date) {
  const [{ runtime }, used] = await Promise.all([
    runtimeState(db, workspaceId, at),
    db
      .selectFrom('monitored_site_urls')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('active', '=', true)
      .executeTakeFirstOrThrow(),
  ]);
  return { used: Number(used.count), limit: runtime.monitored_url_limit };
}
