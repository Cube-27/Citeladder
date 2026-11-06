import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { adminOwnsWorkspace } from '../workspaces/owned.ts';

/** Development feature access follows the configured operator's owned workspace. */
export async function hasDevelopmentWorkspace(db: Database, workspaceId?: string) {
  const email = String(resolveSettingSpec(policy.settings.dev_login_email)).trim().toLowerCase();
  if (!email || !resolveSettingSpec(policy.settings.dev_login_password)) return false;
  return adminOwnsWorkspace(db, email, workspaceId);
}
