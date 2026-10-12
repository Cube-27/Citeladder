import { recordSecurityEvent } from '../auth/security-events.ts';
import type { Database } from '../db/database.ts';

/** Revoke `creatorId`'s live keys, optionally only in some workspaces, with one receipt each. */
async function revokeKeysOf(
  trx: Database,
  creatorId: string,
  actorId: string,
  reason: 'creator_removed' | 'credential_reset',
  workspaceIds?: readonly string[],
): Promise<void> {
  let query = trx
    .updateTable('api_keys')
    .set({ revoked_at: new Date(), revoke_reason: reason })
    .where('created_by_user_id', '=', creatorId)
    .where('revoked_at', 'is', null);
  if (workspaceIds) query = query.where('workspace_id', 'in', workspaceIds);
  const revoked = await query.returning(['id', 'workspace_id']).execute();
  await Promise.all(
    revoked.map((key) =>
      recordSecurityEvent(trx, 'api_key.revoke', actorId, key.workspace_id, key.id),
    ),
  );
}

/**
 * Revoke every live key `creatorId` made in these workspaces, in the caller's
 * membership-removal transaction: a key never outlives its creator's access.
 */
export async function revokeCreatorKeys(
  trx: Database,
  workspaceIds: readonly string[],
  creatorId: string,
  actorId: string,
): Promise<void> {
  if (workspaceIds.length === 0) return;
  await revokeKeysOf(trx, creatorId, actorId, 'creator_removed', workspaceIds);
}

/**
 * Revoke every live key `userId` made, in any workspace, inside the caller's
 * password-reset or password-change transaction: account recovery must not
 * leave a key minted by whoever held the old credentials.
 */
export function revokeKeysAfterCredentialReset(
  trx: Database,
  userId: string,
  actorId: string,
): Promise<void> {
  return revokeKeysOf(trx, userId, actorId, 'credential_reset');
}
