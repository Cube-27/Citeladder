/** The real post-connect chain crosses Python enqueue/readers and both workers. */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { loadWorkerSettings } from '../src/config.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { Fixtures, testDatabase } from './support.ts';
import { seedImport } from './referral-fixtures.ts';
import { importSeed, metric, requests, tenant, WINDOW } from './traffic-fixtures.ts';

const db = testDatabase(),
  fixtures = new Fixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

it('takes a first connect through both workers to analysis_ready without provider I/O', async () => {
  const t = await tenant(db, fixtures);
  const gsc = await seedImport(db, {
      ...t,
      dataset: 'gsc_day_daily',
      window: WINDOW,
      provider: 'gsc',
    }),
    ga4 = await importSeed(db, t, 'ga4_channel_daily');
  for (const seed of [gsc, ga4])
    await db
      .updateTable('integration_sync_runs')
      .set({ sync_kind: 'backfill' })
      .where('id', '=', seed.syncRunId)
      .execute();
  await metric(db, gsc, { metrics: { clicks: 30, impressions: 300, position: 4.5 } });
  await metric(db, ga4, {
    values: ['Organic Search', '20260728'],
    metrics: { sessions: 40, engagedSessions: 25 },
  });
  for (let i = 0; i < 12; i++) {
    await metric(db, gsc, {
      dataset: 'gsc_query_daily',
      values: [`query ${i}`, WINDOW[1]],
      metrics: { clicks: i, impressions: 100 },
    });
    await metric(db, gsc, {
      dataset: 'gsc_query_page_daily',
      values: [`query ${i}`, 'https://example.test/page', WINDOW[1]],
      metrics: { clicks: i, impressions: 100 },
    });
  }
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const python = fileURLToPath(
    new URL(
      `../../../../backend/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`,
      import.meta.url,
    ),
  );
  // Whitelist transport/runtime variables: inherited provider secrets never enter tests.
  const env = Object.fromEntries(
    ['PATH', 'SystemRoot', 'TEMP', 'TMP'].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const run = async (phase: string, cursor = '') => {
    const result = await promisify(execFile)(
      python,
      [
        '-c',
        `
import asyncio, json, uuid
from datetime import date
from app.core.database import SessionLocal, engine
from app.domain.analytics.enqueue import enqueue_post_sync_projections
from app.domain.integrations.readiness import get_project_readiness
from app.domain.traffic.performance import get_performance_dashboard, get_performance_table
from app.domain.demand.query_evidence_reads import latest_query_evidence_snapshot, list_query_evidence
from app.workers.analytics_worker import AnalyticsWorker
async def main():
    async with SessionLocal() as session:
        if '${phase}' == 'enqueue':
            await enqueue_post_sync_projections(session, project_id=uuid.UUID('${t.projectId}'), import_artifact_ids=[uuid.UUID('${gsc.artifactId}'), uuid.UUID('${ga4.artifactId}')])
            await session.commit()
    count = await AnalyticsWorker(session_factory=SessionLocal, owner='cold-connect-python').run_until_idle()
    async with SessionLocal() as session:
        readiness = await get_project_readiness(session, workspace_id=uuid.UUID('${t.workspaceId}'), project_id=uuid.UUID('${t.projectId}'))
        result = {'ran': count, 'readiness': readiness.model_dump(mode='json')}
        if '${phase}' == 'finish':
            scope = dict(workspace_id=uuid.UUID('${t.workspaceId}'), project_id=uuid.UUID('${t.projectId}'))
            dashboard = await get_performance_dashboard(session, **scope, range_token='month')
            table = await get_performance_table(session, **scope, snapshot_id=dashboard.selected.snapshot_id, cursor='${cursor}' or None)
            query = await latest_query_evidence_snapshot(session, **scope, window_start=date.fromisoformat('${WINDOW[0]}'), window_end=date.fromisoformat('${WINDOW[1]}'))
            page = await list_query_evidence(session, snapshot=query, limit=2)
            result.update(dashboard=dashboard.model_dump(mode='json'), table=table.model_dump(mode='json'), query_ids=[str(r.id) for r in page.rows], query_cursor=page.next_cursor)
        print(json.dumps(result))
    await engine.dispose()
asyncio.run(main())
`,
      ],
      {
        cwd: backend,
        env: {
          ...env,
          CITELADDER_DISABLE_DOTENV: '1',
          DATABASE_URL: process.env.API_TEST_DATABASE_URL!.replace(
            'postgresql://',
            'postgresql+asyncpg://',
          ),
        },
      },
    );
    return JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  };
  expect((await run('enqueue')).ran).toBe(0);
  const worker = new AnalyticsWorker(db, loadWorkerSettings({}));
  expect(await worker.runUntilIdle()).toBeGreaterThanOrEqual(2);
  const request = requests(db, t);
  const dashboard = await request('performance?range=month');
  const tablePath = `performance/table?snapshot_id=${dashboard.body.selected.snapshot_id}`;
  const first = await request(tablePath);
  const completed = await run('finish', first.body.next_cursor!);
  expect(completed.dashboard).toEqual(dashboard.body);
  expect(completed.table).toEqual(
    (await request(`${tablePath}&cursor=${encodeURIComponent(first.body.next_cursor!)}`)).body,
  );
  const queries = await request(
    `demand/query-evidence?window_start=${WINDOW[0]}&window_end=${WINDOW[1]}&limit=2`,
  );
  expect(completed.query_ids).toEqual(queries.body.items.map((r) => r.id));
  expect(completed.query_cursor).toBe(queries.body.next_cursor);
  // The TS worker drains the whole chain, Opportunity refresh included.
  expect(completed.ran).toBe(0);
  expect(completed.readiness).toMatchObject({
    stage: 'analysis_ready',
    connection_count: 2,
    providers: ['ga4', 'gsc'],
    has_performance_snapshot: true,
    has_demand_snapshot: true,
    imported_through: WINDOW[1],
  });
  const tasks = await db
    .selectFrom('analytics_tasks')
    .select(['status', 'error_detail'])
    .where('workspace_id', '=', t.workspaceId)
    .execute();
  expect(
    tasks.every((row) => row.status === 'succeeded'),
    JSON.stringify(tasks),
  ).toBe(true);
}, 30_000);
