/**
 * The Opportunity refresh and routes against real PostgreSQL: Python enqueues
 * and reads, TypeScript claims, recomputes and serves.
 *
 * Ported from the Python recompute suites this refresh retired
 * (`test_opportunities_service*.py`, `test_actions.py`), plus the queue,
 * lock and cross-stack Action handoffs the move introduced.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.ts';
import { updateActionStatus } from '../src/opportunities/actions.ts';
import { loadWorkerSettings, policy } from '../src/config.ts';
import { recomputeOpportunities, refreshOpportunities } from '../src/opportunities/refresh.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';

// Each Python fixture call starts an interpreter.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const o = policy.opportunity.opportunities;
const URL_B = 'https://acme.test/b';

type Seed = {
  user_id: string;
  workspace_id: string;
  project_id: string;
  prompt0_id: string;
  prompt1_id: string;
  audit_id: string;
  analysis0_id: string;
  analysis1_id: string;
  metric_snapshot_id: string;
  crawl_id: string;
  issue_structured_id: string;
  issue_thin_id: string;
};
type PythonRead = {
  opportunities: { rule_id: string; priority_score: number; action_id: string }[];
  actions: string[];
};
const seeds: Seed[] = [];

async function python<T>(...args: string[]): Promise<T> {
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../../../../backend/.venv/Scripts/python.exe'
        : '../../../../backend/.venv/bin/python',
      import.meta.url,
    ),
  );
  const system = Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME'].flatMap((k) =>
      process.env[k] ? [[k, process.env[k]!]] : [],
    ),
  );
  const { stdout } = await promisify(execFile)(
    executable,
    [fileURLToPath(new URL('./refresh-fixture.py', import.meta.url)), ...args],
    {
      cwd: backend,
      env: {
        ...system,
        PYTHONPATH: backend,
        CITELADDER_DISABLE_DOTENV: '1',
        APP_ENV: 'test',
        DATABASE_URL: process.env.API_TEST_DATABASE_URL!.replace(
          'postgresql://',
          'postgresql+asyncpg://',
        ),
        JWT_SECRET_KEY: 'pr7-test-jwt-key-not-a-real-secret-1234',
        ENCRYPTION_KEY: 'pr7-test-encryption-key-not-a-real-secret',
        REFERRAL_HASH_SALT: 'pr7-test-referral-salt-not-a-real-secret',
      },
    },
  );
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as T;
}

async function seed(): Promise<Seed> {
  const created = await python<Seed>('seed');
  seeds.push(created);
  return created;
}

const scope = (s: Seed) => ({ workspaceId: s.workspace_id, projectId: s.project_id });

function live(s: Seed) {
  return db
    .selectFrom('opportunities')
    .selectAll()
    .where('workspace_id', '=', s.workspace_id)
    .where('superseded_at', 'is', null)
    .orderBy('priority_score', 'desc')
    .execute();
}

function byRule<T extends { rule_id: string }>(rows: T[], rule: string): T {
  const matches = rows.filter((row) => row.rule_id === rule);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

async function snapshotCount(s: Seed) {
  const { count } = await db
    .selectFrom('opportunity_snapshots')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('workspace_id', '=', s.workspace_id)
    .executeTakeFirstOrThrow();
  return Number(count);
}

async function request(
  s: Seed,
  path: string,
  options: { method?: string; body?: unknown; as?: Seed } = {},
) {
  const actor = options.as ?? s;
  const headers: Record<string, string> = {
    cookie: `${config.session.cookieName}=${await sessionToken({ sub: actor.user_id, ver: 0 })}`,
    'x-workspace-id': actor.workspace_id,
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await app.request(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return { status: response.status, response };
}

const worker = () =>
  new AnalyticsWorker(db, loadWorkerSettings({}), { owner: `pr7-${randomUUID()}` });

let own: Seed;
let foreign: Seed;

beforeAll(async () => {
  own = await seed();
  foreign = await seed();
  await worker().runUntilIdle();
});

afterAll(async () => {
  for (const s of seeds) {
    await db.deleteFrom('workspaces').where('id', '=', s.workspace_id).execute();
    await db.deleteFrom('users').where('id', '=', s.user_id).execute();
  }
  await db.destroy();
});

describe('opportunity_refresh', () => {
  it('claims the one Python-enqueued task and persists exact provenance Python reads back', async () => {
    const tasks = await db
      .selectFrom('analytics_tasks')
      .select(['status', 'attempt_count', 'error_code'])
      .where('workspace_id', '=', own.workspace_id)
      .where('task_kind', '=', 'opportunity_refresh')
      .execute();
    expect(tasks).toEqual([{ status: 'succeeded', attempt_count: 1, error_code: '' }]);

    const snapshot = await db
      .selectFrom('opportunity_snapshots')
      .selectAll()
      .where('workspace_id', '=', own.workspace_id)
      .executeTakeFirstOrThrow();
    expect(snapshot).toMatchObject({
      audit_id: own.audit_id,
      site_crawl_id: own.crawl_id,
      total_count: 4,
      source_analysis_ids: [own.analysis0_id],
      source_issue_ids: [own.issue_structured_id, own.issue_thin_id].sort(),
      analyzer_version: o.ANALYZER_VERSION,
      formula_version: o.FORMULA_VERSION,
    });

    const rows = await live(own);
    expect(rows.map((row) => [row.rule_id, Number(row.priority_score)])).toEqual([
      ['brand_absent_high_value_prompt', 120],
      ['owned_page_not_cited', 80],
      ['missing_structured_data', 20],
      ['thin_content', 10],
    ]);
    const absent = byRule(rows, 'brand_absent_high_value_prompt');
    expect(absent).toMatchObject({
      target_key: `prompt:${own.prompt0_id}`,
      target_prompt_id: own.prompt0_id,
      source_analysis_ids: [own.analysis0_id],
      source_metric_ids: [own.metric_snapshot_id],
      source_issue_ids: [],
      source_traffic_ids: null,
    });
    expect(byRule(rows, 'thin_content')).toMatchObject({
      target_url: URL_B,
      source_issue_ids: [own.issue_thin_id],
    });
    expect(rows.every((row) => row.action_id !== null)).toBe(true);

    const read = await python<PythonRead>('read', own.workspace_id, own.project_id);
    expect(read.opportunities.map((row) => [row.rule_id, row.action_id])).toEqual(
      rows.map((row) => [row.rule_id, row.action_id]),
    );
    expect(read.actions).toEqual([...new Set(rows.map((row) => row.action_id!))].sort());
  });

  it('replays a claimed refresh as a no-op when the snapshot is current', async () => {
    const before = await live(own);
    const snapshots = await snapshotCount(own);
    const template = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('workspace_id', '=', own.workspace_id)
      .executeTakeFirstOrThrow();

    await refreshOpportunities(template, { db, checkCancelled: async () => {}, maxAttempts: 3 });

    expect(await snapshotCount(own)).toBe(snapshots);
    expect((await live(own)).map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it('lets exactly one of two concurrent workers claim a queued refresh', async () => {
    const snapshots = await snapshotCount(own);
    const template = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('workspace_id', '=', own.workspace_id)
      .executeTakeFirstOrThrow();
    const { id } = await db
      .insertInto('analytics_tasks')
      .values({
        ...template,
        id: randomUUID(),
        idempotency_key: `opportunity:manual:${randomUUID()}`,
        status: 'queued',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        completed_at: null,
        error_code: '',
        error_detail: '',
        payload: JSON.stringify(template.payload),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await Promise.all([worker().runUntilIdle(), worker().runUntilIdle()]);

    const task = await db
      .selectFrom('analytics_tasks')
      .select(['status', 'attempt_count'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(task).toEqual({ status: 'succeeded', attempt_count: 1 });
    // Already current: the second trigger claims, finds nothing new, writes nothing.
    expect(await snapshotCount(own)).toBe(snapshots);
  });

  it('serializes concurrent recomputes under the project lock without duplicating live rows', async () => {
    const before = await live(own);
    const snapshots = await snapshotCount(own);

    await Promise.all([
      recomputeOpportunities(db, scope(own)),
      recomputeOpportunities(db, scope(own)),
    ]);

    const after = await live(own);
    expect(await snapshotCount(own)).toBe(snapshots + 2);
    expect(after.map((row) => row.rule_id)).toEqual(before.map((row) => row.rule_id));
    expect(after.map((row) => row.action_id)).toEqual(before.map((row) => row.action_id));
    const superseded = await db
      .selectFrom('opportunities')
      .select(['id', 'superseded_by_id'])
      .where(
        'id',
        'in',
        before.map((row) => row.id),
      )
      .execute();
    expect(superseded.every((row) => row.superseded_by_id !== null)).toBe(true);
  });

  it('supersedes without mutating, keeps Action identity and closes vanished rows', async () => {
    const s = await seed();
    await recomputeOpportunities(db, scope(s));
    const first = await live(s);
    await python('cite', s.workspace_id, s.analysis0_id);

    const snapshot = await recomputeOpportunities(db, scope(s));

    expect(snapshot.total_count).toBe(2);
    const second = await live(s);
    expect(second.map((row) => row.rule_id).sort()).toEqual([
      'missing_structured_data',
      'thin_content',
    ]);
    const closed = new Map(
      (
        await db
          .selectFrom('opportunities')
          .select(['id', 'superseded_by_id', 'superseded_at'])
          .where(
            'id',
            'in',
            first.map((row) => row.id),
          )
          .execute()
      ).map((row) => [row.id, row]),
    );
    const firstThin = byRule(first, 'thin_content');
    const secondThin = byRule(second, 'thin_content');
    expect(secondThin.id).not.toBe(firstThin.id);
    expect(secondThin.action_id).toBe(firstThin.action_id);
    expect(byRule(second, 'missing_structured_data').evidence).toEqual(
      byRule(first, 'missing_structured_data').evidence,
    );
    expect(closed.get(firstThin.id)?.superseded_by_id).toBe(secondThin.id);
    const absent = closed.get(byRule(first, 'brand_absent_high_value_prompt').id);
    expect(absent?.superseded_at).not.toBeNull();
    expect(absent?.superseded_by_id).toBeNull();
    // Its prompt Action keeps its row with the evidence cleared.
    const cleared = await db
      .selectFrom('actions')
      .select(['member_opportunity_ids', 'priority_score', 'evidence_cleared_at'])
      .where('id', '=', byRule(first, 'brand_absent_high_value_prompt').action_id!)
      .executeTakeFirstOrThrow();
    expect(cleared.member_opportunity_ids).toEqual([]);
    expect(cleared.priority_score).toBeNull();
    expect(cleared.evidence_cleared_at).not.toBeNull();
  });

  it('keeps a dismissed status across a refresh', async () => {
    const s = await seed();
    await recomputeOpportunities(db, scope(s));
    const thin = byRule(await live(s), 'thin_content');
    await updateActionStatus(db, s.workspace_id, thin.action_id!, 'dismissed', s.user_id);

    await recomputeOpportunities(db, scope(s));

    const action = await db
      .selectFrom('actions')
      .select(['status', 'member_opportunity_ids'])
      .where('id', '=', thin.action_id!)
      .executeTakeFirstOrThrow();
    expect(action.status).toBe('dismissed');
    expect(action.member_opportunity_ids).toEqual([byRule(await live(s), 'thin_content').id]);
  });

  it('adopts an Agent-created page Action instead of opening a second one', async () => {
    const s = await seed();
    const agent = await python<{ id: string; origin: string }>(
      'attach',
      s.workspace_id,
      s.project_id,
      s.user_id,
    );

    await recomputeOpportunities(db, scope(s));

    const thin = byRule(await live(s), 'thin_content');
    expect(thin.action_id).toBe(agent.id);
    const action = await db
      .selectFrom('actions')
      .select(['origin', 'target_url'])
      .where('id', '=', agent.id)
      .executeTakeFirstOrThrow();
    expect(action).toEqual({ origin: 'agent', target_url: URL_B });
  });
});

describe('Opportunity routes', () => {
  const base = (s: Seed) => `/api/v1/projects/${s.project_id}/opportunities`;

  it('lists, orders with a version and exports the persisted rows', async () => {
    const rows = await live(own);
    const listed = await request(own, base(own));
    expect(listed.status).toBe(200);
    const page = (await listed.response.json()) as {
      items: { id: string; order_source: string }[];
    };
    expect(page.items.map((item) => item.id)).toEqual(rows.map((row) => row.id));

    const reversed = rows.map((row) => row.id).reverse();
    const body = { ordered_opportunity_ids: reversed, expected_version: 0 };
    const ordered = await request(own, `${base(own)}/order`, { method: 'PUT', body });
    expect(ordered.status).toBe(200);
    const relisted = (await (await request(own, base(own))).response.json()) as typeof page;
    expect(relisted.items.map((item) => [item.id, item.order_source])).toEqual(
      reversed.map((id) => [id, 'manual']),
    );
    const stale = await request(own, `${base(own)}/order`, { method: 'PUT', body });
    expect(stale.status).toBe(409);
    expect(((await stale.response.json()) as { error: { code: string } }).error.code).toBe(
      'opportunity_order_conflict',
    );

    const csv = await request(own, `${base(own)}/export.csv`);
    expect(csv.status).toBe(200);
    expect(csv.response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect((await csv.response.text()).trim().split('\n')).toHaveLength(rows.length + 1);
  });

  it('recomputes on request and rejects a foreign audit as not found', async () => {
    const snapshots = await snapshotCount(own);
    const done = await request(own, `${base(own)}/recompute`, { method: 'POST' });
    expect(done.status).toBe(200);
    expect(await snapshotCount(own)).toBe(snapshots + 1);

    const foreignAudit = await request(own, `${base(own)}/recompute`, {
      method: 'POST',
      body: { audit_id: foreign.audit_id },
    });
    expect(foreignAudit.status).toBe(404);
  });

  it('pages by keyset, filters, and rejects a foreign cursor or unknown token', async () => {
    const s = await seed();
    await recomputeOpportunities(db, scope(s));
    type Page = { items: { rule_id: string }[]; next_cursor: string | null };
    const read = async (query: string) => {
      const { status, response } = await request(s, `${base(s)}?${query}`);
      return { status, body: (await response.json()) as Page & { error: { code: string } } };
    };

    const first = await read('limit=3');
    const rest = await read(`limit=3&cursor=${first.body.next_cursor}`);
    expect([...first.body.items, ...rest.body.items].map((item) => item.rule_id)).toEqual([
      'brand_absent_high_value_prompt',
      'owned_page_not_cited',
      'missing_structured_data',
      'thin_content',
    ]);
    expect(rest.body.next_cursor).toBeNull();
    expect((await read('rule_id=thin_content')).body.items.map((item) => item.rule_id)).toEqual([
      'thin_content',
    ]);
    expect((await read('min_priority=80')).body.items).toHaveLength(2);

    const replayed = await read(`limit=3&rule_id=thin_content&cursor=${first.body.next_cursor}`);
    expect([replayed.status, replayed.body.error.code]).toEqual([400, 'invalid_cursor']);
    const malformed = await read('cursor=not*a*cursor');
    expect([malformed.status, malformed.body.error.code]).toEqual([400, 'invalid_cursor']);
    for (const query of ['type=bogus', 'severity=bogus', 'status=bogus', 'min_priority=0x10'])
      expect([query, (await read(query)).status]).toEqual([query, 422]);

    const thin = byRule(await live(s), 'thin_content');
    await updateActionStatus(db, s.workspace_id, thin.action_id!, 'dismissed', s.user_id);
    expect((await read('status=dismissed')).body.items.map((item) => item.rule_id)).toEqual([
      'thin_content',
    ]);
  });

  it('serves summary, history, detail and Markdown export to the owner', async () => {
    const s = await seed();
    await recomputeOpportunities(db, scope(s));
    const json = async <T>(path: string) => {
      const { status, response } = await request(s, path);
      expect([path, status]).toEqual([path, 200]);
      return (await response.json()) as T;
    };
    type Summary = { computed: boolean; stale: boolean; total_count: number; source_mix: unknown };
    const summary = await json<Summary>(`${base(s)}/summary`);
    expect(summary).toMatchObject({ computed: true, stale: false, total_count: 4 });
    // The persisted source projection, with its exact audit provenance.
    expect(summary.source_mix).toMatchObject({
      state: 'available',
      audit_id: s.audit_id,
      counts: { competitive_evidence: 1 },
      eligible_analyzed_answers: 1,
      answers_with_sources: 1,
    });

    const history = await json<{ items: { rule_id: string; occurrence_count: number }[] }>(
      `${base(s)}/history`,
    );
    expect(history.items.map((item) => [item.rule_id, item.occurrence_count]).sort()).toEqual([
      ['brand_absent_high_value_prompt', 1],
      ['missing_structured_data', 1],
      ['owned_page_not_cited', 1],
      ['thin_content', 1],
    ]);
    const thin = byRule(await live(s), 'thin_content');
    const detail = await json<{ id: string; source_issue_ids: string[] }>(
      `/api/v1/opportunities/${thin.id}`,
    );
    expect(detail).toMatchObject({ id: thin.id, source_issue_ids: [s.issue_thin_id] });

    const markdown = await request(s, `${base(s)}/export.md`);
    expect(markdown.status).toBe(200);
    expect(markdown.response.headers.get('content-disposition')).toBe(
      `attachment; filename="opportunities-${s.project_id}.md"`,
    );

    // Newer scored evidence than the snapshot makes the summary stale.
    await db
      .updateTable('audits')
      .set({ completed_at: new Date(Date.now() + 3_600_000) })
      .where('id', '=', s.audit_id)
      .execute();
    expect((await json<Summary>(`${base(s)}/summary`)).stale).toBe(true);
  });

  it('requires a session', async () => {
    const response = await app.request(base(own));
    expect(response.status).toBe(401);
  });

  it('hides every route from a non-member', async () => {
    const [row] = await live(own);
    const paths: [string, string, unknown?][] = [
      ['GET', base(own)],
      ['GET', `${base(own)}/summary`],
      ['GET', `${base(own)}/history`],
      ['GET', `${base(own)}/export.md`],
      ['GET', `${base(own)}/export.csv`],
      ['GET', `/api/v1/opportunities/${row!.id}`],
      ['POST', `${base(own)}/recompute`],
      ['PUT', `${base(own)}/order`, { ordered_opportunity_ids: [], expected_version: 0 }],
    ];
    const snapshots = await snapshotCount(own);
    for (const [method, path, body] of paths) {
      const response = await request(own, path, { method, body, as: foreign });
      expect([method, path, response.status]).toEqual([method, path, 404]);
    }
    expect(await snapshotCount(own)).toBe(snapshots);
  });
});
