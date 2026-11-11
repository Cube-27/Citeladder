/**
 * Catalog matching in every answer (CM1) against real PostgreSQL: a brand-run
 * answer is matched against the catalog revision its audit froze, and a new
 * revision re-matches earlier answers once through the shared analytics worker.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { auditRuntime } from '../src/audits/config.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { createAudits } from '../src/audits/creation.ts';
import { persistExecutionSuccess, type ExecutionResult } from '../src/audits/result-persistence.ts';
import { categoryByName } from '../src/commerce/catalog-store.ts';
import { importCatalog } from '../src/commerce/import.ts';
import { prepareShelfExecution } from '../src/commerce/shelf.ts';
import { finalizeCommerceShelf } from '../src/commerce/shelf-metrics.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import { enqueueTask } from '../src/queue/enqueue.ts';
import { AuditQueue } from '../src/queue/audit-queue.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { auditTenant } from './audit-fixtures.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  runtime = auditRuntime({}),
  settings = loadWorkerSettings({});
const tasks: string[] = [];
afterEach(async () => {
  if (tasks.length) {
    await db.deleteFrom('execution_cost_projections').where('task_id', 'in', tasks).execute();
    await db.deleteFrom('provider_attempts').where('task_id', 'in', tasks).execute();
  }
  await fixtures.cleanup();
  tasks.length = 0;
});
afterAll(async () => {
  await db.destroy();
});

type Tenant = Awaited<ReturnType<typeof auditTenant>>;
const scopeOf = (t: Tenant) => ({ workspaceId: t.workspaceId, projectId: t.projectId });
const csv = (rows: string[]) => ['canonical_url,name,brand', ...rows].join('\n');
const ROAD = 'https://shop.example/products/road,Acme Road Runner,Acme';
const TRAIL = 'https://shop.example/products/trail,Acme Trail Climber,Acme';
const ANSWER =
  '1. Acme Road Runner for daily road miles\n2. Acme Trail Climber for rocky trails\n3. A generic foam trainer';

/** An audit (brand by default) of one prompt whose single ChatGPT answer is `answer`; the audit id. */
async function brandAnswer(t: Tenant, answer: string, auditScope: 'brand' | 'commerce' = 'brand') {
  const [auditId] = await createAudits(
    db,
    t.workspaceId,
    auditInput.parse({
      project_id: t.projectId,
      prompt_ids: [t.promptId],
      engines: ['chatgpt'],
      repetitions: 1,
      audit_scope: auditScope,
    }),
    {},
    runtime,
  );
  const queue = new AuditQueue(db, 120);
  const [claim] = await queue.claim('matching-worker', 1, { workspaceId: t.workspaceId, auditId });
  const running = await queue.markRunning(claim!, claim!.lease_owner);
  const task = running!.task;
  tasks.push(task.id);
  const result: ExecutionResult = {
    logical_engine: 'chatgpt',
    transport_provider: 'openai',
    transport_model: task.transport_model,
    answer_text: answer,
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
  return auditId!;
}

/** Each pass of the workspace with its revision number and the products it observed. */
async function passes(workspaceId: string) {
  const rows = await db
    .selectFrom('commerce_match_passes as p')
    .leftJoin('commerce_catalog_revisions as r', 'r.id', 'p.catalog_revision_id')
    .leftJoin('commerce_recommendation_observations as o', 'o.pass_id', 'p.id')
    .select([
      'p.id',
      'p.mode',
      'p.target_kind',
      'r.revision_number',
      'o.observed_product',
      'o.classification',
      'o.rank',
      'o.target_id',
    ])
    .where('p.workspace_id', '=', workspaceId)
    .orderBy('r.revision_number')
    .orderBy('o.rank')
    .execute();
  const grouped = new Map<
    string,
    { mode: string; target: string | null; revision: number | null; observed: string[] }
  >();
  for (const row of rows) {
    const pass = grouped.get(row.id) ?? {
      mode: row.mode,
      target: row.target_kind,
      revision: row.revision_number,
      observed: [],
    };
    if (row.observed_product)
      pass.observed.push(`${row.rank}:${row.classification}:${row.observed_product}`);
    grouped.set(row.id, pass);
  }
  return [...grouped.values()];
}

const matchingTasks = (workspaceId: string) =>
  db
    .selectFrom('analytics_tasks')
    .select(['id', 'payload', 'status'])
    .where('workspace_id', '=', workspaceId)
    .where('task_kind', '=', 'commerce_answer_matching')
    .orderBy('created_at')
    .execute();

/** Run the queued matching tasks of one workspace through the shared analytics worker. */
async function runMatching(workspaceId: string, taskIds: string[]) {
  await new AnalyticsWorker(db, settings, {
    owner: 'matching-test',
    taskScope: { workspaceId, taskIds },
  }).runOnce();
}

describe('catalog matching in every answer', () => {
  it('matches a brand-run answer against the catalog revision its audit froze', async () => {
    const t = await auditTenant(db, fixtures);
    await importCatalog(db, scopeOf(t), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const auditId = await brandAnswer(t, ANSWER);

    const audit = await db
      .selectFrom('audits')
      .select('configuration')
      .where('id', '=', auditId)
      .executeTakeFirstOrThrow();
    expect(audit.configuration).toMatchObject({ commerce_catalog: { revision_number: 1 } });
    // Only the span naming a catalog product is kept; no buyer prompt targets the answer.
    expect(await passes(t.workspaceId)).toEqual([
      {
        mode: 'live',
        target: null,
        revision: 1,
        observed: ['1:owned:Acme Road Runner'],
      },
    ]);
  });

  it('backfills earlier answers once per revision and keeps older passes as history', async () => {
    const t = await auditTenant(db, fixtures);
    const foreign = await auditTenant(db, fixtures);
    await brandAnswer(t, ANSWER);
    await brandAnswer(foreign, ANSWER);
    // Before any catalog the answer has nothing to match.
    expect(await passes(t.workspaceId)).toEqual([]);

    await importCatalog(db, scopeOf(t), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const [first] = await matchingTasks(t.workspaceId);
    await runMatching(t.workspaceId, [first!.id]);
    expect(await passes(t.workspaceId)).toEqual([
      { mode: 'backfill', target: null, revision: 1, observed: ['1:owned:Acme Road Runner'] },
    ]);

    // Running the same revision again records nothing new.
    const again = await enqueueTask(db, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      kind: 'commerce_answer_matching',
      payload: first!.payload as Record<string, unknown>,
      keyParts: [],
      idempotencyKey: `test:${first!.id}:again`,
    });
    await runMatching(t.workspaceId, [again!]);
    expect(await passes(t.workspaceId)).toHaveLength(1);
    // The same file again is the same import: no new revision.
    await importCatalog(db, scopeOf(t), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    expect(await matchingTasks(t.workspaceId)).toHaveLength(2);

    // A changed catalog is a new revision whose pass becomes the answer's latest.
    await importCatalog(db, scopeOf(t), {
      content: csv([ROAD, TRAIL]),
      filename: 'catalog-2.csv',
      content_type: 'text/csv',
    });
    const queued = await matchingTasks(t.workspaceId);
    await runMatching(t.workspaceId, [queued.at(-1)!.id]);
    expect(await passes(t.workspaceId)).toEqual([
      { mode: 'backfill', target: null, revision: 1, observed: ['1:owned:Acme Road Runner'] },
      {
        mode: 'backfill',
        target: null,
        revision: 2,
        observed: ['1:owned:Acme Road Runner', '2:owned:Acme Trail Climber'],
      },
    ]);
    // Another workspace's answer naming the same products is never matched.
    expect(await passes(foreign.workspaceId)).toEqual([]);
  });

  it("counts a Commerce answer's latest pass in its AI Shelf snapshot", async () => {
    const t = await auditTenant(db, fixtures);
    const shoes = (rows: string[]) =>
      ['canonical_url,name,brand,category', ...rows.map((row) => `${row},Shoes`)].join('\n');
    await importCatalog(db, scopeOf(t), {
      content: shoes([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const category = await categoryByName(db, scopeOf(t), 'Shoes');
    await db
      .insertInto('commerce_prompt_targets')
      .values({
        id: randomUUID(),
        workspace_id: t.workspaceId,
        project_id: t.projectId,
        prompt_id: t.promptId,
        target_kind: 'category',
        target_id: category.id,
        template_version: 'test',
        approved_at: new Date(),
        created_at: new Date(),
      })
      .execute();
    const auditId = await brandAnswer(t, ANSWER, 'commerce');
    // The trail shoe joins the category after the answer: revision 2 re-matches it.
    await importCatalog(db, scopeOf(t), {
      content: shoes([ROAD, TRAIL]),
      filename: 'catalog-2.csv',
      content_type: 'text/csv',
    });
    const queued = await matchingTasks(t.workspaceId);
    await runMatching(t.workspaceId, [queued.at(-1)!.id]);
    expect(await passes(t.workspaceId)).toEqual([
      {
        mode: 'live',
        target: 'category',
        revision: 1,
        observed: [
          '1:owned:Acme Road Runner',
          '2:unresolved:Acme Trail Climber for rocky trails',
          '3:unresolved:A generic foam trainer',
        ],
      },
      {
        mode: 'backfill',
        target: 'category',
        revision: 2,
        observed: [
          '1:owned:Acme Road Runner',
          '2:owned:Acme Trail Climber',
          '3:unresolved:A generic foam trainer',
        ],
      },
    ]);

    const audit = await db
      .selectFrom('audits')
      .selectAll()
      .where('workspace_id', '=', t.workspaceId)
      .where('id', '=', auditId)
      .executeTakeFirstOrThrow();
    await db.transaction().execute((trx) => finalizeCommerceShelf(trx, audit));
    const snapshot = await db
      .selectFrom('commerce_shelf_snapshots')
      .select(['successful_execution_count', 'source_observation_ids'])
      .where('workspace_id', '=', t.workspaceId)
      .where('audit_id', '=', auditId)
      .executeTakeFirstOrThrow();
    const latest = await db
      .selectFrom('commerce_recommendation_observations as o')
      .innerJoin('commerce_match_passes as p', 'p.id', 'o.pass_id')
      .select('o.id')
      .where('o.workspace_id', '=', t.workspaceId)
      .where('p.mode', '=', 'backfill')
      .execute();
    expect(latest).toHaveLength(3);
    expect(snapshot.successful_execution_count).toBe(1);
    expect(new Set(snapshot.source_observation_ids as string[])).toEqual(
      new Set(latest.map((row) => row.id)),
    );
  });

  it('refuses a revision from another workspace', async () => {
    const t = await auditTenant(db, fixtures);
    const foreign = await auditTenant(db, fixtures);
    await brandAnswer(foreign, ANSWER);
    await importCatalog(db, scopeOf(t), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const [own] = await matchingTasks(t.workspaceId);
    // The foreign workspace's task names this workspace's revision.
    const stolen = await enqueueTask(db, {
      workspaceId: foreign.workspaceId,
      projectId: foreign.projectId,
      kind: 'commerce_answer_matching',
      payload: own!.payload as Record<string, unknown>,
      keyParts: [],
      idempotencyKey: `test:${own!.id}:stolen`,
    });
    await runMatching(foreign.workspaceId, [stolen!]);
    expect(await passes(foreign.workspaceId)).toEqual([]);
    const foreignRevisions = await db
      .selectFrom('commerce_catalog_revisions')
      .select('id')
      .where('workspace_id', '=', foreign.workspaceId)
      .execute();
    expect(foreignRevisions).toEqual([]);
    // The foreign answer matches once its own catalog names the product.
    await importCatalog(db, scopeOf(foreign), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const [foreignOwn] = await matchingTasks(foreign.workspaceId).then((rows) =>
      rows.filter((row) => row.id !== stolen),
    );
    await runMatching(foreign.workspaceId, [foreignOwn!.id]);
    expect(await passes(foreign.workspaceId)).toEqual([
      { mode: 'backfill', target: null, revision: 1, observed: ['1:owned:Acme Road Runner'] },
    ]);
  });

  it('gives a project without the Commerce capability or a catalog no matching work', async () => {
    const withoutCapability = await auditTenant(db, fixtures);
    await db
      .deleteFrom('account_grants')
      .where('billing_account_id', '=', await billingAccount(db, withoutCapability.workspaceId))
      .where('key', '=', 'commerce')
      .execute();
    await importCatalog(db, scopeOf(withoutCapability), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    const withoutCatalog = await auditTenant(db, fixtures);
    for (const t of [withoutCapability, withoutCatalog]) {
      const auditId = await brandAnswer(t, ANSWER);
      const audit = await db
        .selectFrom('audits')
        .select('configuration')
        .where('id', '=', auditId)
        .executeTakeFirstOrThrow();
      expect(audit.configuration).not.toHaveProperty('commerce_catalog');
      expect(await matchingTasks(t.workspaceId)).toEqual([]);
      expect(await passes(t.workspaceId)).toEqual([]);
    }
    // The same import and answer in a qualifying project are matched.
    const qualifying = await auditTenant(db, fixtures);
    await importCatalog(db, scopeOf(qualifying), {
      content: csv([ROAD]),
      filename: 'catalog.csv',
      content_type: 'text/csv',
    });
    await brandAnswer(qualifying, ANSWER);
    expect(await matchingTasks(qualifying.workspaceId)).toHaveLength(1);
    expect((await passes(qualifying.workspaceId)).map((pass) => pass.observed)).toEqual([
      ['1:owned:Acme Road Runner'],
    ]);
  });
});
