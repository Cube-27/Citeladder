import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AcquisitionState,
  type PreparedResearch,
} from '../src/search-intelligence/acquisition-state.ts';
import { createReview } from '../src/search-intelligence/reviews.ts';
import { confirmRun } from '../src/search-intelligence/runs.ts';
import { reviewBody } from '../src/routes/search-intelligence-contracts.ts';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { ProviderError } from '../src/answer-engines/contracts.ts';
import { reconcileResearch } from '../src/search-intelligence/maintenance.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  key = 'state-test-key';
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
async function run() {
  const t = await fixtures.tenant({ websiteUrl: 'https://www.example.com' }),
    at = new Date(),
    connectionId = randomUUID();
  await db
    .updateTable('projects')
    .set({ serp_location_code: 2840, serp_language_code: 'en' })
    .where('id', '=', t.projectId)
    .execute();
  await db
    .insertInto('provider_connections')
    .values({
      id: connectionId,
      workspace_id: t.workspaceId,
      label: 'DFS',
      transport_provider: 'dataforseo',
      api_key_encrypted: createSecretCipher(key).encrypt(
        JSON.stringify({ login: 'test@example.com', password: 'test' }),
      ),
      base_url: '',
      credential_revision: randomUUID(),
      active: true,
      last_test_status: 'ok',
      created_at: at,
      updated_at: at,
    })
    .execute();
  const scope = { workspace: new WorkspaceScope(t.workspaceId), projectId: t.projectId };
  const review = await createReview(
    db,
    scope,
    t.userId,
    'review',
    reviewBody.parse({ datasets: [{ kind: 'ranking_keywords', depth: 2 }] }),
    key,
  );
  await confirmRun(db, scope, review.id);
  const task = await db
    .selectFrom('analytics_tasks')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .where('project_id', '=', t.projectId)
    .where('task_kind', '=', 'search_intelligence_acquisition')
    .executeTakeFirstOrThrow();
  const claimed = await db
    .updateTable('analytics_tasks')
    .set({
      status: 'running',
      lease_owner: 'research-test',
      lease_expires_at: new Date(Date.now() + 120000),
    })
    .where('id', '=', task.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  const state = new AcquisitionState(db, claimed, review.id),
    plans = await state.start();
  return { ...t, state, plans: plans!, runId: review.id, task: claimed, connectionId };
}
function dispatched(
  value: PreparedResearch,
): Extract<PreparedResearch, { action: 'dispatch' | 'publish' }> {
  if (value.action !== 'dispatch' && value.action !== 'publish')
    throw new Error('Expected a dispatch');
  return value;
}
const response = {
  body: {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        id: 'paid-task',
        cost: 0.012,
        result: [
          {
            items: [
              {
                keyword_data: { keyword: 'shoes', keyword_info: { search_volume: 12 } },
                ranked_serp_element: { url: 'https://www.example.com/shoes', rank_group: 1 },
              },
            ],
            total_count: 1,
          },
        ],
      },
    ],
  },
  hash: 'exact-response-hash',
  taskId: 'paid-task',
  cost: '0.012',
};
describe('durable paid acquisition boundaries', () => {
  it('reconciles exhausted analytics leases using saved receipts while keeping missing receipts uncertain', async () => {
    const saved = await run(),
      lost = await run();
    for (const t of [saved, lost]) {
      const prep = dispatched(await t.state.prepare(t.plans[0]!, 0));
      await t.state.dispatch(prep);
      if (t === saved) await t.state.saveResponse(prep.call.id, response);
      await db
        .updateTable('analytics_tasks')
        .set({ status: 'failed', lease_owner: null, lease_expires_at: null })
        .where('id', '=', t.task.id)
        .execute();
    }
    await reconcileResearch(db);
    expect(await saved.state.run().executeTakeFirst()).toMatchObject({
      status: 'partial',
      completed_calls: 1,
      received_rows: 1,
    });
    expect(await lost.state.run().executeTakeFirst()).toMatchObject({
      status: 'uncertain',
      uncertain_calls: 1,
    });
    await reconcileResearch(db);
    expect(await saved.state.run().executeTakeFirst()).toMatchObject({ completed_calls: 1 });
  });
  it('recovers a saved response with exact row provenance and settles it once', async () => {
    const t = await run(),
      plan = t.plans[0]!,
      prep = dispatched(await t.state.prepare(plan, 0));
    expect(await t.state.dispatch(prep)).toBe(true);
    await t.state.saveResponse(prep.call.id, response);
    expect((await t.state.prepare(plan, 0)).action).toBe('publish');
    expect(await t.state.publish(plan, prep.call.id, [])).toBe(false);
    await t.state.finish();
    expect(await t.state.run().executeTakeFirst()).toMatchObject({
      status: 'succeeded',
      completed_calls: 1,
      received_rows: 1,
      provider_reported_cost_usd: '0.01200000',
    });
    const rows = await db
      .selectFrom('search_intelligence_rows')
      .selectAll()
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      call_id: prep.call.id,
      dataset_id: prep.dataset.id,
      keyword: 'shoes',
      rank_group: 1,
    });
    expect((await t.state.prepare(plan, 0)).action).toBe('stop');
    expect(await t.state.publish(plan, prep.call.id, [])).toBe(true);
    expect(await t.state.calls().execute()).toHaveLength(1);
  });
  it('never resends a dispatched call without its receipt, including expired lease recovery', async () => {
    const t = await run(),
      plan = t.plans[0]!,
      prep = dispatched(await t.state.prepare(plan, 0));
    await t.state.dispatch(prep);
    await db
      .updateTable('analytics_tasks')
      .set({ lease_expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', t.task.id)
      .execute();
    expect((await t.state.prepare(plan, 0)).action).toBe('stop');
    await db
      .updateTable('analytics_tasks')
      .set({ lease_owner: 'recovery', lease_expires_at: new Date(Date.now() + 120000) })
      .where('id', '=', t.task.id)
      .execute();
    const state = new AcquisitionState(db, { ...t.task, lease_owner: 'recovery' }, t.runId);
    expect((await state.prepare(plan, 0)).action).toBe('stop');
    expect(await state.run().executeTakeFirst()).toMatchObject({
      status: 'uncertain',
      uncertain_calls: 1,
    });
    expect(await state.calls().executeTakeFirst()).toMatchObject({ status: 'uncertain' });
  });
  it('appends bounded explicit rate-limit retries and stops when cost is unavailable', async () => {
    const t = await run(),
      plan = t.plans[0]!;
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      const prep = dispatched(await t.state.prepare(plan, 0));
      expect(prep.ordinal).toBe(ordinal);
      await t.state.dispatch(prep);
      const result = await t.state.fail(prep, new ProviderError('rate_limit', false, 7));
      expect(result.wait !== null).toBe(ordinal <= 2);
    }
    await t.state.finish();
    expect(await t.state.run().executeTakeFirst()).toMatchObject({ status: 'partial' });
    const evidence = await db
      .selectFrom('search_intelligence_dispatch_attempts')
      .select(['phase', 'ordinal'])
      .where('call_id', '=', (await t.state.calls().executeTakeFirstOrThrow()).id)
      .execute();
    expect(evidence).toHaveLength(6);
    const other = await run(),
      prep = dispatched(await other.state.prepare(other.plans[0]!, 0));
    await other.state.dispatch(prep);
    await other.state.saveResponse(prep.call.id, { ...response, cost: null });
    expect(await other.state.publish(other.plans[0]!, prep.call.id, [])).toBe(true);
    expect(await other.state.run().executeTakeFirst()).toMatchObject({
      status: 'uncertain',
      error_code: 'provider_cost_unavailable',
    });
  });
});
