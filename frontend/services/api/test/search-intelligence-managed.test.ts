import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { loadWorkerSettings } from '../src/config.ts';
import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import { reviewBody } from '../src/routes/search-intelligence-contracts.ts';
import { acquisitionExecutor } from '../src/search-intelligence/executor.ts';
import { createReview } from '../src/search-intelligence/reviews.ts';
import { cancelRun, confirmRun } from '../src/search-intelligence/runs.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { managedPlan } from './audit-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  key = 'managed-research-key',
  reference = 'platform-dataforseo',
  platformLogin = `platform-${randomUUID()}@example.com`,
  env = {
    ENCRYPTION_KEY: key,
    DATAFORSEO_PLATFORM_CREDENTIAL_REF: reference,
    DATAFORSEO_API_LOGIN: platformLogin,
    DATAFORSEO_API_PASSWORD: 'platform-secret',
  },
  connections: string[] = [],
  accounts: string[] = [];
afterAll(async () => {
  // Capacity pools outlive their connections and accounts; drop them before those go.
  await db
    .deleteFrom('provider_capacity_buckets')
    .where((eb) =>
      eb.or([
        eb('connection_id', 'in', [...connections, randomUUID()]),
        eb('billing_account_id', 'in', [...accounts, randomUUID()]),
      ]),
    )
    .execute();
  await fixtures.cleanup();
  await db.destroy();
});

/** The platform's DataForSEO account, held by the system workspace. */
async function platformAccount() {
  const workspaceId = await fixtures.systemWorkspace(),
    at = new Date();
  await db
    .insertInto('provider_connections')
    .values({
      id: randomUUID(),
      workspace_id: workspaceId,
      label: 'Platform DataForSEO',
      transport_provider: 'dataforseo',
      credential_source: 'platform',
      platform_credential_ref: reference,
      api_key_encrypted: '',
      base_url: '',
      credential_revision: randomUUID(),
      active: true,
      last_test_status: 'ok',
      created_at: at,
      updated_at: at,
    })
    .execute();
}
const platform = platformAccount();

/** A project ready for research; managed workspaces have no DataForSEO key of their own. */
async function workspace(mode: 'managed' | 'byok') {
  await platform;
  const t = await fixtures.tenant({ websiteUrl: 'https://www.example.com' });
  await db
    .updateTable('projects')
    .set({ serp_location_code: 2840, serp_language_code: 'en' })
    .where('id', '=', t.projectId)
    .execute();
  if (mode === 'managed') accounts.push(await managedPlan(db, t.workspaceId));
  else {
    const at = new Date(),
      id = randomUUID();
    connections.push(id);
    await db
      .insertInto('provider_connections')
      .values({
        id,
        workspace_id: t.workspaceId,
        label: 'Own DataForSEO',
        transport_provider: 'dataforseo',
        api_key_encrypted: createSecretCipher(key).encrypt(
          JSON.stringify({ login: 'own@example.com', password: 'own' }),
        ),
        base_url: '',
        credential_revision: randomUUID(),
        active: true,
        last_test_status: 'ok',
        created_at: at,
        updated_at: at,
      })
      .execute();
  }
  const scope = { workspace: new WorkspaceScope(t.workspaceId), projectId: t.projectId };
  // Two ranked keywords: one $0.012 task plus two $0.00012 items, $0.01224 (B40: 16 credits).
  const review = await createReview(
    db,
    scope,
    t.userId,
    `review-${randomUUID()}`,
    reviewBody.parse({ datasets: [{ kind: 'ranking_keywords', depth: 2 }] }),
    key,
    { env },
  );
  return { ...t, scope, review };
}

function worker(send: typeof fetch) {
  return new AnalyticsWorker(db, loadWorkerSettings(), {
    executors: { search_intelligence_acquisition: acquisitionExecutor({ send, env }) },
  });
}
const receipt = (cost: number) =>
  Response.json({
    status_code: 20000,
    tasks: [{ status_code: 20000, id: 'receipt', cost, result: [{ items: [], total_count: 0 }] }],
  });
const runRow = (id: string) =>
  db
    .selectFrom('search_intelligence_runs')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
/** Works the analysis until it ends; the shared platform account paces its requests. */
async function runToEnd(id: string, send: typeof fetch) {
  const research = worker(send);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await research.runOnce();
    if (!['queued', 'running'].includes((await runRow(id)).status)) return;
    await sleep(100);
  }
}
const platformCall = (id: string | null) =>
  db
    .selectFrom('platform_calls')
    .select(['status', 'reserved_credits', 'credits', 'cost_microusd'])
    .where('id', '=', id ?? randomUUID())
    .executeTakeFirst();

describe('managed Search Intelligence', () => {
  it('researches on the platform account and charges the DataForSEO cost in AI credits', async () => {
    const t = await workspace('managed');
    expect(t.review).toMatchObject({
      credential_mode: 'funded',
      estimated_credits: 16,
      estimated_cost_usd: null,
      charged_credits: null,
    });
    expect(t.review.call_plan[0]).not.toHaveProperty('estimated_cost_usd');
    expect(t.review.frozen_scope).not.toHaveProperty('connection_id');

    const confirmed = await confirmRun(db, t.scope, t.review.id);
    expect(await platformCall((await runRow(confirmed.id)).platform_call_id)).toMatchObject({
      status: 'reserved',
      reserved_credits: 16,
    });

    const authorizations: (string | null)[] = [];
    await worker(async (_url, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));
      return receipt(0.0061);
    }).runOnce();

    const platformAuthorization = `Basic ${Buffer.from(`${platformLogin}:platform-secret`).toString('base64')}`;
    expect(authorizations).toEqual([platformAuthorization]);
    // $0.0061 × 1.3 = 7.93 credits, rounded up.
    const settled = await runRow(confirmed.id);
    expect(settled).toMatchObject({ status: 'succeeded', charged_credits: 8 });
    expect(await platformCall(settled.platform_call_id)).toEqual({
      status: 'settled',
      reserved_credits: 16,
      credits: 8,
      cost_microusd: '6100',
    });
  });

  it('never bills a request that failed or went unanswered', async () => {
    const refused = await workspace('managed');
    const refusedRun = await confirmRun(db, refused.scope, refused.review.id);
    await runToEnd(refusedRun.id, async () => new Response('bad request', { status: 400 }));
    expect(await runRow(refusedRun.id)).toMatchObject({ charged_credits: 0 });

    const unanswered = await workspace('managed');
    const unansweredRun = await confirmRun(db, unanswered.scope, unanswered.review.id);
    await runToEnd(unansweredRun.id, async () => {
      throw new TypeError('connection reset');
    });
    const settled = await runRow(unansweredRun.id);
    expect(settled).toMatchObject({ charged_credits: 0 });
    expect(await platformCall(settled.platform_call_id)).toMatchObject({
      status: 'settled',
      credits: 0,
    });
  });

  it('refuses to confirm an analysis the AI credit balance cannot cover, fetching nothing', async () => {
    const t = await workspace('managed');
    await grant(db, await billingAccount(db, t.workspaceId), { key: 'ai_credits', value: 15 });
    await expect(confirmRun(db, t.scope, t.review.id)).rejects.toMatchObject({
      status: 403,
      code: 'ai_credits_exhausted',
    });
    expect(await runRow(t.review.id)).toMatchObject({
      status: 'reviewed',
      confirmed_at: null,
      platform_call_id: null,
    });
  });

  it('releases the whole hold when a managed analysis is cancelled before any request', async () => {
    const t = await workspace('managed');
    await confirmRun(db, t.scope, t.review.id);
    const cancelled = await cancelRun(db, t.scope, t.review.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', charged_credits: 0 });
    expect(await platformCall((await runRow(t.review.id)).platform_call_id)).toMatchObject({
      status: 'settled',
      credits: 0,
    });
  });

  it('keeps a BYOK analysis on the workspace key, priced in dollars and never charged credits', async () => {
    const t = await workspace('byok');
    expect(t.review).toMatchObject({
      credential_mode: 'byok',
      estimated_cost_usd: '0.01224000',
      estimated_credits: null,
    });
    await confirmRun(db, t.scope, t.review.id);
    const authorizations: (string | null)[] = [];
    await worker(async (_url, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));
      return receipt(0.0061);
    }).runOnce();
    expect(authorizations).toEqual([
      `Basic ${Buffer.from('own@example.com:own').toString('base64')}`,
    ]);
    expect(await runRow(t.review.id)).toMatchObject({
      status: 'succeeded',
      platform_call_id: null,
      charged_credits: null,
    });
  });
});
