import type { Database } from '../db/database.ts';
import { onlyOf } from '../lists.ts';

export const OWNED_WORKSPACE_LIMIT = 1;

function ownerships(db: Database) {
  return db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .where('workspace_members.role', '=', 'owner')
    .where('workspaces.is_system', '=', false);
}

export function ownedWorkspaces(db: Database, userId: string) {
  return ownerships(db)
    .selectAll('workspaces')
    .where('workspace_members.user_id', '=', userId)
    .execute();
}

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

export function workspaceOwner(db: Database, workspaceId: string) {
  return ownerships(db)
    .selectAll('users')
    .where('workspace_members.workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
}
