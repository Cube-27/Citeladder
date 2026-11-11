/**
 * The Products table read against real PostgreSQL: per-holder metrics over
 * the latest match pass of each answer in scope, the catalog/all switch, the
 * window, engine, prompt-set, category and search filters, keyset paging and
 * workspace isolation. Answers go through the real audit, matching and
 * persistence path; only quoted prices and merchants are set on the stored
 * observations afterwards, since text answers rarely carry both.
 */
import { randomUUID } from 'node:crypto';
import type { CommerceProductPage } from '@citeladder/contracts/commerce-suite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { createAudits } from '../src/audits/creation.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { persistExecutionSuccess, type ExecutionResult } from '../src/audits/result-persistence.ts';
import { importCatalog } from '../src/commerce/import.ts';
import { prepareShelfExecution } from '../src/commerce/shelf.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import { AuditQueue } from '../src/queue/audit-queue.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { auditTenant } from './audit-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  // Four answers stay in four active audits; the per-workspace cap is not under test.
  runtime = { ...auditRuntime({}), activeLimit: 10 },
  config = testConfig(),
  app = createApp(config, db);
const tasks: string[] = [];

type Tenant = Awaited<ReturnType<typeof auditTenant>>;
const CATALOG = [
  'canonical_url,name,brand,price,currency,category',
  'https://shop.example/products/road,Acme Road Runner,Acme,120,USD,Road',
  'https://shop.example/products/trail,Acme Trail Climber,Acme,,,Trail',
].join('\n');

/** One brand-run audit whose single ChatGPT answer is `answer`; its task id. */
async function answer(t: Tenant, text: string): Promise<string> {
  const [auditId] = await createAudits(
    db,
    t.workspaceId,
    auditInput.parse({
      project_id: t.projectId,
      prompt_ids: [t.promptId],
      engines: ['chatgpt'],
      repetitions: 1,
      audit_scope: 'brand',
    }),
    {},
    runtime,
  );
  const queue = new AuditQueue(db, 120);
  const [claim] = await queue.claim('products-worker', 1, { workspaceId: t.workspaceId, auditId });
  const running = await queue.markRunning(claim!, claim!.lease_owner);
  const task = running!.task;
  tasks.push(task.id);
  const result: ExecutionResult = {
    logical_engine: 'chatgpt',
    transport_provider: 'openai',
    transport_model: task.transport_model,
    answer_text: text,
    search_used: false,
    search_events: [],
    finish_reason: 'stop',
    raw_finish_reason: 'stop',
    latency_ms: 1,
    provider_metadata: {},
    retrieved_sources: null,
    citations: [],
    normalized_usage: {
      uncached_input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      reasoning_tokens: null,
      total_tokens: null,
      web_search_requests: null,
      provider_cost_microusd: null,
    },
  };
  const derive = await prepareShelfExecution(db, task, result, null);
  await persistExecutionSuccess(db, task, claim!.lease_owner, result, derive);
  return task.id;
}

async function candidate(t: Tenant, values: { name: string; state: string; source: string }) {
  const product = await db
    .selectFrom('commerce_products')
    .select('id')
    .where('workspace_id', '=', t.workspaceId)
    .where('name', '=', 'Acme Road Runner')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('commerce_competitor_candidates')
    .values({
      id: randomUUID(),
      workspace_id: t.workspaceId,
      project_id: t.projectId,
      target_kind: 'product',
      target_id: product.id,
      canonical_url: `https://rival.example/products/${values.name.toLowerCase().replaceAll(' ', '-')}`,
      product_name: values.name,
      brand_name: values.name.split(' ')[0]!,
      evidence: '{}',
      source_kind: values.source,
      state: values.state,
      created_at: new Date(),
    })
    .execute();
}

/** The quote and merchant on one task's observation of a product. */
async function quote(task: string, product: string, price: string, currency: string, host: string) {
  await db
    .updateTable('commerce_recommendation_observations')
    .set({ observed_price: price, observed_currency: currency, merchant_domain: host })
    .where('task_id', '=', task)
    .where('observed_product', '=', product)
    .execute();
}

async function read(t: Tenant, query = '', workspace = t.workspaceId) {
  const token = await sessionToken({ sub: t.userId, ver: 0 });
  const response = await app.request(
    `/api/v1/projects/${t.projectId}/commerce/products${query ? `?${query}` : ''}`,
    {
      headers: {
        'x-workspace-id': workspace,
        cookie: `${config.session.cookieName}=${token}`,
      },
    },
  );
  return { status: response.status, body: (await response.json()) as CommerceProductPage };
}

const summary = (page: CommerceProductPage) =>
  page.items.map((row) => [
    row.name,
    row.kind,
    row.appearances,
    row.visibility,
    row.win_rate,
    row.position,
  ]);

let t: Tenant;
let foreign: Tenant;
let trailCategory: string;

beforeAll(async () => {
  t = await auditTenant(db, fixtures);
  foreign = await auditTenant(db, fixtures);
  for (const tenant of [t, foreign])
    await importCatalog(
      db,
      { workspaceId: tenant.workspaceId, projectId: tenant.projectId },
      { content: CATALOG, filename: 'catalog.csv', content_type: 'text/csv' },
    );
  // Approved competitors enter the next audit's catalog revision; the others
  // are listed by state alone (AI-observed pending) or not at all.
  await candidate(t, { name: 'Rival Pacer', state: 'approved', source: 'provider' });
  await candidate(t, { name: 'Zoom Glide', state: 'pending', source: 'ai_observed' });
  await candidate(t, { name: 'Dropped Dash', state: 'rejected', source: 'ai_observed' });
  await candidate(t, { name: 'Unreviewed Racer', state: 'pending', source: 'provider' });

  const first = await answer(
    t,
    '1. Acme Road Runner for daily miles\n2. Rival Pacer for tempo days\n3. Acme Trail Climber for rocky trails',
  );
  // Asked of another engine, so the engine filter has something to drop.
  const second = await answer(
    t,
    '1. Rival Pacer is the best value\n2. Acme Road Runner close behind',
  );
  // Older than 30 days, so only the 90-day window holds it.
  const third = await answer(t, '1. Acme Road Runner for long road runs');
  await answer(t, 'Most runners should get a gait analysis before buying anything new.');
  await answer(foreign, '1. Acme Road Runner for daily miles');
  await db
    .updateTable('audit_tasks')
    .set({ logical_engine: 'gemini' })
    .where('id', '=', second)
    .execute();
  await db
    .updateTable('audit_tasks')
    .set({ completed_at: new Date(Date.now() - 40 * 86_400_000) })
    .where('id', '=', third)
    .execute();
  await quote(first, 'Acme Road Runner', '110', 'USD', 'runnerstore.com');
  await quote(second, 'Acme Road Runner', '130', 'USD', 'runnerstore.com');
  await quote(third, 'Acme Road Runner', '99', 'EUR', 'shoes.example.eu');
  trailCategory = (
    await db
      .selectFrom('commerce_categories')
      .select('id')
      .where('workspace_id', '=', t.workspaceId)
      .where('name', '=', 'Trail')
      .executeTakeFirstOrThrow()
  ).id;
});

afterAll(async () => {
  if (tasks.length) {
    await db.deleteFrom('execution_cost_projections').where('task_id', 'in', tasks).execute();
    await db.deleteFrom('provider_attempts').where('task_id', 'in', tasks).execute();
  }
  await fixtures.cleanup();
  await db.destroy();
});

describe('Products table read', () => {
  it('reads each catalog product’s metrics over every answer in the window', async () => {
    const { status, body } = await read(t, 'window=90');
    expect(status).toBe(200);
    expect(body).toMatchObject({ window_days: 90, executions: 4, total: 2, next_cursor: null });
    expect(summary(body)).toEqual([
      ['Acme Road Runner', 'owned', 3, 0.75, 2 / 3, 4 / 3],
      ['Acme Trail Climber', 'owned', 1, 0.25, 0, 3],
    ]);
    const [road, trail] = body.items;
    // Median of the USD quotes; the EUR quote is counted, not converted.
    expect(road!.mentioned_price).toEqual({
      median: 120,
      currency: 'USD',
      quoted: 2,
      other_currency: 1,
    });
    expect(road!.catalog_price).toEqual({ min: 120, max: 120, currency: 'USD' });
    expect(road!.merchants).toEqual([
      { domain: 'runnerstore.com', count: 2 },
      { domain: 'shoes.example.eu', count: 1 },
    ]);
    expect(trail).toMatchObject({
      category_ids: [trailCategory],
      catalog_price: null,
      mentioned_price: { median: null, currency: '', quoted: 0, other_currency: 0 },
      merchants: [],
    });
  });

  it('adds approved and AI-observed competitors under All products', async () => {
    const { body } = await read(t, 'window=90&source=all');
    expect(summary(body)).toEqual([
      ['Acme Road Runner', 'owned', 3, 0.75, 2 / 3, 4 / 3],
      ['Rival Pacer', 'approved_competitor', 2, 0.5, 0.5, 1.5],
      ['Acme Trail Climber', 'owned', 1, 0.25, 0, 3],
      ['Zoom Glide', 'ai_observed_competitor', 0, 0, null, null],
    ]);
  });

  it('narrows the executions by window, engine and prompt set', async () => {
    const thirty = await read(t, 'window=30');
    expect(thirty.body.executions).toBe(3);
    expect(summary(thirty.body)[0]).toEqual(['Acme Road Runner', 'owned', 2, 2 / 3, 0.5, 1.5]);

    const chatgpt = await read(t, 'window=90&engine=chatgpt');
    expect(chatgpt.body.executions).toBe(3);
    expect(summary(chatgpt.body)[0]).toEqual(['Acme Road Runner', 'owned', 2, 2 / 3, 1, 1]);

    // No execution in scope: visibility is unavailable, appearances a real zero.
    const none = await read(t, `window=90&prompt_set=${randomUUID()}`);
    expect(none.body.executions).toBe(0);
    expect(summary(none.body)).toEqual([
      ['Acme Road Runner', 'owned', 0, null, null, null],
      ['Acme Trail Climber', 'owned', 0, null, null, null],
    ]);
    const own = await read(t, `window=90&prompt_set=${t.setId}`);
    expect(own.body.executions).toBe(4);
  });

  it('filters holders by category and search, and sorts by the chosen metric', async () => {
    const trail = await read(t, `window=90&source=all&category=${trailCategory}`);
    expect(trail.body.items.map((row) => row.name)).toEqual(['Acme Trail Climber']);
    const search = await read(t, 'window=90&source=all&q=PACER');
    expect(search.body.items.map((row) => row.name)).toEqual(['Rival Pacer']);
    const position = await read(t, 'window=90&source=all&sort=position');
    expect(position.body.items.map((row) => row.name)).toEqual([
      'Acme Road Runner',
      'Rival Pacer',
      'Acme Trail Climber',
      'Zoom Glide',
    ]);
    const name = await read(t, 'window=90&source=all&sort=name');
    expect(name.body.items.map((row) => row.name)).toEqual([
      'Acme Road Runner',
      'Acme Trail Climber',
      'Rival Pacer',
      'Zoom Glide',
    ]);
  });

  it('pages by keyset cursor and refuses a cursor from other filters', async () => {
    const names: string[] = [];
    let cursor: string | null = null;
    do {
      const page: CommerceProductPage = (
        await read(
          t,
          `window=90&source=all&sort=win_rate&limit=1${cursor ? `&cursor=${cursor}` : ''}`,
        )
      ).body;
      expect(page.total).toBe(4);
      names.push(...page.items.map((row) => row.name));
      cursor = page.next_cursor;
    } while (cursor);
    expect(names).toEqual(['Acme Road Runner', 'Rival Pacer', 'Acme Trail Climber', 'Zoom Glide']);

    const first = await read(t, 'window=90&source=all&sort=win_rate&limit=1');
    const replayed = await read(
      t,
      `window=90&source=catalog&sort=win_rate&limit=1&cursor=${first.body.next_cursor}`,
    );
    expect(replayed.status).toBe(422);
    // The same filters in another project refuse the cursor too.
    const elsewhere = await read(
      foreign,
      `window=90&source=all&sort=win_rate&limit=1&cursor=${first.body.next_cursor}`,
    );
    expect(elsewhere.status).toBe(422);
    expect((await read(t, 'window=14')).status).toBe(422);
  });

  it('counts each answer once, through the pass of the latest catalog revision', async () => {
    const later = await auditTenant(db, fixtures);
    const scope = { workspaceId: later.workspaceId, projectId: later.projectId };
    const [header, road, trail] = CATALOG.split('\n');
    await importCatalog(db, scope, {
      content: [header, road].join('\n'),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    // Revision 1 knows only the road shoe, so the live pass misses the trail shoe.
    await answer(later, '1. Acme Road Runner for daily miles\n2. Acme Trail Climber for trails');
    await importCatalog(db, scope, {
      content: [header, road, trail].join('\n'),
      filename: 'catalog-2.csv',
      content_type: 'text/csv',
    });
    const matching = await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('workspace_id', '=', later.workspaceId)
      .where('task_kind', '=', 'commerce_answer_matching')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    await new AnalyticsWorker(db, loadWorkerSettings({}), {
      owner: 'products-test',
      taskScope: { workspaceId: later.workspaceId, taskIds: [matching.id] },
    }).runOnce();

    const { body } = await read(later, 'window=90');
    expect(body.executions).toBe(1);
    expect(summary(body)).toEqual([
      ['Acme Road Runner', 'owned', 1, 1, 1, 1],
      ['Acme Trail Climber', 'owned', 1, 1, 0, 2],
    ]);
  });

  it('reads only the authorized workspace’s answers and holders', async () => {
    const theirs = await read(foreign, 'window=90&source=all');
    expect(theirs.body.executions).toBe(1);
    expect(summary(theirs.body)).toEqual([
      ['Acme Road Runner', 'owned', 1, 1, 1, 1],
      ['Acme Trail Climber', 'owned', 0, 0, null, null],
    ]);
    // Another workspace's header never reaches this project.
    expect((await read(t, '', foreign.workspaceId)).status).toBe(404);
  });
});
