import { recordSecurityEvent } from '../auth/security-events.ts';
import type { Database } from '../db/database.ts';

/**
 * Revoke every live key `creatorId` made in the workspace, in the caller's
 * membership-removal transaction: a key never outlives its creator's access.
 */
export async function revokeCreatorKeys(
  trx: Database,
  workspaceId: string,
  creatorId: string,
  actorId: string,
): Promise<void> {
  const revoked = await trx
    .updateTable('api_keys')
    .set({ revoked_at: new Date(), revoke_reason: 'creator_removed' })
    .where('workspace_id', '=', workspaceId)
    .where('created_by_user_id', '=', creatorId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .execute();
  for (const { id } of revoked)
    await recordSecurityEvent(trx, 'api_key.revoke', actorId, workspaceId, id);
}
