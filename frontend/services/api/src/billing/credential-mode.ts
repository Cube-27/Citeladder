import type { CredentialMode } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';

export function credentialModeOf(
  current: { credential_mode: string; status: string } | null | undefined,
): CredentialMode {
  return current?.credential_mode === 'funded' &&
    policy.billing.contracts.live_subscription_statuses.includes(current.status)
    ? 'funded'
    : 'byok';
}

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
