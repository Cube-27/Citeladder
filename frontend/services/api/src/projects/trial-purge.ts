/**
 * Trial data retention: once a trial-only workspace's trial has been over for
 * the retention period, its projects are deleted, a bounded batch of
 * workspaces per pass. A workspace that ever held a non-trial grant (a plan,
 * add-on, top-up or operator override) is never purged; billing and usage
 * records survive the deletion with their source IDs.
 */
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { projectHoldsReservations } from '../entitlements/ledger.ts';
import { getLogger } from '../logging.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { removeProject } from './service.ts';

const logger = getLogger('app.projects');
const setting = (key: 'trial_data_retention_days' | 'trial_purge_workspace_batch') =>
  Number(resolveSettingSpec(policy.billing.settings[key]));

/** Delete the projects of up to a batch of long-expired trials; returns how many went. */
export async function purgeExpiredTrialProjects(
  db: Database,
  now: Date,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!canAdmit()) return 0;
  const cutoff = new Date(now.getTime() - setting('trial_data_retention_days') * 86_400_000);
  // Narrowing only: the persisted access read below is the authority.
  const workspaces = await db
    .selectFrom('billing_accounts as account')
    .select('account.workspace_id')
    .where('account.registration_origin', '=', 'public')
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('projects')
          .select('projects.id')
          .whereRef('projects.workspace_id', '=', 'account.workspace_id'),
      ),
    )
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('account_grants')
            .select('account_grants.id')
            .whereRef('account_grants.billing_account_id', '=', 'account.id')
            .where('account_grants.source_kind', '!=', 'trial'),
        ),
      ),
    )
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('account_grants')
          .select('account_grants.id')
          .whereRef('account_grants.billing_account_id', '=', 'account.id')
          .where('account_grants.source_kind', '=', 'trial')
          .where('account_grants.valid_until', '<=', cutoff),
      ),
    )
    .orderBy('account.workspace_id')
    .limit(setting('trial_purge_workspace_batch'))
    .execute();
  let purged = 0;
  for (const { workspace_id: workspaceId } of workspaces) {
    if (!canAdmit()) break;
    const access = await workspaceAccess(db, workspaceId, now);
    if (access.status !== 'trial_expired' || !access.expires_at) continue;
    if (Date.parse(access.expires_at) > cutoff.getTime()) continue;
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .execute();
    for (const { id: projectId } of projects) {
      const scope = { workspaceId, projectId };
      const removed = await db.transaction().execute(async (trx) => {
        await acquireProjectLock(trx, projectId);
        // Work still holding reserved units is retried on a later pass.
        if (await projectHoldsReservations(trx, workspaceId, projectId)) return false;
        await removeProject(trx, scope);
        return true;
      });
      if (!removed) continue;
      purged += 1;
      logger.info('project.trial_purged', { workspace_id: workspaceId, project_id: projectId });
    }
  }
  return purged;
}
