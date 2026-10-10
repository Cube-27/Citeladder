import { recordSecurityEvent } from '../auth/security-events.ts';
import type { Database } from '../db/database.ts';

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
  const revoked = await trx
    .updateTable('api_keys')
    .set({ revoked_at: new Date(), revoke_reason: 'creator_removed' })
    .where('workspace_id', 'in', workspaceIds)
    .where('created_by_user_id', '=', creatorId)
    .where('revoked_at', 'is', null)
    .returning(['id', 'workspace_id'])
    .execute();
  await Promise.all(
    revoked.map((key) =>
      recordSecurityEvent(trx, 'api_key.revoke', actorId, key.workspace_id, key.id),
    ),
  );
}
