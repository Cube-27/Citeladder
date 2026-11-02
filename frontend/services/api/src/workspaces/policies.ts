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

/**
 * Record the person's acceptance for a workspace they open. The decision itself
 * is the one they made on the sign-in or sign-up form, recorded with their
 * account; a request without it on the published revision is refused, so the
 * request alone is never consent.
 */
export async function acceptPolicy(
  db: Database,
  workspaceId: string,
  actorId: string,
  revision: string,
) {
  await requireAccountTermsDecision(db, actorId, revision);
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

/** Refuse a decision on any revision but the published one. */
export function requireCurrentRevision(revision: string) {
  if (revision !== policy.auth.terms_revision)
    throw new ApiError(409, 'The Terms changed. Review the current revision before accepting.', {
      code: 'policy_revision_changed',
    });
}

/** The person's own Terms decision on the current revision, made on the sign-in or sign-up form. */
export async function accountTermsStatus(db: Database, actorId: string) {
  const row = await db
    .selectFrom('account_policy_acceptances')
    .select('accepted_at')
    .where('actor_id', '=', actorId)
    .where('terms_revision', '=', policy.auth.terms_revision)
    .executeTakeFirst();
  return { ...currentPolicyRevision(), accepted_at: row?.accepted_at.toISOString() ?? null };
}

/**
 * Record a person's Terms decision, independent of any workspace: the required
 * box on the sign-up and sign-in forms (email or Google). Append-only; the
 * first decision on a revision is kept and repeating it is inert.
 */
export async function recordAccountTermsDecision(
  trx: Database,
  input: { actorId: string; revision: string; context: 'signup' | 'signin' },
) {
  requireCurrentRevision(input.revision);
  const row = await trx
    .insertInto('account_policy_acceptances')
    .values({
      id: randomUUID(),
      actor_id: input.actorId,
      terms_revision: input.revision,
      privacy_notice_revision: policy.auth.privacy_revision,
      context: input.context,
      accepted_at: new Date(),
    })
    .onConflict((conflict) =>
      conflict.constraint('uq_account_policy_acceptance_revision').doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  if (row) await recordSecurityEvent(trx, 'policy.accept', input.actorId, null, row.id);
}

/**
 * Creating or opening a workspace needs the person's own recorded decision on
 * the revision the request names: the request flag alone is not consent. A
 * session older than the published revision has none, so the person signs in
 * again and ticks the box on the sign-in form.
 */
export async function requireAccountTermsDecision(db: Database, actorId: string, revision: string) {
  requireCurrentRevision(revision);
  if (!(await accountTermsStatus(db, actorId)).accepted_at)
    throw new ApiError(409, 'The Terms of Service changed. Sign in again to agree to them.', {
      code: 'terms_decision_required',
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
  requireCurrentRevision(input.revision);
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
