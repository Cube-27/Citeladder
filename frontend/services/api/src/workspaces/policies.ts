import { randomUUID } from 'node:crypto';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { lockAuthorizedWorkspace } from './service.ts';

/** The Terms and Privacy revisions currently published. */
export function currentPolicyRevision() {
  return {
    terms_revision: policy.auth.terms_revision,
    privacy_notice_revision: policy.auth.privacy_revision,
  };
}

export async function policyStatus(db: Database, workspaceId: string, actorId: string) {
  const row = await db
    .selectFrom('policy_acceptances')
    .select('accepted_at')
    .where('workspace_id', '=', workspaceId)
    .where('actor_id', '=', actorId)
    .where('terms_revision', '=', policy.auth.terms_revision)
    .executeTakeFirst();
  return { ...currentPolicyRevision(), accepted_at: row?.accepted_at.toISOString() ?? null };
}

export function acceptPolicy(db: Database, workspaceId: string, actorId: string, revision: string) {
  return db.transaction().execute(async (trx) => {
    await recordPolicyAcceptance(trx, {
      workspaceId,
      actorId,
      revision,
      context: 'authenticated_onboarding',
    });
    return policyStatus(trx, workspaceId, actorId);
  });
}

/**
 * Record the current Terms decision inside the caller's transaction, so a
 * flow that depends on it (MCP consent) commits both or neither.
 */
export async function recordPolicyAcceptance(
  trx: Database,
  input: {
    workspaceId: string;
    actorId: string;
    revision: string;
    context: 'authenticated_onboarding' | 'mcp_consent';
  },
) {
  if (input.revision !== policy.auth.terms_revision)
    throw new ApiError(409, 'The Terms changed. Review the current revision before accepting.', {
      code: 'policy_revision_changed',
    });
  await lockAuthorizedWorkspace(trx, input.workspaceId, input.actorId, 'read');
  const row = await trx
    .insertInto('policy_acceptances')
    .values({
      id: randomUUID(),
      actor_id: input.actorId,
      workspace_id: input.workspaceId,
      terms_revision: input.revision,
      privacy_notice_revision: policy.auth.privacy_revision,
      context: input.context,
      accepted_at: new Date(),
    })
    .onConflict((conflict) => conflict.constraint('uq_policy_acceptance_revision').doNothing())
    .returning('id')
    .executeTakeFirst();
  if (row)
    await recordSecurityEvent(trx, 'policy.accept', input.actorId, input.workspaceId, row.id);
}
