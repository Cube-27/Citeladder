import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';

export type CredentialMode = 'byok' | 'funded';

/**
 * A workspace on a live managed plan measures on the platform's engine and
 * DataForSEO keys; every other workspace brings its own (B32). The plan the
 * customer bought decides, never the request.
 */
export function credentialModeOf(
  current: { credential_mode: string; status: string } | null | undefined,
): CredentialMode {
  return current?.credential_mode === 'funded' &&
    policy.billing.contracts.live_subscription_statuses.includes(current.status)
    ? 'funded'
    : 'byok';
}

/** The credential mode of the workspace's current base subscription. */
export async function workspaceCredentialMode(
  db: Database,
  workspaceId: string,
): Promise<CredentialMode> {
  const current = await db
    .selectFrom('billing_subscriptions as s')
    .innerJoin('billing_accounts as a', 'a.id', 's.billing_account_id')
    .select(['s.credential_mode', 's.status'])
    .where('a.workspace_id', '=', workspaceId)
    .where('s.is_current', '=', true)
    .where('s.subscription_kind', '=', policy.entitlements.base_subscription_kind)
    .executeTakeFirst();
  return credentialModeOf(current);
}
