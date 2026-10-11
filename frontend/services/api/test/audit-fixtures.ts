import type { Database } from '../src/db/database.ts';
import { createConnection } from '../src/providers/connections.ts';
import { createConnectionInput } from '../src/providers/inputs.ts';
import { providerSettings } from '../src/providers/config.ts';
import { probeConnection } from '../src/providers/probes.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { randomUUID } from 'node:crypto';
import { billingAccount, prompt, promptSet } from './prompt-fixtures.ts';

export const auditTestKey = 'audit-freeze-test-encryption-key';
export async function auditTenant(db: Database, fixtures: VisibilityFixtures) {
  const t = await fixtures.tenant();
  await fixtures.brand(t.projectId, 'Acme Running');
  await db
    .updateTable('projects')
    .set({ benchmark_mode: 'consumer_like', serp_location_code: 2840 })
    .where('id', '=', t.projectId)
    .execute();
  const setId = await promptSet(db, t.projectId);
  const promptId = await prompt(db, setId, 'Which running shoes suit road use?');
  const providers = providerSettings({});
  const connection = await createConnection(
    db,
    t.workspaceId,
    t.userId,
    createConnectionInput.parse({
      transport_provider: 'openai',
      api_key: 'test-key',
      routes: [{ logical_engine: 'chatgpt' }],
    }),
    auditTestKey,
    providers,
  );
  await probeConnection(db, t.workspaceId, connection.id, auditTestKey, providers, async () => ({
    status: 200,
    body: { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'ok' }] }] },
  }));
  return { ...t, setId, promptId, connectionId: connection.id };
}

/** Puts the workspace on a live managed (platform-key) plan, as a paid managed checkout does. */
export async function managedPlan(db: Database, workspaceId: string) {
  const accountId = await billingAccount(db, workspaceId);
  const now = new Date();
  await db
    .insertInto('billing_subscriptions')
    .values({
      id: randomUUID(),
      billing_account_id: accountId,
      provider: 'razorpay',
      provider_mode: 'test',
      external_subscription_id: `sub_${randomUUID().replaceAll('-', '')}`,
      external_price_id: 'plan_fixture',
      subscription_kind: 'base',
      catalog_key: 'tier_1',
      catalog_revision: 'fixture',
      credential_mode: 'funded',
      quantity: 1,
      currency: 'USD',
      cadence: 'monthly',
      status: 'active',
      is_current: true,
      current_period_start: now,
      current_period_end: new Date(now.getTime() + 30 * 86_400_000),
      cancel_at_period_end: false,
      provider_state_version: 1,
      ended_at: null,
      frozen_terms: '{}',
      scheduled_change: null,
      reconciliation_lease_token: null,
      reconciliation_lease_expires_at: null,
      reconciliation_next_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return accountId;
}
