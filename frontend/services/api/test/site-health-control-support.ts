import type { Database } from '../src/db/database.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { FinalizeFixtures } from './site-health-finalize-fixtures.ts';
import { asOwner } from './support.ts';
import type { Tenant } from './visibility-fixtures.ts';

export function controlHarness(db: Database) {
  const fixtures = new FinalizeFixtures(db);
  const accounts: string[] = [];
  return {
    fixtures,
    async allow(tenant: Tenant, limit: number, fetches?: number) {
      const account = await billingAccount(db, tenant.workspaceId);
      accounts.push(account);
      await grant(db, account, { key: 'monitored_urls', value: limit });
      if (fetches !== undefined)
        await grant(db, account, { key: 'site_health_page_fetches_per_period', value: fetches });
      return account;
    },
    create(tenant: Tenant, options: Record<string, unknown> = {}) {
      return db
        .transaction()
        .execute((trx) =>
          createCrawl(trx, tenant.workspaceId, { project_id: tenant.projectId, ...options }),
        );
    },
    async cleanup() {
      if (accounts.length) {
        await asOwner((owner) =>
          owner
            .deleteFrom('consumable_ledger')
            .where('billing_account_id', 'in', accounts)
            .execute(),
        );
        await db.deleteFrom('billing_accounts').where('id', 'in', accounts).execute();
      }
      await fixtures.cleanup();
    },
  };
}
