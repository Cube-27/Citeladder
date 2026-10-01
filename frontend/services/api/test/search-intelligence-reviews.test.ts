import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createReview } from '../src/search-intelligence/reviews.ts';
import { reviewBody } from '../src/routes/search-intelligence-contracts.ts';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  key = 'review-test-key';
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
async function tenant() {
  const t = await fixtures.tenant();
  await db
    .updateTable('projects')
    .set({
      website_url: 'https://www.example.com',
      serp_location_code: 2840,
      serp_language_code: 'en',
    })
    .where('id', '=', t.projectId)
    .execute();
  const id = randomUUID(),
    at = new Date();
  await db
    .insertInto('provider_connections')
    .values({
      id,
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
  return {
    ...t,
    scope: { workspace: new WorkspaceScope(t.workspaceId), projectId: t.projectId },
    connectionId: id,
  };
}
describe('atomic Search Intelligence reviews', () => {
  it('freezes one quoted paged plan under competing idempotent reviews', async () => {
    const t = await tenant(),
      input = reviewBody.parse({
        datasets: [{ kind: 'ranking_keywords', depth: 1001 }],
        save_as_defaults: true,
      });
    const runs = await Promise.all(
      [1, 2].map(() => createReview(db, t.scope, t.userId, 'same-review', input, key)),
    );
    expect(runs[0]?.id).toBe(runs[1]?.id);
    expect(runs[0]).toMatchObject({ status: 'reviewed', planned_calls: 2, planned_rows: 1001 });
    expect(Number(runs[0]?.estimated_cost_usd)).toBe(0.14412);
    expect(runs[0]?.call_plan.map((item) => (item.request as { offset: number }).offset)).toEqual([
      0, 1000,
    ]);
    await db
      .updateTable('projects')
      .set({ website_url: 'https://later.example.org' })
      .where('id', '=', t.projectId)
      .execute();
    const replay = await createReview(db, t.scope, t.userId, 'same-review', input, key);
    expect(replay.frozen_scope.owned_target).toMatchObject({ origin: 'https://www.example.com' });
    const foreign = await tenant();
    await expect(
      createReview(
        db,
        foreign.scope,
        foreign.userId,
        'foreign',
        reviewBody.parse({ connection_id: t.connectionId, datasets: [{ kind: 'footprint' }] }),
        key,
      ),
    ).rejects.toMatchObject({ code: 'dataforseo_connection_required' });
  });
  it('does unpaid resolution with no project lock and rejects a changed saved competitor', async () => {
    const t = await tenant(),
      competitorId = randomUUID();
    await db
      .insertInto('competitors')
      .values({
        id: competitorId,
        project_id: t.projectId,
        name: 'Competitor',
        aliases: JSON.stringify([]),
        domains: JSON.stringify(['example.org']),
        logo_asset_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    const input = reviewBody.parse({
      datasets: [{ kind: 'missing_keywords', competitor_id: competitorId }],
    });
    // Changing the same project from another transaction inside resolution would deadlock if the review held its lock.
    await expect(
      createReview(db, t.scope, t.userId, 'changed-target', input, key, {
        resolve: async (target) => {
          await db.transaction().execute(async (trx) => {
            await trx
              .selectFrom('projects')
              .select('id')
              .where('id', '=', t.projectId)
              .forUpdate()
              .execute();
            await trx
              .updateTable('competitors')
              .set({ domains: JSON.stringify(['example.net']) })
              .where('id', '=', competitorId)
              .execute();
          });
          return target;
        },
      }),
    ).rejects.toMatchObject({ code: 'target_changed' });
    expect(
      await db
        .selectFrom('search_intelligence_runs')
        .select('id')
        .where('workspace_id', '=', t.workspaceId)
        .execute(),
    ).toHaveLength(0);
  });
});
