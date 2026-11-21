import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql, type Transaction } from 'kysely';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { DB } from '../src/generated/db-schema.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { openReservedUnits } from '../src/entitlements/ledger.ts';
import { deleteProject } from '../src/projects/service.ts';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import { reviewBody } from '../src/routes/search-intelligence-contracts.ts';
import { AcquisitionState } from '../src/search-intelligence/acquisition-state.ts';
import { settleResearchCharge } from '../src/search-intelligence/charges.ts';
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
async function runToEnd(id: string, send: typeof fetch) {
  const run = await runRow(id);
  const research = new AnalyticsWorker(db, loadWorkerSettings(), {
    executors: { search_intelligence_acquisition: acquisitionExecutor({ send, env }) },
    taskScope: { workspaceId: run.workspace_id, taskIds: [run.analytics_task_id!] },
  });
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
async function preparedDispatch() {
  const t = await workspace('managed');
  const confirmed = await confirmRun(db, t.scope, t.review.id);
  const task = await db
    .updateTable('analytics_tasks')
    .set({
      status: 'running',
      lease_owner: 'research-test',
      lease_expires_at: new Date(Date.now() + 120000),
    })
    .where('id', '=', (await runRow(confirmed.id)).analytics_task_id!)
    .returningAll()
    .executeTakeFirstOrThrow();
  const state = new AcquisitionState(db, task, confirmed.id);
  const plan = (await state.start())![0]!;
  const prepared = await state.prepare(plan, 0);
  if (prepared.action !== 'dispatch')
    throw new Error(`Expected a dispatch, got ${prepared.action}`);
  return { t, runId: confirmed.id, state, plan, prepared };
}

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
    await runToEnd(confirmed.id, async (_url, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));
      return receipt(0.0061);
    });

    const platformAuthorization = `Basic ${Buffer.from(`${platformLogin}:platform-secret`).toString('base64')}`;
    expect(authorizations).toEqual([platformAuthorization]);
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

  it('ends the run and settles its hold when the member loses access just before a dispatch', async () => {
    const { t, runId, state, prepared } = await preparedDispatch();
    const member = db
      .updateTable('workspace_members')
      .where('workspace_id', '=', t.workspaceId)
      .where('user_id', '=', t.userId);
    await member.set({ role: 'viewer' }).execute();

    expect(await state.dispatch(prepared)).toBe(false);
    await settleResearchCharge(db, { workspaceId: t.workspaceId, runId });
    const ended = await runRow(runId);
    expect(ended).toMatchObject({
      status: 'failed',
      error_code: 'connection_changed',
      charged_credits: 0,
    });
    expect(await platformCall(ended.platform_call_id)).toMatchObject({
      status: 'settled',
      credits: 0,
    });

    await member.set({ role: 'owner' }).execute();
    const next = await createReview(
      db,
      t.scope,
      t.userId,
      `review-${randomUUID()}`,
      reviewBody.parse({ datasets: [{ kind: 'ranking_keywords', depth: 2 }] }),
      key,
      { env },
    );
    expect(await confirmRun(db, t.scope, next.id)).toMatchObject({ status: 'queued' });
  });

  it('bills a late receipt of a call marked uncertain while its reporting window is open', async () => {
    async function uncertainCall() {
      const { t, runId, state, plan, prepared } = await preparedDispatch();
      expect(await state.dispatch(prepared)).toBe(true);
      expect(await state.prepare(plan, 0)).toEqual({ action: 'stop' });
      return { t, runId, state, callId: prepared.call.id };
    }

    const late = await uncertainCall();
    const key = { workspaceId: late.t.workspaceId, runId: late.runId };
    expect(await runRow(late.runId)).toMatchObject({ status: 'uncertain' });
    expect(await settleResearchCharge(db, key)).toBeNull();
    await late.state.saveResponse(late.callId, {
      body: { items: [] },
      hash: 'receipt-hash',
      taskId: 'late-receipt',
      cost: '0.0061',
    });
    expect(await settleResearchCharge(db, key)).toMatchObject({ charged_credits: 8 });
    expect(await platformCall((await runRow(late.runId)).platform_call_id)).toMatchObject({
      status: 'settled',
      credits: 8,
    });

    const lost = await uncertainCall();
    const afterWindow = new Date(Date.now() + 181_000);
    expect(
      await settleResearchCharge(
        db,
        { workspaceId: lost.t.workspaceId, runId: lost.runId },
        afterWindow,
      ),
    ).toMatchObject({ charged_credits: 0 });
  });

  it('refuses to delete a project while its managed analysis holds credits', async () => {
    const t = await workspace('managed');
    await grant(db, await billingAccount(db, t.workspaceId), {
      key: 'project_deletion',
      value: 1,
    });
    const project = { workspaceId: t.workspaceId, projectId: t.projectId };
    await confirmRun(db, t.scope, t.review.id);
    await expect(deleteProject(db, project)).rejects.toMatchObject({
      status: 409,
      code: 'project_work_running',
    });

    await cancelRun(db, t.scope, t.review.id);
    await deleteProject(db, project);
    expect(
      await db.selectFrom('projects').select('id').where('id', '=', t.projectId).execute(),
    ).toEqual([]);
    const reserved = await db
      .selectFrom('consumable_ledger')
      .select(openReservedUnits.as('units'))
      .where('workspace_id', '=', t.workspaceId)
      .executeTakeFirstOrThrow();
    expect(Number(reserved.units)).toBe(0);
  });

  it('refuses a deletion that waited behind a confirmation holding the project', async () => {
    const t = await workspace('managed');
    await grant(db, await billingAccount(db, t.workspaceId), {
      key: 'project_deletion',
      value: 1,
    });
    const project = { workspaceId: t.workspaceId, projectId: t.projectId };
    const locked = Promise.withResolvers<number>();
    const proceed = Promise.withResolvers<void>();
    const transaction = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      const builder = transaction();
      const execute = builder.execute.bind(builder);
      builder.execute = <T>(work: (trx: Transaction<DB>) => Promise<T>) =>
        execute(async (trx) => {
          await trx
            .selectFrom('projects')
            .select('id')
            .where('id', '=', t.projectId)
            .forUpdate()
            .execute();
          const backend = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
          locked.resolve(backend.rows[0]!.pid);
          await proceed.promise;
          return work(trx);
        });
      return builder;
    });
    try {
      const confirmation = confirmRun(db, t.scope, t.review.id);
      const confirming = await locked.promise;
      const deletion = deleteProject(db, project).catch((error: unknown) => error);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${confirming} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 2000, interval: 20 },
      );
      proceed.resolve();
      expect(await confirmation).toMatchObject({ status: 'queued' });
      expect(await deletion).toMatchObject({ status: 409, code: 'project_work_running' });
    } finally {
      proceed.resolve();
      spy.mockRestore();
    }

    expect(await cancelRun(db, t.scope, t.review.id)).toMatchObject({
      status: 'cancelled',
      charged_credits: 0,
    });
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
    await runToEnd(t.review.id, async (_url, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));
      return receipt(0.0061);
    });
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
