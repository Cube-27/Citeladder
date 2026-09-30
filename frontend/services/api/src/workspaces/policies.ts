import { randomUUID } from 'node:crypto';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { lockAuthorizedWorkspace } from './service.ts';

export async function policyStatus(db: Database, workspaceId: string, actorId: string) {
  const row = await db
    .selectFrom('policy_acceptances')
    .select('accepted_at')
    .where('workspace_id', '=', workspaceId)
    .where('actor_id', '=', actorId)
    .where('terms_revision', '=', policy.auth.terms_revision)
    .executeTakeFirst();
  return {
    terms_revision: policy.auth.terms_revision,
    privacy_notice_revision: policy.auth.privacy_revision,
    accepted_at: row?.accepted_at.toISOString() ?? null,
  };
}

export async function acceptPolicy(
  db: Database,
  workspaceId: string,
  actorId: string,
  revision: string,
) {
  if (revision !== policy.auth.terms_revision)
    throw new ApiError(409, 'The Terms changed. Review the current revision before accepting.', {
      code: 'policy_revision_changed',
    });
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, actorId, 'read');
    const row = await trx
      .insertInto('policy_acceptances')
      .values({
        id: randomUUID(),
        actor_id: actorId,
        workspace_id: workspaceId,
        terms_revision: revision,
        privacy_notice_revision: policy.auth.privacy_revision,
        context: 'authenticated_onboarding',
        accepted_at: new Date(),
      })
      .onConflict((conflict) => conflict.constraint('uq_policy_acceptance_revision').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (row) await recordSecurityEvent(trx, 'policy.accept', actorId, workspaceId, row.id);
    return policyStatus(trx, workspaceId, actorId);
  });
}
