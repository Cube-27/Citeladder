/**
 * Trial data retention: once a trial-only workspace's trial has been over for
 * the retention period, its projects and incomplete brand discoveries are
 * deleted, a bounded batch of workspaces per pass. A workspace that ever held a non-trial grant (a plan,
 * add-on, top-up or operator override) is never purged; billing and usage
 * records survive the deletion with their source IDs.
 */
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { openReservedUnits, projectHoldsReservations } from '../entitlements/ledger.ts';
import { lockWorkspaceCapacity } from '../entitlements/occupancy.ts';
import { getLogger } from '../logging.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { removeProject } from './service.ts';

const logger = getLogger('app.projects');
const setting = (key: 'trial_data_retention_days' | 'trial_purge_workspace_batch') =>
  Number(resolveSettingSpec(policy.billing.settings[key]));

/**
 * Delete the projects and incomplete discoveries of up to a batch of
 * long-expired trials; returns how many projects and discoveries went.
 */
export async function purgeExpiredTrialProjects(
  db: Database,
  now: Date,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!canAdmit()) return 0;
  const cutoff = new Date(now.getTime() - setting('trial_data_retention_days') * 86_400_000);
  // Narrowing only: the locked access read below is the authority.
  const workspaces = await db
    .selectFrom('billing_accounts as account')
    .select('account.workspace_id')
    .where('account.registration_origin', '=', 'public')
    .where(({ exists, or, selectFrom }) =>
      or([
        exists(
          selectFrom('projects')
            .select('projects.id')
            .whereRef('projects.workspace_id', '=', 'account.workspace_id'),
        ),
        exists(
          selectFrom('brand_discoveries')
            .select('brand_discoveries.id')
            .whereRef('brand_discoveries.workspace_id', '=', 'account.workspace_id')
            .where('brand_discoveries.project_id', 'is', null),
        ),
      ]),
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
    // A workspace still holding reserved units waits, without starving the batch.
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('consumable_ledger')
            .select('consumable_ledger.reservation_id')
            .whereRef('consumable_ledger.workspace_id', '=', 'account.workspace_id')
            .groupBy('consumable_ledger.reservation_id')
            .having(openReservedUnits, '>', 0),
        ),
      ),
    )
    .orderBy('account.workspace_id')
    .limit(setting('trial_purge_workspace_batch'))
    .execute();
  let purged = 0;
  for (const { workspace_id: workspaceId } of workspaces) {
    if (!canAdmit()) break;
    const projects = await db // NOSONAR -- Admission is rechecked before each workspace.
      .selectFrom('projects')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .execute();
    for (const { id: projectId } of projects) {
      const scope = { workspaceId, projectId };
      const removed = await /* NOSONAR -- One project lock at a time keeps the pool free. */ db
        .transaction()
        .execute(async (trx) => {
          await acquireProjectLock(trx, projectId);
          if (!(await stillPurgeable(trx, workspaceId, now, cutoff))) return false;
          if (await projectHoldsReservations(trx, workspaceId, projectId)) return false;
          await removeProject(trx, scope);
          return true;
        });
      if (!removed) continue;
      purged += 1;
      logger.info('project.trial_purged', { workspace_id: workspaceId, project_id: projectId });
    }
    const discoveries = await purgeIncompleteDiscoveries(db, workspaceId, now, cutoff); // NOSONAR -- Admission is rechecked before each workspace.
    if (discoveries === 0) continue;
    purged += discoveries;
    logger.info('brand_discovery.trial_purged', { workspace_id: workspaceId, discoveries });
  }
  return purged;
}

/**
 * Lock the workspace's capacity and recheck its access. The capacity lock
 * serializes with grant issuance and reservations, so an upgrade or new work
 * committed before it is seen here.
 */
async function stillPurgeable(trx: Database, workspaceId: string, now: Date, cutoff: Date) {
  await lockWorkspaceCapacity(trx, workspaceId);
  const access = await workspaceAccess(trx, workspaceId, now);
  if (access.status !== 'trial_expired' || !access.expires_at) return false;
  return Date.parse(access.expires_at) <= cutoff.getTime();
}

/**
 * A discovery that never produced a project has no project to cascade from;
 * remove it and its tasks with the workspace's projects. Returns how many went.
 */
function purgeIncompleteDiscoveries(db: Database, workspaceId: string, now: Date, cutoff: Date) {
  return db.transaction().execute(async (trx) => {
    if (!(await stillPurgeable(trx, workspaceId, now, cutoff))) return 0;
    const incomplete = trx
      .selectFrom('brand_discoveries')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .where('project_id', 'is', null);
    await trx
      .deleteFrom('brand_discovery_tasks')
      .where('workspace_id', '=', workspaceId)
      .where('discovery_id', 'in', incomplete)
      .execute();
    const deleted = await trx
      .deleteFrom('brand_discoveries')
      .where('workspace_id', '=', workspaceId)
      .where('project_id', 'is', null)
      .executeTakeFirst();
    return Number(deleted.numDeletedRows);
  });
}
