import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { loadWorkerSettings, policy } from '../src/config.ts';
import { WorkspaceScope } from '../src/db/workspace-scope.ts';
import { attachOrCreateAction } from '../src/opportunities/actions.ts';
import { declareAction } from '../src/opportunities/declarations.ts';
import { recomputeOpportunities } from '../src/opportunities/refresh.ts';
import { storedOutcomes } from '../src/opportunities/verification-decisions.ts';
import { verifyImplementationEvents } from '../src/opportunities/verification.ts';
import type { QueueTask } from '../src/queue/task-queue.ts';
import { datasetPage } from '../src/search-intelligence/reads.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const tenants: Tenant[] = [];
const OWNED = 'https://www.example.com';
const day = 86_400_000;

afterAll(async () => {
  const workspaces = tenants.map((tenant) => tenant.workspaceId);
  for (const table of [
    'opportunity_verification_events',
    'opportunity_implementation_events',
    'opportunities',
    'actions',
    'opportunity_snapshots',
    'analytics_tasks',
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
  const tenant = await fixtures.tenant({ websiteUrl: OWNED });
  tenants.push(tenant);
  await db
    .updateTable('projects')
    .set({ serp_location_code: 2840, serp_language_code: 'en' })
    .where('id', '=', tenant.projectId)
    .execute();
  await fixtures.competitor(tenant.projectId, { name: 'Rival', domains: ['rival.test'] });
  const connectionId = randomUUID(),
    runId = randomUUID(),
    at = new Date();
  await db
    .insertInto('provider_connections')
    .values({
      id: connectionId,
      workspace_id: tenant.workspaceId,
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
      workspace_id: tenant.workspaceId,
      project_id: tenant.projectId,
      actor_user_id: tenant.userId,
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
  return { ...tenant, runId };
}

type Project = Awaited<ReturnType<typeof project>>;

/** One published dataset with its rows, as acquisition leaves it. */
async function dataset(
  p: Project,
  kind: string,
  rows: { keyword: string; volume?: number | null; rank?: number | null; checked?: Date }[],
  published = new Date(),
) {
  const id = randomUUID();
  await db
    .insertInto('search_intelligence_datasets')
    .values({
      id,
      workspace_id: p.workspaceId,
      project_id: p.projectId,
      run_id: p.runId,
      dataset_kind: kind,
      scope_hash: id,
      target_domain: 'example.com',
      target_hostname: 'www.example.com',
      target_origin: OWNED,
      comparison_origin: kind === 'ranking_keywords' ? '' : 'https://rival.test',
      location_code: 2840,
      language_code: 'en',
      status: 'published',
      coverage: 'complete',
      requested_rows: 100,
      raw_rows_received: rows.length,
      unique_rows_saved: rows.length,
      truncated: false,
      summary: '{}',
      provider_filters: '{}',
      parser_version: '1',
      published_at: published,
      created_at: published,
    })
    .execute();
  const ids: string[] = [];
  for (const [index, row] of rows.entries()) {
    const rowId = randomUUID();
    ids.push(rowId);
    await db
      .insertInto('search_intelligence_rows')
      .values({
        id: rowId,
        workspace_id: p.workspaceId,
        project_id: p.projectId,
        dataset_id: id,
        provider_row_key: `row:${index}`,
        row_kind: kind,
        keyword: row.keyword,
        domain: '',
        url: 'https://rival.test/page',
        intent: 'commercial',
        search_volume: row.volume === undefined ? 900 : row.volume,
        rank_group: row.rank === undefined ? 3 : row.rank,
        auxiliary: JSON.stringify({
          serp_updated_at:
            (row.checked ?? published).toISOString().replace('T', ' ').slice(0, 19) + ' +00:00',
        }),
        created_at: published,
      })
      .execute();
  }
  return { id, rows: ids };
}

const scopeOf = (p: Project) => ({ workspaceId: p.workspaceId, projectId: p.projectId });

async function gapFindings(p: Project) {
  return db
    .selectFrom('opportunities')
    .select(['id', 'target_theme', 'action_id', 'evidence'])
    .where('workspace_id', '=', p.workspaceId)
    .where('rule_id', '=', 'search_keyword_gap')
    .where('superseded_at', 'is', null)
    .execute();
}

describe('keyword gaps become Actions', () => {
  it('promotes a published gap onto the planned page the Agent already opened', async () => {
    const p = await project();
    const gap = await dataset(p, 'missing_keywords', [
      { keyword: 'running shoes' },
      { keyword: 'rival shoes' },
      { keyword: 'trail boots', volume: null },
    ]);
    // The Agent planned the page first; evidence must converge on it, not open a second Action.
    const planned = await db.transaction().execute(async (trx) => {
      await attachOrCreateAction(trx, scopeOf(p), 'planned_page', 'Running shoes', p.userId);
      return trx
        .selectFrom('actions')
        .select(['id', 'group_key'])
        .where('project_id', '=', p.projectId)
        .executeTakeFirstOrThrow();
    });
    const snapshot = await recomputeOpportunities(db, scopeOf(p));
    const findings = await gapFindings(p);
    expect(findings.map((finding) => [finding.target_theme, finding.action_id])).toEqual([
      ['running shoes', planned.id],
    ]);
    expect(snapshot.limitations.join(' ')).toContain('1 unknown volume');
    expect(snapshot.limitations.join(' ')).toContain('1 competitor named');

    // Unchanged datasets are the same identity: the refresh writes nothing new.
    const again = await recomputeOpportunities(db, scopeOf(p), { skipIfCurrent: true });
    expect(again.id).toBe(snapshot.id);

    // The missing-keyword row links to its Action; the read computes nothing.
    const page = await datasetPage(
      db,
      { workspace: new WorkspaceScope(p.workspaceId), projectId: p.projectId },
      gap.id,
      {
        cursor: null,
        limit: 10,
        sort: 'id',
        direction: 'asc',
        search: '',
        minVolume: null,
        intent: '',
      },
    );
    expect(page.rows.find((row) => row.id === gap.rows[0])?.action_id).toBe(planned.id);
    expect(page.rows.find((row) => row.id === gap.rows[1])?.action_id).toBeNull();
  });

  it('verifies the gap only from a provider check made after go-live', async () => {
    const p = await project();
    await dataset(
      p,
      'missing_keywords',
      [{ keyword: 'running shoes' }],
      new Date(Date.now() - 10 * day),
    );
    await recomputeOpportunities(db, scopeOf(p));
    const [finding] = await gapFindings(p);
    const goLive = new Date(Date.now() - 5 * day);
    const { row } = await declareAction(db, p.workspaceId, finding!.action_id!, p.userId, 'gap', {
      output_revision_id: null,
      declared_implemented_at: goLive.toISOString(),
    });
    expect(row.expected_checks).toEqual([
      expect.objectContaining({
        kind: 'keyword_presence',
        keyword: 'running shoes',
        owned_origin: OWNED,
      }),
    ]);
    const read = async (published: Date, checked: Date) => {
      const ranking = await dataset(
        p,
        'ranking_keywords',
        [{ keyword: 'running shoes', rank: 7, checked }],
        published,
      );
      const task = {
        id: randomUUID(),
        workspace_id: p.workspaceId,
        project_id: p.projectId,
        task_kind: 'opportunity_verification',
        payload: { trigger_kind: 'search_intelligence_dataset', trigger_id: ranking.id },
        max_attempts: loadWorkerSettings({}).taskMaxAttempts,
      } as unknown as QueueTask;
      await verifyImplementationEvents(task, {
        db,
        checkCancelled: async () => {},
        maxAttempts: 3,
      });
      const latest = await db
        .selectFrom('opportunity_verification_events')
        .select(['observation_kind', 'result'])
        .where('implementation_event_id', '=', row.id)
        .orderBy('created_at', 'desc')
        .executeTakeFirstOrThrow();
      return { kind: latest.observation_kind, check: storedOutcomes(latest.result).get(0) };
    };
    // Published after go-live, but DataForSEO checked the search before it: no answer.
    const stale = await read(new Date(Date.now() - 2 * day), new Date(Date.now() - 6 * day));
    expect(stale.check).toMatchObject({
      state: 'unavailable',
      reason: 'provider_serp_predates_change',
    });
    const fresh = await read(new Date(Date.now() - day), new Date(Date.now() - day));
    expect([fresh.kind, fresh.check?.state]).toEqual(['verified', 'met']);
  });
});
