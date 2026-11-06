/**
 * Workspace ownership: the one owner of "the workspace a person owns". A
 * person owns at most one tenant workspace; any other access is a membership.
 * System workspaces are never owned.
 */
import type { Database } from '../db/database.ts';
import { onlyOf } from '../lists.ts';

/** A person owns at most one workspace. */
export const OWNED_WORKSPACE_LIMIT = 1;

/** Owner memberships of tenant workspaces, with their workspace and user. */
function ownerships(db: Database) {
  return db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .where('workspace_members.role', '=', 'owner')
    .where('workspaces.is_system', '=', false);
}

/** The tenant workspaces the user owns (at most `OWNED_WORKSPACE_LIMIT`). */
export function ownedWorkspaces(db: Database, userId: string) {
  return ownerships(db)
    .selectAll('workspaces')
    .where('workspace_members.user_id', '=', userId)
    .execute();
}

/**
 * The user's one owned workspace and its billing account, for provisioning
 * that must never pick an arbitrary joined workspace: none or several is an
 * error.
 */
export async function ownedWorkspaceAccount(db: Database, userId: string) {
  const only = onlyOf(await ownedWorkspaces(db, userId));
  if (!only) throw new Error('bootstrap_workspace_ambiguous');
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', only.id)
    .executeTakeFirstOrThrow();
  return { workspaceId: only.id, accountId: account.id };
}

/** The owner of a tenant workspace; throws when it has none. */
export function workspaceOwner(db: Database, workspaceId: string) {
  return ownerships(db)
    .selectAll('users')
    .where('workspace_members.workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
}

/**
 * Whether the active platform admin with `email` owns a tenant workspace
 * (`workspaceId`, when named).
 */
export async function adminOwnsWorkspace(db: Database, email: string, workspaceId?: string) {
  let owned = ownerships(db)
    .select('workspaces.id')
    .where('users.email', '=', email)
    .where('users.role', '=', 'admin')
    .where('users.is_active', '=', true);
  if (workspaceId !== undefined) owned = owned.where('workspaces.id', '=', workspaceId);
  return (await owned.executeTakeFirst()) !== undefined;
}
