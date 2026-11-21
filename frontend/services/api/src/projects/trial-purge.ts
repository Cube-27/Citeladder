import { policy } from '../config.ts';
import { resolveSettingSpec } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { openReservedUnits, projectHoldsReservations } from '../entitlements/ledger.ts';
import { lockWorkspaceCapacity } from '../entitlements/occupancy.ts';
import { getLogger } from '../logging.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { lockProjectRow, removeProject } from './service.ts';

const logger = getLogger('app.projects');
const setting = (key: 'trial_data_retention_days' | 'trial_purge_workspace_batch') =>
  Number(resolveSettingSpec(policy.billing.settings[key], process.env));

export async function purgeExpiredTrialProjects(
  db: Database,
  now: Date,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!canAdmit()) return 0;
  const cutoff = new Date(now.getTime() - setting('trial_data_retention_days') * 86_400_000);
  const workspaces = await purgeCandidates(db, cutoff)
    .limit(setting('trial_purge_workspace_batch'))
    .execute();
  let purged = 0;
  for (const { workspace_id: workspaceId } of workspaces) {
    if (!canAdmit()) break;
    const projects = await db // NOSONAR
      .selectFrom('projects')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .execute();
    for (const { id: projectId } of projects) {
      const scope = { workspaceId, projectId };
      const removed = await /* NOSONAR */ retainedOnRecheck(
        db,
        async (trx) => {
          await acquireProjectLock(trx, projectId);
          if (!(await lockProjectRow(trx, scope))) return false;
          if (await projectHoldsReservations(trx, workspaceId, projectId)) return false;
          await removeProject(trx, scope);
          return true;
        },
        { workspaceId, now, cutoff },
      );
      if (!removed) continue;
      purged += 1;
      logger.info('project.trial_purged', { workspace_id: workspaceId, project_id: projectId });
    }
    const discoveries = await purgeIncompleteDiscoveries(db, workspaceId, now, cutoff); // NOSONAR
    if (discoveries === 0) continue;
    purged += discoveries;
    logger.info('brand_discovery.trial_purged', { workspace_id: workspaceId, discoveries });
  }
  return purged;
}

export function purgeCandidates(db: Database, cutoff: Date) {
  return db
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
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('pending_activations')
            .select('pending_activations.id')
            .whereRef('pending_activations.billing_account_id', '=', 'account.id')
            .where('pending_activations.status', '=', 'pending'),
        ),
      ),
    )
    .orderBy('account.workspace_id');
}

async function stillPurgeable(trx: Database, workspaceId: string, now: Date, cutoff: Date) {
  const accountId = await lockWorkspaceCapacity(trx, workspaceId);
  const access = await workspaceAccess(trx, workspaceId, now);
  if (access.status !== 'trial_expired' || !access.expires_at) return false;
  if (Date.parse(access.expires_at) > cutoff.getTime()) return false;
  const nonTrial = await trx
    .selectFrom('account_grants')
    .select('id')
    .where('billing_account_id', '=', accountId)
    .where('source_kind', '!=', 'trial')
    .executeTakeFirst();
  if (nonTrial) return false;
  const checkout = await trx
    .selectFrom('pending_activations')
    .select('id')
    .where('billing_account_id', '=', accountId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  return !checkout;
}

class Retained extends Error {}

async function retainedOnRecheck<T>(
  db: Database,
  remove: (trx: Database) => Promise<T>,
  scope: { workspaceId: string; now: Date; cutoff: Date },
): Promise<T | false> {
  try {
    return await db.transaction().execute(async (trx) => {
      const removed = await remove(trx);
      if (!removed) return removed;
      if (!(await stillPurgeable(trx, scope.workspaceId, scope.now, scope.cutoff)))
        throw new Retained();
      return removed;
    });
  } catch (error) {
    if (error instanceof Retained) return false;
    throw error;
  }
}

async function purgeIncompleteDiscoveries(
  db: Database,
  workspaceId: string,
  now: Date,
  cutoff: Date,
) {
  const deleted = await retainedOnRecheck(
    db,
    async (trx) => {
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
      const result = await trx
        .deleteFrom('brand_discoveries')
        .where('workspace_id', '=', workspaceId)
        .where('project_id', 'is', null)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
    { workspaceId, now, cutoff },
  );
  return deleted || 0;
}
