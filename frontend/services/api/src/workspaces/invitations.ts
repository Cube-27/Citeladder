import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { workspaceInvitationSchema } from '@citeladder/contracts/auth';
import { sql, type Selectable } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { WorkspaceInvitations } from '../generated/db-schema.ts';
import { ApiError } from '../errors.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { requiresEmailVerification } from '../auth/eligibility.ts';
import {
  assignableRoleSchema,
  lockAuthorizedWorkspace,
  workspaceView,
  type AssignableRole,
} from './service.ts';

function refusal(message: string, status: 400 | 404 | 409 = 409): never {
  throw new ApiError(status, message, { code: 'workspace_invitation_invalid' });
}

function invitationView(
  row: Selectable<WorkspaceInvitations>,
): z.input<typeof workspaceInvitationSchema> {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    email: row.email_normalized,
    role: assignableRoleSchema.parse(row.role),
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
  };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenValues() {
  const token = randomBytes(32).toString('base64url');
  return { token, token_sha256: hashInvitationToken(token) };
}

function liveInvitations(db: Database, workspaceId: string, now: Date) {
  return db
    .selectFrom('workspace_invitations')
    .where('workspace_id', '=', workspaceId)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now);
}

export async function listInvitations(db: Database, workspaceId: string) {
  return (
    await liveInvitations(db, workspaceId, new Date())
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute()
  ).map(invitationView);
}

export function issueInvitation(
  db: Database,
  workspaceId: string,
  actorId: string,
  email: string,
  role: AssignableRole,
) {
  return db
    .transaction()
    .execute((trx) => issueInvitationInTransaction(trx, workspaceId, actorId, email, role));
}

/** Caller transaction keeps operator identity creation atomic with invitation issuance. */
export async function issueInvitationInTransaction(
  trx: Database,
  workspaceId: string,
  actorId: string,
  email: string,
  role: AssignableRole,
) {
  assignableRoleSchema.parse(role);
  await lockAuthorizedWorkspace(trx, workspaceId, actorId, 'manage_members');
  const now = new Date();
  const normalized = email.trim().toLowerCase();
  const member = await trx
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select('workspace_members.id')
    .where('workspace_id', '=', workspaceId)
    .where(sql`lower(${sql.ref('users.email')})`, '=', normalized)
    .executeTakeFirst();
  if (member) refusal('already_a_member');
  const live = await liveInvitations(trx, workspaceId, now)
    .select(['id', 'email_normalized'])
    .execute();
  if (live.length >= policy.workspaces.max_pending_invitations)
    throw new ApiError(409, 'invitation_limit_exceeded', {
      code: 'workspace_invitation_limit_exceeded',
    });
  if (live.some((row) => row.email_normalized === normalized))
    refusal('invitation_already_pending');
  const { token, token_sha256 } = tokenValues();
  const values = {
    role,
    token_sha256,
    invited_by_user_id: actorId,
    expires_at: new Date(now.getTime() + policy.workspaces.invitation_ttl_hours * 3_600_000),
    updated_at: now,
  };
  // Reuse an expired slot because the partial unique index cannot use a clock.
  const expired = await trx
    .selectFrom('workspace_invitations')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('email_normalized', '=', normalized)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  const row = expired
    ? await trx
        .updateTable('workspace_invitations')
        .set(values)
        .where('id', '=', expired.id)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirstOrThrow()
    : await trx
        .insertInto('workspace_invitations')
        .values({
          id: randomUUID(),
          workspace_id: workspaceId,
          email_normalized: normalized,
          accepted_at: null,
          accepted_by_user_id: null,
          revoked_at: null,
          created_at: now,
          ...values,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
  return { invitation: invitationView(row), token };
}

export function updateInvitation(
  db: Database,
  workspaceId: string,
  actorId: string,
  invitationId: string,
  revoke: boolean,
) {
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, actorId, 'manage_members');
    const row = await trx
      .selectFrom('workspace_invitations')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', invitationId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) refusal('invitation_not_found', 404);
    const now = new Date();
    if (row.accepted_at || row.revoked_at || row.expires_at <= now)
      refusal('invitation_not_pending');
    const { token, token_sha256 } = tokenValues();
    const values = revoke
      ? { revoked_at: now, updated_at: now }
      : {
          token_sha256,
          expires_at: new Date(now.getTime() + policy.workspaces.invitation_ttl_hours * 3_600_000),
          updated_at: now,
        };
    const updated = await trx
      .updateTable('workspace_invitations')
      .set(values)
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { invitation: invitationView(updated), token };
  });
}

export function acceptInvitation(db: Database, actorId: string, token: string) {
  return db.transaction().execute(async (trx) => {
    const hash = hashInvitationToken(token);
    // Discover the root, then lock root before invitation to match all other writers.
    const found = await trx
      .selectFrom('workspace_invitations')
      .select('workspace_id')
      .where('token_sha256', '=', hash)
      .executeTakeFirst();
    if (!found) refusal('invitation_invalid', 400);
    const workspace = await trx
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', found.workspace_id)
      .where('is_system', '=', false)
      .forUpdate()
      .executeTakeFirst();
    const invitation = await trx
      .selectFrom('workspace_invitations')
      .selectAll()
      .where('workspace_id', '=', found.workspace_id)
      .where('token_sha256', '=', hash)
      .forUpdate()
      .executeTakeFirst();
    const user = await trx
      .selectFrom('users')
      .select(['email', 'is_active', 'registration_origin', 'email_verified_at'])
      .where('id', '=', actorId)
      .executeTakeFirstOrThrow();
    const now = new Date();
    if (
      !workspace ||
      !invitation ||
      !user.is_active ||
      requiresEmailVerification(user) ||
      invitation.revoked_at ||
      invitation.expires_at <= now ||
      user.email.trim().toLowerCase() !== invitation.email_normalized
    )
      refusal('invitation_invalid', 400);
    let member = await trx
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspace.id)
      .where('user_id', '=', actorId)
      .executeTakeFirst();
    if (!member) {
      if (invitation.accepted_at) refusal('invitation_invalid', 400);
      member = await trx
        .insertInto('workspace_members')
        .values({
          id: randomUUID(),
          workspace_id: workspace.id,
          user_id: actorId,
          role: assignableRoleSchema.parse(invitation.role),
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await recordSecurityEvent(trx, 'membership.join', actorId, workspace.id, actorId);
    }
    if (!invitation.accepted_at)
      await trx
        .updateTable('workspace_invitations')
        .set({
          accepted_at: now,
          accepted_by_user_id: actorId,
          updated_at: now,
        })
        .where('workspace_id', '=', workspace.id)
        .where('id', '=', invitation.id)
        .execute();
    return workspaceView(workspace, member.role);
  });
}
