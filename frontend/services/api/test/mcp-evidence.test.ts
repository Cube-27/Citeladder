import { randomUUID } from 'node:crypto';
import { policy } from '../src/config.ts';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { authorizedWorkspaceIds } from '../src/mcp/data.ts';
import { dispatchTool } from '../src/mcp/tools.ts';
import { fetchRecord } from '../src/mcp/retrieval.ts';
import { agentTools } from '../src/agent/tool-adapters.ts';
import type { McpPrincipal } from '../src/mcp/types.ts';
import { prompt, promptSet } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { actionFixture, type ActionSeed } from './action-support.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const clients: string[] = [];
let tenant: Tenant;
let principal: McpPrincipal;
const origin = 'https://app.example.test';
beforeEach(async () => {
  tenant = await fixtures.tenant();
  const clientId = randomUUID();
  clients.push(clientId);
  await db
    .insertInto('mcp_oauth_clients')
    .values({
      id: randomUUID(),
      client_id: clientId,
      client_metadata: JSON.stringify({ client_name: 'test' }),
      client_secret_encrypted: '',
      created_at: new Date(),
    })
    .execute();
  principal = {
    userId: tenant.userId,
    grantId: randomUUID(),
    workspaceIds: [tenant.workspaceId],
    tokenHash: randomUUID(),
  };
  await db
    .insertInto('mcp_oauth_grants')
    .values({
      id: principal.grantId,
      client_id: clientId,
      user_id: tenant.userId,
      workspace_ids: JSON.stringify(principal.workspaceIds),
      scopes: JSON.stringify(['citeladder:read']),
      resource: 'https://protocol.example.test/mcp',
      access_token_hash: principal.tokenHash,
      refresh_token_hash: randomUUID(),
      access_expires_at: new Date(Date.now() + 3600000),
      refresh_expires_at: new Date(Date.now() + 7200000),
      revoked_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.deleteFrom('mcp_oauth_clients').where('client_id', 'in', clients).execute();
  await db.destroy();
});
const read = (name: string, args: Record<string, unknown> = {}) =>
  dispatchTool(db, principal, name, { project_id: tenant.projectId, ...args }, origin);

it('keeps crawlability unavailable without a crawl, including business context', async () => {
  expect(await read('read_ai_crawlability')).toMatchObject({
    state: 'unavailable',
    reason: 'no_site_crawl',
  });
  const context = await read('get_project_business_context', { sections: ['crawlability'] });
  expect(context.evidence).toMatchObject({
    crawlability: { state: 'unavailable', reason: 'no_site_crawl' },
  });
});

it('pages prompts stably while context includes only active prompts and foreign IDs cannot fetch', async () => {
  const set = await promptSet(db, tenant.projectId);
  // Distinct instants: same-millisecond fixtures would page in random-UUID order.
  const at = (offset: number) => new Date(Date.UTC(2026, 0, 1) + offset);
  const first = await prompt(db, set, 'Acme first', { createdAt: at(0) });
  const second = await prompt(db, set, 'Acme second', { createdAt: at(1) });
  const retired = await prompt(db, set, 'Acme retired', { status: 'retired', createdAt: at(2) });
  const page = await read('read_prompt_portfolio', { limit: 1 });
  expect(page.items).toEqual([expect.objectContaining({ id: first })]);
  expect(page).toMatchObject({
    project_id: tenant.projectId,
    applicability: { pagination: 'applicable' },
  });
  expect(await read('read_site_health')).toMatchObject({
    applicability: { pagination: 'not_applicable' },
  });
  const next = await read('read_prompt_portfolio', {
    limit: 1,
    cursor: (page.pagination as { next_cursor: string }).next_cursor,
  });
  expect(next.items).toEqual([expect.objectContaining({ id: second })]);
  const context = await read('get_project_business_context', { sections: ['prompts'] });
  expect((context.active_prompts as { id: string }[]).map((r) => r.id)).toEqual([first, second]);
  expect(
    (await fetchRecord(db, principal, `citeladder://prompt/${retired}`, origin)).metadata,
  ).toMatchObject({ record: { status: 'retired' } });
  const foreign = await fixtures.tenant();
  const secret = await prompt(db, await promptSet(db, foreign.projectId), 'Acme private');
  await expect(fetchRecord(db, principal, `citeladder://prompt/${secret}`, origin)).rejects.toThrow(
    'not found',
  );
  const searched = await dispatchTool(db, principal, 'search', { query: 'private' }, origin);
  expect(searched.results).toEqual([]);
});

it('excludes system tenants and reevaluates an already loaded credential after account or grant changes', async () => {
  const system = await fixtures.systemWorkspace();
  await db
    .updateTable('mcp_oauth_grants')
    .set({ workspace_ids: JSON.stringify([tenant.workspaceId, system]) })
    .where('id', '=', principal.grantId)
    .execute();
  expect(await authorizedWorkspaceIds(db, principal)).toEqual([tenant.workspaceId]);
  await db.updateTable('users').set({ is_active: false }).where('id', '=', tenant.userId).execute();
  expect(await authorizedWorkspaceIds(db, principal)).toEqual([]);
  await db.updateTable('users').set({ is_active: true }).where('id', '=', tenant.userId).execute();
  await db
    .updateTable('mcp_oauth_grants')
    .set({ revoked_at: new Date() })
    .where('id', '=', principal.grantId)
    .execute();
  await expect(read('read_prompt_portfolio')).rejects.toThrow('not found');
});

it('keeps a missing exact query window and unmeasured snapshots unavailable while no connections is observed', async () => {
  expect(
    await read('read_query_evidence', { window_start: '2026-09-01', window_end: '2026-09-02' }),
  ).toMatchObject({
    state: 'unavailable',
    reason: 'exact_query_evidence_window_not_projected',
    items: [],
  });
  expect(await read('read_site_health')).toMatchObject({
    state: 'unavailable',
    reason: 'no_site_snapshot',
  });
  expect(
    await read('read_ai_referrals', { start_date: '2026-09-01', end_date: '2026-09-02' }),
  ).toMatchObject({ state: 'unavailable', reason: 'no_ai_referrals_snapshot' });
  expect(await read('read_integration_status')).toMatchObject({
    state: 'available',
    connection_count: 0,
    stage: 'not_connected',
  });
  const before = await db
    .selectFrom('analytics_tasks')
    .select('id')
    .where('workspace_id', '=', tenant.workspaceId)
    .execute();
  await read('get_project_business_context');
  expect(
    await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('workspace_id', '=', tenant.workspaceId)
      .execute(),
  ).toEqual(before);
});

it('fetches the exact page analysis after a newer analysis replaces it, with facts and evaluations', async () => {
  const seed = await actionFixture<ActionSeed>('content');
  try {
    const source = await db
      .selectFrom('site_page_analyses')
      .selectAll()
      .where('crawl_id', '=', seed.crawl_id)
      .orderBy('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('site_url_observations')
      .values({
        id: randomUUID(),
        workspace_id: seed.workspace_id,
        project_id: seed.project_id,
        crawl_id: seed.crawl_id,
        site_url_id: source.site_url_id,
        observed_url: 'https://acme.example/',
        final_url: 'https://acme.example/',
        source_kind: 'seed',
        depth: 0,
        status_code: 200,
        content_type: 'text/html',
        title: 'Acme',
        rewrite_reason: '',
        rewrite_version: 'test',
        value_kind: 'page',
        value_priority: 0,
        created_at: new Date(),
      })
      .execute();
    principal.userId = seed.user_id;
    await db
      .updateTable('mcp_oauth_grants')
      .set({ user_id: seed.user_id, workspace_ids: JSON.stringify([seed.workspace_id]) })
      .where('id', '=', principal.grantId)
      .execute();
    const args = { project_id: seed.project_id, crawl_id: seed.crawl_id, limit: 1 };
    const page = await dispatchTool(db, principal, 'read_site_pages', args, origin);
    expect((page.items as unknown[]).length).toBe(1);
    await db
      .updateTable('site_page_analyses')
      .set({ is_current: false })
      .where('id', '=', source.id)
      .execute();
    const finalId = randomUUID();
    await db
      .insertInto('site_page_analyses')
      .values({ ...source, id: finalId, is_current: true, aeo_readiness_score: 99 })
      .execute();
    const fetched = await fetchRecord(db, principal, `citeladder://site_page/${source.id}`, origin);
    expect(fetched.metadata).toMatchObject({
      record: {
        id: source.id,
        aeo_readiness_score: source.aeo_readiness_score,
        artifact: { id: source.artifact_id, normalized_facts: expect.any(Object) },
      },
    });
    const evaluation = await db
      .selectFrom('site_rule_evaluations')
      .select('id')
      .where('analysis_id', '=', source.id)
      .executeTakeFirstOrThrow();
    expect(
      (fetched.metadata as { record: { evaluations: { id: string }[] } }).record.evaluations.map(
        (r) => r.id,
      ),
    ).toContain(evaluation.id);
    const final = await fetchRecord(db, principal, `citeladder://site_page/${finalId}`, origin);
    expect(final.evaluations).toEqual(fetched.evaluations);
    expect(final.issues).toEqual(fetched.issues);
    expect(final.issues).not.toEqual([]);
    const scope = {
      userId: seed.user_id,
      workspaceId: seed.workspace_id,
      projectId: seed.project_id,
    };
    const tool = agentTools(db);
    const readPart = async (id: string) => {
      const result = await tool.execute(db, scope, 'fetch', { id }, AbortSignal.timeout(5000));
      expect(result.status).toBe('completed');
      expect(result.omissions).toEqual([]);
      expect(result.text.length).toBeLessThanOrEqual(policy.agent.tool_result_max_chars);
      return JSON.parse(result.text);
    };
    const first = await readPart(`citeladder://site_page/${finalId}`);
    const parts = first.metadata.part_uris as string[];
    const record = parts.length
      ? JSON.parse((await Promise.all(parts.map(readPart))).map((part) => part.text).join(''))
      : first.metadata.record;
    expect(record.issues).toEqual(final.issues);
    expect(record.evaluations).toEqual(final.evaluations);
  } finally {
    await db.deleteFrom('mcp_oauth_grants').where('id', '=', principal.grantId).execute();
    await db.deleteFrom('workspaces').where('id', '=', seed.workspace_id).execute();
    await db.deleteFrom('users').where('id', '=', seed.user_id).execute();
  }
});

it('exposes published dataset aggregates without treating them as backlink edges or letting auxiliary data replace identity', async () => {
  const scope = { workspace_id: tenant.workspaceId, project_id: tenant.projectId };
  const connectionId = randomUUID(),
    runId = randomUUID(),
    datasetId = randomUUID(),
    rowId = randomUUID();
  await db
    .insertInto('provider_connections')
    .values({
      id: connectionId,
      workspace_id: tenant.workspaceId,
      label: 'DataForSEO',
      transport_provider: 'dataforseo',
      api_key_encrypted: 'fixture',
      base_url: '',
      credential_revision: randomUUID(),
      active: true,
      last_test_status: policy.search_intelligence.connection_test_ok,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  await db
    .insertInto('search_intelligence_runs')
    .values({
      ...scope,
      id: runId,
      actor_user_id: tenant.userId,
      connection_id: connectionId,
      connection_revision: randomUUID(),
      account_identity: 'test',
      status: 'completed',
      action: 'analysis',
      idempotency_key: runId,
      frozen_scope: '{}',
      call_plan: '[]',
      reused_datasets: '[]',
      pricing_version: policy.search_intelligence.price_version,
      estimated_cost_usd: '0',
      planned_calls: 1,
      completed_calls: 1,
      planned_rows: 1,
      received_rows: 1,
      uncertain_calls: 0,
      error_code: '',
      error_detail: '',
      expires_at: new Date(Date.now() + 600000),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  await db
    .insertInto('search_intelligence_datasets')
    .values({
      ...scope,
      id: datasetId,
      run_id: runId,
      dataset_kind: 'referring_domains',
      scope_hash: datasetId,
      target_domain: 'acme.example',
      target_hostname: 'acme.example',
      target_origin: 'https://acme.example',
      comparison_origin: '',
      language_code: 'en',
      status: 'published',
      coverage: 'complete',
      requested_rows: 1,
      raw_rows_received: 1,
      unique_rows_saved: 1,
      truncated: false,
      summary: '{}',
      provider_filters: '{}',
      parser_version: '1',
      published_at: new Date(),
      created_at: new Date(),
    })
    .execute();
  await db
    .insertInto('search_intelligence_rows')
    .values({
      ...scope,
      id: rowId,
      dataset_id: datasetId,
      provider_row_key: 'row',
      row_kind: 'referring_domains',
      keyword: '',
      domain: 'publisher.example',
      url: '',
      intent: '',
      backlinks: 0,
      auxiliary: JSON.stringify({ id: 'forged', project_id: 'forged', backlinks: 42 }),
      created_at: new Date(),
    })
    .execute();
  const page = await read('read_search_dataset', { dataset_id: datasetId, limit: 1 });
  expect(page).toMatchObject({
    grain: 'referring_domains',
    limitations: ['aggregate_not_individual_backlink_edges'],
  });
  const fetched = await fetchRecord(db, principal, `citeladder://search_row/${rowId}`, origin);
  expect(fetched.metadata).toMatchObject({
    record: { id: rowId, project_id: tenant.projectId, backlinks: 0 },
  });
  await db
    .updateTable('search_intelligence_datasets')
    .set({ status: 'collecting' })
    .where('id', '=', datasetId)
    .execute();
  await expect(
    fetchRecord(db, principal, `citeladder://search_row/${rowId}`, origin),
  ).rejects.toThrow('not found');
});

it('preserves answer and citation artifact identity through the existing visibility owner', async () => {
  const auditId = await fixtures.audit(tenant);
  const { taskId } = await fixtures.execution(tenant, {
    auditId,
    analysis: {
      brandMentioned: true,
      citations: [{ url: 'https://publisher.example/review', title: 'Review' }],
    },
    taskEvents: [{ query: 'acme review' }],
  });
  const page = await read('read_visibility_results', { audit_id: auditId });
  const items = page.items as {
    id: string;
    record_uri: string;
    citations: { id: string; record_uri: string }[];
  }[];
  expect(items[0]?.id).toBe(taskId);
  const answer = await fetchRecord(db, principal, items[0]!.record_uri, origin);
  expect(answer.metadata).toMatchObject({
    project_id: tenant.projectId,
    record_type: 'visibility_result',
  });
  const citation = await fetchRecord(db, principal, items[0]!.citations[0]!.record_uri, origin);
  expect(citation.metadata).toMatchObject({
    record: { url: 'https://publisher.example/review', analysis_id: expect.any(String) },
  });
  const foreign = await fixtures.tenant();
  await expect(
    dispatchTool(
      db,
      principal,
      'read_visibility_results',
      { project_id: foreign.projectId, audit_id: auditId },
      origin,
    ),
  ).rejects.toThrow('not found');
});
