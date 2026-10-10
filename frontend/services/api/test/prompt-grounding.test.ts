import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { policy } from '../src/config.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { generationInput, generationSetting } from '../src/prompts/generation-input.ts';
import { generatePrompts } from '../src/prompts/generation.ts';
import { loadObservedQueries } from '../src/prompts/observed-queries.ts';
import { promptSet, topic } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db);
const tenants: Tenant[] = [];
const day = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * day);

afterAll(async () => {
  const workspaces = tenants.map((tenant) => tenant.workspaceId);
  for (const table of [
    'prompt_candidates',
    'prompt_generation_runs',
    'search_intelligence_rows',
    'search_intelligence_datasets',
    'search_intelligence_runs',
    'provider_connections',
  ] as const)
    await db.deleteFrom(table).where('workspace_id', 'in', workspaces).execute();
  await fixtures.cleanup();
  await db.destroy();
});

async function project() {
  const tenant = await fixtures.tenant();
  tenants.push(tenant);
  await fixtures.brand(tenant.projectId, 'Acme');
  await fixtures.competitor(tenant.projectId, { name: 'Rival' });
  const topicId = await topic(db, tenant.projectId, 'Running shoes');
  const setId = await promptSet(db, tenant.projectId);
  return { ...tenant, topicId, setId };
}
type Project = Awaited<ReturnType<typeof project>>;

/** One query snapshot with its per-day rows, as Search Console import leaves it. */
async function searchConsole(
  p: Project,
  windowEnd: Date,
  rows: { query: string; impressions: number; daysAgo: number }[],
) {
  const snapshotId = randomUUID(),
    at = new Date();
  await db
    .insertInto('query_evidence_snapshots')
    .values({
      id: snapshotId,
      workspace_id: p.workspaceId,
      project_id: p.projectId,
      window_start: new Date(windowEnd.getTime() - 180 * day),
      window_end: windowEnd,
      source_hash: snapshotId,
      supersedes_snapshot_id: null,
      state: 'complete',
      source_metric_row_ids: '[]',
      source_artifact_ids: '[]',
      coverage: '{}',
      limitations: '[]',
      analyzer_version: 'test',
      resolver_version: 'test',
      created_at: at,
    })
    .execute();
  const ids: string[] = [];
  for (const row of rows) {
    const id = randomUUID();
    ids.push(id);
    await db
      .insertInto('query_evidence_rows')
      .values({
        id,
        snapshot_id: snapshotId,
        workspace_id: p.workspaceId,
        project_id: p.projectId,
        date: isoDay(row.daysAgo),
        normalized_query: row.query,
        observed_page_url: 'https://www.example.com/shoes',
        site_url_id: null,
        resolved_page_url: 'https://www.example.com/shoes',
        resolution_outcome: 'resolved',
        resolution_candidates: '[]',
        property_ref: 'sc-domain:example.com',
        impressions: row.impressions,
        clicks: 1,
        ctr: null,
        position: null,
        source_metric_row_id: randomUUID(),
        source_artifact_id: randomUUID(),
        importer_version: 'test',
        resolver_version: 'test',
        created_at: at,
      })
      .execute();
  }
  return ids;
}

/** One Search Intelligence dataset with keyword rows. */
async function keywordResearch(
  p: Project,
  options: { kind: string; language: string; status: string },
  keywords: { keyword: string; volume: number }[],
) {
  const at = new Date(),
    connectionId = randomUUID(),
    runId = randomUUID(),
    datasetId = randomUUID();
  await db
    .insertInto('provider_connections')
    .values({
      id: connectionId,
      workspace_id: p.workspaceId,
      label: 'DataForSEO',
      transport_provider: 'dataforseo',
      api_key_encrypted: 'ciphertext',
      base_url: '',
      credential_revision: randomUUID(),
      active: true,
      last_test_status: 'ok',
      created_at: at,
      updated_at: at,
    })
    .execute();
  await db
    .insertInto('search_intelligence_runs')
    .values({
      id: runId,
      workspace_id: p.workspaceId,
      project_id: p.projectId,
      actor_user_id: p.userId,
      connection_id: connectionId,
      connection_revision: randomUUID(),
      account_identity: 'account',
      status: 'succeeded',
      action: 'analysis',
      idempotency_key: runId,
      frozen_scope: '{}',
      call_plan: '[]',
      reused_datasets: '[]',
      pricing_version: policy.search_intelligence.price_version,
      estimated_cost_usd: '0.1',
      planned_calls: 1,
      completed_calls: 1,
      planned_rows: 10,
      received_rows: 10,
      uncertain_calls: 0,
      error_code: '',
      error_detail: '',
      expires_at: at,
      confirmed_at: at,
      created_at: at,
      updated_at: at,
    })
    .execute();
  await db
    .insertInto('search_intelligence_datasets')
    .values({
      id: datasetId,
      workspace_id: p.workspaceId,
      project_id: p.projectId,
      run_id: runId,
      dataset_kind: options.kind,
      scope_hash: datasetId,
      target_domain: 'example.com',
      target_hostname: 'www.example.com',
      target_origin: 'https://www.example.com',
      comparison_origin: '',
      location_code: 2840,
      language_code: options.language,
      status: options.status,
      coverage: 'complete',
      requested_rows: 100,
      raw_rows_received: keywords.length,
      unique_rows_saved: keywords.length,
      truncated: false,
      summary: '{}',
      provider_filters: '{}',
      parser_version: '1',
      published_at: options.status === 'published' ? at : null,
      created_at: at,
    })
    .execute();
  const ids: string[] = [];
  for (const [index, row] of keywords.entries()) {
    const id = randomUUID();
    ids.push(id);
    await db
      .insertInto('search_intelligence_rows')
      .values({
        id,
        workspace_id: p.workspaceId,
        project_id: p.projectId,
        dataset_id: datasetId,
        provider_row_key: `row:${index}`,
        row_kind: options.kind,
        keyword: row.keyword,
        domain: '',
        url: 'https://www.example.com/shoes',
        intent: 'commercial',
        search_volume: row.volume,
        auxiliary: '{}',
        created_at: at,
      })
      .execute();
  }
  return ids;
}

const load = (p: Project, workspaceId = p.workspaceId) =>
  loadObservedQueries(db, {
    workspaceId,
    projectId: p.projectId,
    languageCode: 'en',
    topics: [{ id: p.topicId, name: 'Running shoes', description: '' }],
    competitors: [{ aliases: ['Rival'], rule: undefined }],
  });

/** Persisted Search Console and keyword rows a grounded project starts from. */
async function groundedProject() {
  const p = await project();
  // An older snapshot is superseded by the latest one and never read.
  await searchConsole(p, isoDay(30), [
    { query: 'running shoes for wide feet', impressions: 1000, daysAgo: 31 },
  ]);
  const [flatFeetTop] = await searchConsole(p, isoDay(1), [
    { query: 'best running shoes for flat feet', impressions: 30, daysAgo: 2 },
    { query: 'best running shoes for flat feet', impressions: 20, daysAgo: 5 },
    { query: 'running shoes for marathon training', impressions: 9, daysAgo: 2 },
    { query: 'running shoes for winter mornings', impressions: 100, daysAgo: 120 },
    { query: 'acme running shoes review', impressions: 500, daysAgo: 2 },
    { query: 'rival running shoes sale', impressions: 400, daysAgo: 2 },
    { query: 'cheap pizza delivery tonight', impressions: 300, daysAgo: 2 },
    { query: 'shoes', impressions: 200, daysAgo: 2 },
    { query: 'which shoes', impressions: 15, daysAgo: 2 },
  ]);
  const [trail] = await keywordResearch(
    p,
    { kind: 'ranking_keywords', language: 'en', status: 'published' },
    [
      { keyword: 'Trail running shoes waterproof', volume: 900 },
      { keyword: 'best running shoes for flat feet', volume: 5000 },
    ],
  );
  await keywordResearch(p, { kind: 'missing_keywords', language: 'en', status: 'collecting' }, [
    { keyword: 'running shoes clearance outlet', volume: 9000 },
  ]);
  await keywordResearch(p, { kind: 'shared_keywords', language: 'de', status: 'published' }, [
    { keyword: 'running shoes damen laufen', volume: 9000 },
  ]);
  return { p, flatFeetTop: flatFeetTop!, trail: trail! };
}

describe('observed queries at the PostgreSQL boundary', () => {
  it('keeps non-branded, topic-bound searches from the latest snapshot and published datasets', async () => {
    const { p, flatFeetTop, trail } = await groundedProject();
    expect(await load(p)).toEqual([
      {
        id: flatFeetTop,
        source: 'gsc',
        text: 'best running shoes for flat feet',
        topic_id: p.topicId,
        weight: 50,
      },
      {
        id: expect.any(String),
        source: 'gsc',
        text: 'which shoes',
        topic_id: p.topicId,
        weight: 15,
      },
      {
        id: trail,
        source: 'search_intelligence',
        text: 'trail running shoes waterproof',
        topic_id: p.topicId,
        weight: 900,
      },
    ]);
    // The same rows are invisible from another workspace.
    const other = await fixtures.tenant();
    tenants.push(other);
    expect((await load(p, other.workspaceId)).map((row) => row.text)).toEqual([]);
    expect((await load(p)).length).toBe(3);
  });

  it('caps each topic at the configured number of searches, heaviest first', async () => {
    const { p } = await groundedProject();
    const observed = policy.prompts.generation.observed;
    const cap = observed.max_per_topic;
    observed.max_per_topic = 2;
    try {
      expect((await load(p)).map((row) => row.text)).toEqual([
        'best running shoes for flat feet',
        'which shoes',
      ]);
    } finally {
      observed.max_per_topic = cap;
    }
  });
});

/** A gateway answering every slot, recording each request it received. */
function recordingGateway() {
  const requests: { system: string; slots: Record<string, unknown>[] }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content.split('\n\nReturn only JSON')[0]!) as {
      slots: (Record<string, unknown> & { slot_id: string })[];
    };
    requests.push({ system: body.messages[0]!.content, slots: user.slots });
    const prompts = user.slots.map((slot) => ({
      slot_id: slot.slot_id,
      text: `Which running shoes suit runner ${slot.slot_id} best?`,
      buyer_stage: 'consideration',
      prompt_intent: 'recommend',
    }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ prompts }) } }] });
  });
  const gateway = createModelGateway(
    { ...gatewaySettings({}), apiKey: 'test-only', model: 'test', baseUrl: 'https://model.test' },
    { fetch, sleep: async () => {} },
  );
  return { dependencies: { gateway: () => gateway, judge: () => null }, requests };
}

describe('grounded generation', () => {
  it('steers drafts with example searches and records refs, provenance and the tag flag', async () => {
    const { p, flatFeetTop, trail } = await groundedProject();
    const { dependencies, requests } = recordingGateway();
    const response = await generatePrompts(
      db,
      p.workspaceId,
      p.setId,
      generationInput.parse({ count: 2 }),
      dependencies,
    );
    const planned = 2 * generationSetting('overgenerate_factor');
    expect(requests[0]!.system).toContain('buyer_search_examples');
    expect(requests[0]!.slots[0]).toMatchObject({
      // Closest to the "Running shoes" cell first; the loader's ranking breaks ties.
      buyer_search_examples: [
        'best running shoes for flat feet',
        'trail running shoes waterproof',
        'which shoes',
      ],
    });
    expect(requests[0]!.slots[0]).not.toHaveProperty('grounding');
    expect(response.candidates.map((candidate) => candidate.grounded)).toEqual([true, true]);
    const candidate = await db
      .selectFrom('prompt_candidates')
      .select('evidence_refs')
      .where('workspace_id', '=', p.workspaceId)
      .where('prompt_set_id', '=', p.setId)
      .executeTakeFirstOrThrow();
    expect(candidate.evidence_refs).toEqual([
      expect.objectContaining({ kind: 'business_map_cell', offering: 'Running shoes' }),
      { kind: 'observed_query', source: 'gsc', id: flatFeetTop },
      { kind: 'observed_query', source: 'search_intelligence', id: trail },
      { kind: 'observed_query', source: 'gsc', id: expect.any(String) },
    ]);
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('workspace_id', '=', p.workspaceId)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({
      generator_version: 'prompt-gen-v5',
      grounding: { gsc: 2, search_intelligence: 1, slots_grounded: planned },
    });
  });

  it('sends the same request as before when the project has no search data', async () => {
    const p = await project();
    const { dependencies, requests } = recordingGateway();
    const response = await generatePrompts(
      db,
      p.workspaceId,
      p.setId,
      generationInput.parse({ count: 2 }),
      dependencies,
    );
    expect(requests[0]!.system).not.toContain('buyer_search_examples');
    expect(requests[0]!.slots.map((slot) => Object.keys(slot).sort())).toEqual(
      requests[0]!.slots.map(() => [
        'allowed_prompt_intents',
        'buyer_need',
        'evidence_ref',
        'slot_id',
        'target_buyer_stage',
        'target_prompt_intents',
        'topic_description',
        'topic_id',
        'topic_name',
      ]),
    );
    expect(response.candidates.map((candidate) => candidate.grounded)).toEqual([false, false]);
    const run = await db
      .selectFrom('prompt_generation_runs')
      .select('provenance')
      .where('workspace_id', '=', p.workspaceId)
      .executeTakeFirstOrThrow();
    expect(run.provenance).toMatchObject({
      grounding: { gsc: 0, search_intelligence: 0, slots_grounded: 0 },
    });
  });
});
