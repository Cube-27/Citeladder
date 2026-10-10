import { randomUUID } from 'node:crypto';
import type { Selectable } from 'kysely';
import { workspaceSchema, workspaceMemberSchema } from '@citeladder/contracts/auth';
import { z } from 'zod';
import {
  WorkspaceContext,
  resolveWorkspaceMember,
  type WorkspaceCapability,
} from '../auth/workspace.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { policy } from '../config.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import type { Users, Workspaces } from '../generated/db-schema.ts';
import { ensureWorkspaceBilling } from '../entitlements/bootstrap.ts';
import { dropWorkspaceFromGrants } from '../mcp/connections.ts';

export type User = Selectable<Users>;
type Role = keyof typeof policy.workspaces.roles;
const isRole = (key: string): key is Role => Object.hasOwn(policy.workspaces.roles, key);
// Workspace policy names the roles used by the wire enum.
const [firstRole, ...otherRoles] = Object.keys(policy.workspaces.roles).filter(isRole);
if (!firstRole) throw new Error('Workspace policy names no roles.');
const roleSchema = z.enum([firstRole, ...otherRoles]);
export const assignableRoleSchema = roleSchema.exclude(['owner']);
export type AssignableRole = z.infer<typeof assignableRoleSchema>;
export type MemberMutation =
  | { memberId: string; role: AssignableRole }
  | { memberId: string; remove: true }
  | { leave: true };

export function workspaceView(
  workspace: Selectable<Workspaces>,
  role: string,
): z.input<typeof workspaceSchema> {
  return {
    id: workspace.id,
    name: workspace.name,
    role: roleSchema.parse(role),
    capabilities: [...new WorkspaceContext(workspace.id, role).capabilities()],
    created_at: workspace.created_at.toISOString(),
    updated_at: workspace.updated_at.toISOString(),
  };
}

/** A person owns at most one workspace; any other access is a membership. */
const OWNED_WORKSPACE_LIMIT = 1;

function ownedWorkspaces(db: Database, userId: string) {
  return db
    .selectFrom('workspaces')
    .innerJoin('workspace_members', 'workspace_members.workspace_id', 'workspaces.id')
    .selectAll('workspaces')
    .where('workspace_members.user_id', '=', userId)
    .where('workspace_members.role', '=', 'owner')
    .where('workspaces.is_system', '=', false)
    .execute();
}

async function insertWorkspace(
  db: Database,
  userId: string,
  name: string,
): Promise<Selectable<Workspaces>> {
  const now = new Date();
  const workspace = await db
    .insertInto('workspaces')
    .values({
      id: randomUUID(),
      name,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto('workspace_members')
    .values({
      id: randomUUID(),
      workspace_id: workspace.id,
      user_id: userId,
      role: 'owner',
      created_at: now,
      updated_at: now,
    })
    .execute();
  return workspace;
}

/** Operator and development provisioning: the identity's owned workspace and its access. */
export async function provisionAccount(
  db: Database,
  user: User,
  options: { provisionAccess?: boolean } = {},
): Promise<string | null> {
  await subjectXactLock(db, `workspace.create:${user.id}`);
  let owned = await ownedWorkspaces(db, user.id);
  let createdId: string | null = null;
  if (owned.length === 0) {
    const created = await insertWorkspace(
      db,
      user.id,
      `${user.email.split('@')[0] || 'My'}'s Workspace`,
    );
    createdId = created.id;
    owned = [created];
  }
  for (const workspace of owned) await ensureWorkspaceBilling(db, workspace.id, user, options);
  return createdId;
}

/**
 * Create the caller's owned workspace with its billing account and access, in
 * the caller's transaction. This is where a self-serve trial starts, so a
 * public identity spends the shared daily trial budget here.
 */
export async function createWorkspace(trx: Database, userId: string, name: string) {
  await subjectXactLock(trx, `workspace.create:${userId}`);
  if ((await ownedWorkspaces(trx, userId)).length >= OWNED_WORKSPACE_LIMIT)
    throw new ApiError(403, 'You already own a workspace', {
      code: 'workspace_limit_exceeded',
      details: { limit: OWNED_WORKSPACE_LIMIT },
    });
  const user = await trx
    .selectFrom('users')
    .selectAll()
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (user.registration_origin === 'public')
    await enforceSubjectRequest(trx, 'client', 'global-trial', {
      operation: 'auth.trial.global',
      limit: policy.auth.mailbox.trial_daily_limit,
      windowSeconds: policy.auth.mailbox.daily_window_seconds,
    });
  const workspace = await insertWorkspace(trx, userId, name);
  await ensureWorkspaceBilling(trx, workspace.id, user);
  return workspaceView(workspace, 'owner');
}

/** Root lock orders membership/invitation writes and rechecks live authority. */
export async function lockAuthorizedWorkspace(
  db: Database,
  workspaceId: string,
  userId: string,
  capability: WorkspaceCapability,
) {
  const workspace = await db
    .selectFrom('workspaces')
    .selectAll()
    .where('id', '=', workspaceId)
    .where('is_system', '=', false)
    .forUpdate()
    .executeTakeFirst();
  if (!workspace) throw notFound('Workspace');
  (await resolveWorkspaceMember(db, userId, workspaceId)).require(capability);
  return workspace;
}

function ownerRequired(message: string): never {
  throw new ApiError(409, message, { code: 'workspace_owner_required' });
}

export async function listMembers(
  db: Database,
  workspaceId: string,
  actorId: string,
): Promise<z.input<typeof workspaceMemberSchema>[]> {
  const rows = await db
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .select([
      'workspace_members.id',
      'user_id',
      'email',
      'workspace_members.role',
      'workspace_members.created_at',
    ])
    .where('workspace_id', '=', workspaceId)
    .orderBy('workspace_members.created_at')
    .orderBy('workspace_members.id')
    .execute();
  return rows.map((row) => ({
    ...row,
    role: roleSchema.parse(row.role),
    is_self: row.user_id === actorId,
    created_at: row.created_at.toISOString(),
  }));
}

export function mutateMember(
  db: Database,
  workspaceId: string,
  actorId: string,
  target: MemberMutation,
) {
  return db
    .transaction()
    .execute((trx) => mutateMemberInTransaction(trx, workspaceId, actorId, target));
}

/** Lock a customer (non-system) workspace row; operator CLIs authorize the actor
 * themselves and print the reviewed slug. */
export async function lockWorkspace(trx: Database, workspaceId: string) {
  const workspace = await trx
    .selectFrom('workspaces')
    .select('id')
    .where('id', '=', workspaceId)
    .where('is_system', '=', false)
    .forUpdate()
    .executeTakeFirst();
  if (!workspace) throw new Error('workspace_not_found');
}

export async function mutateMemberInTransaction(
  trx: Database,
  workspaceId: string,
  actorId: string,
  target: MemberMutation,
) {
  await lockAuthorizedWorkspace(
    trx,
    workspaceId,
    actorId,
    'leave' in target ? 'read' : 'manage_members',
  );
  return applyMemberMutation(trx, workspaceId, actorId, target);
}

/** The member change itself, for a caller that already authorized and locked the workspace. */
export async function applyMemberMutation(
  trx: Database,
  workspaceId: string,
  actorId: string,
  target: MemberMutation,
) {
  if ('role' in target) assignableRoleSchema.parse(target.role);
  const query = trx
    .selectFrom('workspace_members')
    .selectAll()
    .where('workspace_id', '=', workspaceId);
  const member = await (
    'leave' in target
      ? query.where('user_id', '=', actorId)
      : query.where('id', '=', target.memberId)
  )
    .forUpdate()
    .executeTakeFirst();
  if (!member) throw new ApiError(404, 'member_not_found', { code: 'workspace_member_not_found' });
  if (member.role === 'owner') ownerRequired('Transfer ownership first');
  if ('role' in target) {
    if (member.role !== target.role) {
      await trx
        .updateTable('workspace_members')
        .set({ role: target.role, updated_at: new Date() })
        .where('id', '=', member.id)
        .where('workspace_id', '=', workspaceId)
        .execute();
      await recordSecurityEvent(trx, 'membership.role', actorId, workspaceId, member.user_id);
    }
  } else {
    await trx
      .deleteFrom('workspace_members')
      .where('id', '=', member.id)
      .where('workspace_id', '=', workspaceId)
      .execute();
    await dropWorkspaceFromGrants(trx, member.user_id, workspaceId);
    await recordSecurityEvent(
      trx,
      'leave' in target ? 'membership.leave' : 'membership.remove',
      actorId,
      workspaceId,
      member.user_id,
    );
  }
  return 'role' in target
    ? (await listMembers(trx, workspaceId, actorId)).find((row) => row.id === member.id)!
    : null;
}

export function transferOwnership(
  db: Database,
  workspaceId: string,
  actorId: string,
  memberId: string,
) {
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, workspaceId, actorId, 'transfer_ownership');
    const members = await trx
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .forUpdate()
      .execute();
    const previous = members.find((row) => row.role === 'owner');
    const incoming = members.find((row) => row.id === memberId);
    if (!incoming)
      throw new ApiError(404, 'member_not_found', { code: 'workspace_member_not_found' });
    if (!previous) ownerRequired('The workspace has no owner');
    if (incoming.id === previous.id) ownerRequired('This member already owns the workspace');
    await subjectXactLock(trx, `workspace.create:${incoming.user_id}`);
    if ((await ownedWorkspaces(trx, incoming.user_id)).length >= OWNED_WORKSPACE_LIMIT)
      throw new ApiError(403, 'The new owner already owns a workspace', {
        code: 'workspace_limit_exceeded',
        details: { limit: OWNED_WORKSPACE_LIMIT },
      });
    await trx
      .updateTable('workspace_members')
      .set({ role: 'admin', updated_at: new Date() })
      .where('id', '=', previous.id)
      .where('workspace_id', '=', workspaceId)
      .execute();
    await trx
      .updateTable('workspace_members')
      .set({ role: 'owner', updated_at: new Date() })
      .where('id', '=', incoming.id)
      .where('workspace_id', '=', workspaceId)
      .execute();
    await recordSecurityEvent(trx, 'membership.transfer', actorId, workspaceId, incoming.user_id);
    return listMembers(trx, workspaceId, actorId);
  });
}
