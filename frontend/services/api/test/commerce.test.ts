import { randomUUID } from 'node:crypto';
import type {
  BuyerPrompt,
  CatalogImport,
  CommerceCatalog,
  CompetitorCandidate,
  CompetitorDiscoveryTask,
  Shelf,
} from '@citeladder/contracts/commerce-suite';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { commerceIsland } from './commerce-support.ts';
import { freezeCommerceContext } from '../src/commerce/audit-context.ts';
import { enqueue } from './referral-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const config = testConfig();
const app = createApp(config, db);
let t: Tenant;
const tenants: Tenant[] = [];
beforeEach(async () => {
  t = await fixtures.tenant();
  tenants.push(t);
});
afterAll(async () => {
  for (const tenant of tenants)
    await db
      .deleteFrom('commerce_recommendation_observations')
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
  for (const tenant of tenants)
    await db
      .deleteFrom('commerce_shelf_snapshots')
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
  await fixtures.cleanup();
  await db.destroy();
});

async function call<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    user?: string;
    workspace?: string;
    anonymous?: boolean;
  } = {},
) {
  const token = await sessionToken({ sub: options.user ?? t.userId, ver: 0 });
  const response = await app.request(`/api/v1/projects/${t.projectId}/commerce${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'x-workspace-id': options.workspace ?? t.workspaceId,
      ...(options.anonymous ? {} : { cookie: `${config.session.cookieName}=${token}` }),
      'content-type': 'application/json',
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}
const csv =
  'canonical_url,name,price,sku,category\nhttps://shop.example/products/one,"One, large",19.25,A1,Tools\n';
const importCsv = (content = csv) =>
  call<CatalogImport>('/catalog/import', { method: 'POST', body: { content } });

describe('Commerce workspace boundaries', () => {
  const routes = [
    ['/catalog', 'GET', undefined],
    ['/catalog/import', 'POST', { content: csv }],
    ['/competitors', 'GET', undefined],
    ['/competitors/discoveries', 'GET', undefined],
    ['/competitors/discover', 'POST', { targets: [{ kind: 'product', id: randomUUID() }] }],
    [`/competitors/${randomUUID()}`, 'PATCH', { decision: 'approved' }],
    ['/buyer-prompts', 'GET', undefined],
    [`/buyer-prompts/${randomUUID()}`, 'PATCH', { approved: true }],
    [`/ai-shelf?target_kind=product&target_id=${randomUUID()}`, 'GET', undefined],
  ] as const;
  it('requires sessions, membership, the active project workspace, and write capability on every route', async () => {
    const outsider = await fixtures.user();
    const viewer = await fixtures.user();
    await fixtures.member(t.workspaceId, viewer, 'viewer');
    const otherWorkspace = await fixtures.ownedWorkspace(t.userId);
    for (const [path, method, body] of routes) {
      expect((await call(path, { method, body, anonymous: true })).status).toBe(401);
      expect((await call(path, { method, body, user: outsider })).status).toBe(404);
      expect((await call(path, { method, body, workspace: otherWorkspace })).status).toBe(404);
      if (method !== 'GET')
        expect((await call(path, { method, body, user: viewer })).status).toBe(403);
    }
    expect((await call('/catalog', { user: viewer })).status).toBe(200);
  });
});

describe('CSV evidence and catalog', () => {
  it('queues a frozen discovery per distinct target, starts a new run on repeat, and rejects foreign targets atomically', async () => {
    await importCsv();
    const product = (await call<CommerceCatalog>('/catalog')).body.products[0]!;
    const target = { kind: 'product', id: product.id };
    const one = await call<{ task_ids: string[] }>('/competitors/discover', {
      method: 'POST',
      body: { targets: [target, target] },
    });
    const two = await call<{ task_ids: string[] }>('/competitors/discover', {
      method: 'POST',
      body: { targets: [target] },
    });
    expect(one.status).toBe(202);
    expect(one.body.task_ids[0]).toBe(one.body.task_ids[1]);
    expect(two.body.task_ids[0]).not.toBe(one.body.task_ids[0]);
    const queued = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('id', '=', one.body.task_ids[0]!)
      .executeTakeFirstOrThrow();
    expect(queued).toMatchObject({
      status: 'queued',
      workspace_id: t.workspaceId,
      payload: { target, target_context: { name: 'One, large', price: 19.25, currency: '' } },
    });
    const foreign = await fixtures.tenant();
    tenants.push(foreign);
    const foreignTarget = randomUUID();
    await db
      .insertInto('commerce_categories')
      .values({
        id: foreignTarget,
        workspace_id: foreign.workspaceId,
        project_id: foreign.projectId,
        name: 'Foreign',
        normalized_name: 'foreign',
        role: 'leaf',
        canonical_url: '',
        field_sources: {},
        source_analysis_id: null,
        projector_version: policy.commerce.projector_version,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    expect(
      (
        await call('/competitors/discover', {
          method: 'POST',
          body: { targets: [target, { kind: 'category', id: foreignTarget }] },
        })
      ).status,
    ).toBe(404);
    expect(
      await db
        .selectFrom('analytics_tasks')
        .select('id')
        .where('project_id', '=', t.projectId)
        .execute(),
    ).toHaveLength(2);
  });
  it('serializes simultaneous imports, keeps raw evidence, and publishes shared-contract values', async () => {
    const [one, two] = await Promise.all([importCsv(), importCsv()]);
    expect(one.status).toBe(201);
    expect(two).toEqual(one);
    const catalog = await call<CommerceCatalog>('/catalog');
    expect(catalog.body.products[0]).toMatchObject({
      name: 'One, large',
      price: 19.25,
      category_ids: [catalog.body.categories[0]!.id],
    });
    expect(catalog.body.categories[0]!.product_count).toBe(1);
    const artifacts = await db
      .selectFrom('commerce_csv_imports')
      .selectAll()
      .where('project_id', '=', t.projectId)
      .execute();
    expect(artifacts.map((row) => row.raw_payload)).toEqual([csv]);
    const observations = await db
      .selectFrom('commerce_product_observations')
      .selectAll()
      .where('project_id', '=', t.projectId)
      .execute();
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      csv_import_id: one.body.import_id,
      csv_row_number: 2,
      importer_version: policy.commerce.importer_version,
    });
    expect(
      await db
        .selectFrom('analytics_tasks')
        .select('id')
        .where('project_id', '=', t.projectId)
        .execute(),
    ).toEqual([]);
    const update = await importCsv('sku,name\nA1,Updated\n');
    expect(update.body.updated).toBe(1);
    expect(
      (await call<CommerceCatalog>('/catalog')).body.products[0]!.field_sources.name,
    ).toMatchObject({ kind: 'csv', source_id: update.body.import_id });
  });
  it('records invalid rows, rejects identity conflicts atomically, and orders categories by membership', async () => {
    const result = await importCsv(
      'canonical_url,name,sku,price,category\nhttps://shop.example/a,A,A1,4,Small\nhttps://shop.example/b,B,B1,5,Large\nhttps://shop.example/c,C,C1,6,Large\nhttps://shop.example/d,Bad,D1,NaN,Large\n',
    );
    expect(result.body).toMatchObject({ created: 3, rejected: 1 });
    const conflict = await importCsv(
      'canonical_url,sku,name\nhttps://shop.example/a,B1,Conflict\n',
    );
    expect(conflict.status).toBe(409);
    expect(
      (await call<CommerceCatalog>('/catalog')).body.categories.map((row) => [
        row.name,
        row.product_count,
      ]),
    ).toEqual([
      ['Large', 2],
      ['Small', 1],
    ]);
    expect(
      await db
        .selectFrom('commerce_csv_imports')
        .select('id')
        .where('project_id', '=', t.projectId)
        .execute(),
    ).toHaveLength(1);
  });
  it('bounds bytes and rows and rejects malformed CSV and corrupt persisted JSON', async () => {
    for (const content of ['', 'name,name\na,b\n', 'name;sku\na;b\n', 'name\n"unterminated'])
      expect((await importCsv(content)).status).toBe(422);
    expect(
      (await importCsv('name\n' + 'é'.repeat(policy.commerce.import_max_bytes / 2))).status,
    ).toBe(422);
    expect(
      (await importCsv('name\n' + 'a\n'.repeat(policy.commerce.import_max_rows + 1))).status,
    ).toBe(422);
    await importCsv();
    await db
      .updateTable('commerce_products')
      .set({ attributes: '[]' })
      .where('project_id', '=', t.projectId)
      .execute();
    expect((await call('/catalog')).status).toBe(500);
  });
});

describe('decisions and persisted reads', () => {
  it('serializes decisions and makes TS catalog and approvals consumable by Python audit context', async () => {
    const imported = await importCsv();
    const productId = imported.body.row_outcomes[0]!.product_id!;
    const ids = await commerceIsland<{ promptId: string; candidateId: string }>(
      'prompt',
      t.workspaceId,
      t.projectId,
      productId,
    );
    const candidates = await Promise.all(
      [true, false].map((approved) =>
        call<CompetitorCandidate>(`/competitors/${ids.candidateId}`, {
          method: 'PATCH',
          body: { decision: approved ? 'approved' : 'rejected' },
        }),
      ),
    );
    expect(candidates.map((row) => row.status)).toEqual([200, 200]);
    const prompts = await Promise.all(
      [true, false].map((approved) =>
        call<BuyerPrompt>(`/buyer-prompts/${ids.promptId}`, {
          method: 'PATCH',
          body: { approved },
        }),
      ),
    );
    expect(prompts.map((row) => row.status)).toEqual([200, 200]);
    const read = (await call<BuyerPrompt[]>('/buyer-prompts')).body[0]!;
    expect(read.enabled).toBe(read.approved_at !== null);
    await call(`/competitors/${ids.candidateId}`, {
      method: 'PATCH',
      body: { decision: 'approved' },
    });
    await call(`/buyer-prompts/${ids.promptId}`, { method: 'PATCH', body: { approved: true } });
    const context = await freezeCommerceContext(db, t, [ids.promptId]);
    expect(context.targets[0]!.products[0]).toMatchObject({ id: productId, price: 19.25 });
    expect(context.targets[0]!.approved_competitors.map((row) => row.id)).toEqual([
      ids.candidateId,
    ]);
    expect(
      await db
        .selectFrom('competitors')
        .select('id')
        .where('project_id', '=', t.projectId)
        .execute(),
    ).toEqual([]);
    expect((await call<CompetitorCandidate[]>('/competitors')).body[0]!.state).toBe('approved');
  }, 20_000);
  it('reads active and requested discovery tasks without starting discovery', async () => {
    const target = { kind: 'product', id: randomUUID() };
    const id = await enqueue(db, {
      ...t,
      kind: 'commerce_competitor_discovery',
      payload: { target },
    });
    expect(
      (await call<CompetitorDiscoveryTask[]>('/competitors/discoveries')).body.map((row) => row.id),
    ).toEqual([id]);
    await db
      .updateTable('analytics_tasks')
      .set({ status: 'failed', error_code: 'unavailable' })
      .where('id', '=', id)
      .execute();
    expect((await call<CompetitorDiscoveryTask[]>('/competitors/discoveries')).body).toEqual([]);
    expect(
      (
        await call<CompetitorDiscoveryTask[]>(
          `/competitors/discoveries?task_ids=${id.toUpperCase()}`,
        )
      ).body[0],
    ).toMatchObject({ target, terminal: true, error_code: 'unavailable' });
    expect((await call(`/competitors/discoveries?task_ids=${randomUUID()}`)).status).toBe(404);
  });
  it('keeps shelf history distinct from an explicit audit and never creates a missing snapshot', async () => {
    expect((await call('/ai-shelf')).status).toBe(422);
    const targetId = randomUUID();
    const path = `/ai-shelf?target_kind=product&target_id=${targetId}`;
    expect((await call<Shelf>(path)).body).toMatchObject({
      selected_audit_id: null,
      snapshots: [],
      observations: [],
    });
    const audit = await fixtures.audit(t, { scope: 'commerce' });
    const execution = await fixtures.execution(t, { auditId: audit });
    const evidence = await db
      .selectFrom('response_analyses')
      .select('artifact_id')
      .where('id', '=', execution.analysisId!)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('commerce_recommendation_observations')
      .values({
        id: randomUUID(),
        workspace_id: t.workspaceId,
        project_id: t.projectId,
        audit_id: audit,
        task_id: execution.taskId,
        artifact_id: evidence.artifact_id,
        target_kind: 'product',
        target_id: targetId,
        product_id: null,
        competitor_candidate_id: null,
        observed_product: 'Widget',
        observed_brand: '',
        observed_title: 'Widget',
        observed_price: '18.25',
        observed_currency: 'USD',
        merchant_url: '',
        merchant_domain: '',
        classification: 'unresolved',
        surface_kind: 'recommendation',
        rank: null,
        order_observable: false,
        match_confidence: 0,
        model_version: '',
        parser_version: '1',
        matcher_version: '1',
        created_at: new Date(),
      })
      .execute();
    await db
      .insertInto('commerce_shelf_snapshots')
      .values({
        id: randomUUID(),
        workspace_id: t.workspaceId,
        project_id: t.projectId,
        audit_id: audit,
        target_kind: 'product',
        target_id: targetId,
        product_visibility: 0,
        share_of_shelf: null,
        average_shelf_position: null,
        first_position_win_rate: null,
        successful_execution_count: 1,
        recognized_slot_count: 0,
        ranked_execution_count: 0,
        formula_version: 'commerce-shelf-formulas-1',
        source_observation_ids: '[]',
        context_snapshot: '{}',
        created_at: new Date(),
      })
      .execute();
    expect((await call<Shelf>(path)).body.snapshots[0]).toMatchObject({
      product_visibility: 0,
      share_of_shelf: null,
    });
    expect((await call<Shelf>(path)).body.observations[0]).toMatchObject({
      artifact_id: evidence.artifact_id,
      observed_price: 18.25,
      rank: null,
      classification: 'unresolved',
    });
    expect((await call<Shelf>(`${path}&audit_id=${randomUUID()}`)).body.snapshots).toEqual([]);
    expect(
      await db
        .selectFrom('commerce_shelf_snapshots')
        .select('id')
        .where('project_id', '=', t.projectId)
        .execute(),
    ).toHaveLength(1);
  });
});
