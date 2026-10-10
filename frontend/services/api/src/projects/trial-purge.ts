/**
 * Trial data retention: once a trial-only workspace's trial has been over for
 * the retention period, its projects are deleted, a bounded batch per pass.
 * A workspace that ever held a non-trial grant (a plan, add-on, top-up or
 * operator override) is never purged; billing and usage records survive the
 * deletion, unlinked from the deleted work.
 */
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { getLogger } from '../logging.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { ApiError } from '../errors.ts';
import { removeProject } from './service.ts';

const logger = getLogger('app.projects');

/** Delete up to `batch` projects of long-expired trials; returns how many went. */
export async function purgeExpiredTrialProjects(
  db: Database,
  now: Date,
  batch: number,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!canAdmit()) return 0;
  const days = Number(resolveSettingSpec(policy.billing.settings.trial_data_retention_days));
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const candidates = await db
    .selectFrom('projects')
    .innerJoin('billing_accounts as account', 'account.workspace_id', 'projects.workspace_id')
    .select(['projects.id', 'projects.workspace_id'])
    .where('account.registration_origin', '=', 'public')
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
    .orderBy('projects.created_at')
    .limit(batch)
    .execute();
  let purged = 0;
  for (const project of candidates) {
    if (!canAdmit()) break;
    // The persisted access read is the authority; the SQL above only narrows.
    const access = await workspaceAccess(db, project.workspace_id, now);
    if (access.status !== 'trial_expired' || !access.expires_at) continue;
    if (Date.parse(access.expires_at) > cutoff.getTime()) continue;
    try {
      await db.transaction().execute(async (trx) => {
        await acquireProjectLock(trx, project.id);
        await removeProject(trx, { workspaceId: project.workspace_id, projectId: project.id });
      });
      purged += 1;
      logger.info('project.trial_purged', {
        workspace_id: project.workspace_id,
        project_id: project.id,
      });
    } catch (error) {
      // Work still holding reserved units is retried on a later pass.
      if (error instanceof ApiError && error.status === 409) continue;
      throw error;
    }
  }
  return purged;
}
