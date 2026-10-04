import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { hashPassword, passwordSchema, verifyAccountPassword } from '../auth/password.ts';
import { createIdentity } from '../auth/service.ts';
import { WorkspaceContext } from '../auth/workspace.ts';
import { lockIdentityAdministration } from '../auth/operators.ts';
import { issueInvitationInTransaction } from './invitations.ts';
import {
  assignableRoleSchema,
  listMembers,
  mutateMemberInTransaction,
  provisionAccount,
} from './service.ts';

export type OperatorSession = {
  actorId: string;
  workspaceId: string;
  passwordHash: string;
  sessionVersion: number;
};
export type AccountAction =
  | { kind: 'list' }
  | { kind: 'invite'; email: string; role: string; password?: string }
  | { kind: 'role'; email: string; role: string }
  | { kind: 'password'; email: string; password: string };
const emailSchema = z
  .email()
  .max(255)
  .transform((email) => email.trim().toLowerCase());

async function authorizedOperator(db: Database, session: OperatorSession) {
  await lockIdentityAdministration(db);
  const workspace = await db
    .selectFrom('workspaces')
    .selectAll()
    .where('id', '=', session.workspaceId)
    .where('is_system', '=', false)
    .forUpdate()
    .executeTakeFirst();
  const member = await db
    .selectFrom('workspace_members')
    .select('role')
    .where('workspace_id', '=', session.workspaceId)
    .where('user_id', '=', session.actorId)
    .forUpdate()
    .executeTakeFirst();
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', session.actorId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  if (
    !workspace ||
    !member ||
    !actor?.is_active ||
    !new WorkspaceContext(session.workspaceId, member.role).allows('manage_members') ||
    actor.hashed_password !== session.passwordHash ||
    actor.session_version !== session.sessionVersion
  )
    throw new Error('workspace_admin_required');
  return workspace;
}

/** Password verification has no public-login repair or billing side effects. */
export async function authenticateOperator(
  db: Database,
  email: string,
  workspaceId: string,
  password: string,
): Promise<OperatorSession> {
  z.uuid().parse(workspaceId);
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email.trim().toLowerCase())
    .executeTakeFirst();
  if (
    !(await verifyAccountPassword(password, actor?.is_active ? actor.hashed_password : null)) ||
    !actor?.hashed_password
  )
    throw new Error('operator_authentication_failed');
  const session = {
    actorId: actor.id,
    workspaceId,
    passwordHash: actor.hashed_password,
    sessionVersion: actor.session_version,
  };
  await db.transaction().execute((trx) => authorizedOperator(trx, session));
  return session;
}

/** Called only after confirmation. All live authority and target checks occur under locks. */
export async function manageAccount(db: Database, session: OperatorSession, action: AccountAction) {
  const email = action.kind === 'list' ? null : emailSchema.parse(action.email.trim());
  const role =
    action.kind === 'invite' || action.kind === 'role'
      ? assignableRoleSchema.parse(action.role)
      : null;
  const encoded =
    action.kind === 'password' || (action.kind === 'invite' && action.password !== undefined)
      ? await hashPassword(passwordSchema.parse(action.password))
      : null;
  return db.transaction().execute(async (trx) => {
    await authorizedOperator(trx, session);
    if (action.kind === 'list') return listMembers(trx, session.workspaceId, session.actorId);
    if (action.kind === 'invite') {
      const invitation = await issueInvitationInTransaction(
        trx,
        session.workspaceId,
        session.actorId,
        email!,
        role!,
      );
      const existing = await trx
        .selectFrom('users')
        .select('id')
        .where('email', '=', email!)
        .executeTakeFirst();
      if (!existing) {
        if (!encoded) throw new Error('New identity requires a terminal password');
        const user = await createIdentity(trx, email!, encoded);
        if (!user) throw new Error('user_already_exists');
        await provisionAccount(trx, user, { provisionAccess: false });
      }
      return invitation;
    }
    const target = await trx
      .selectFrom('workspace_members')
      .innerJoin('users', 'users.id', 'workspace_members.user_id')
      .select(['workspace_members.id as memberId', 'users.id as userId', 'users.hashed_password'])
      .where('workspace_id', '=', session.workspaceId)
      .where('users.email', '=', email!)
      .forUpdate('workspace_members')
      .executeTakeFirst();
    if (!target) throw new Error('user_not_in_workspace');
    if (action.kind === 'role')
      return mutateMemberInTransaction(trx, session.workspaceId, session.actorId, {
        memberId: target.memberId,
        role: role!,
      });
    const user = await trx
      .selectFrom('users')
      .select('hashed_password')
      .where('id', '=', target.userId)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    if (!user.hashed_password) throw new Error('passwordless_account');
    await trx
      .updateTable('users')
      .set({
        hashed_password: encoded,
        session_version: sql`session_version + 1`,
        updated_at: new Date(),
      })
      .where('id', '=', target.userId)
      .execute();
    return { passwordUpdated: true };
  });
}
