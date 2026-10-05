import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';

/** Development feature access follows the configured operator's owned workspace. */
export async function hasDevelopmentWorkspace(db: Database, workspaceId?: string) {
  const email = String(resolveSettingSpec(policy.settings.dev_login_email)).trim().toLowerCase();
  if (!email || !resolveSettingSpec(policy.settings.dev_login_password)) return false;
  let query = db
    .selectFrom('workspace_members')
    .innerJoin('users', 'users.id', 'workspace_members.user_id')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select('workspaces.id')
    .where('users.email', '=', email)
    .where('users.role', '=', 'admin')
    .where('users.is_active', '=', true)
    .where('workspace_members.role', '=', 'owner')
    .where('workspaces.is_system', '=', false);
  if (workspaceId !== undefined) query = query.where('workspaces.id', '=', workspaceId);
  return Boolean(await query.executeTakeFirst());
}
