/** Post-connect crosses the retained Python enqueue and TypeScript projections. */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { loadWorkerSettings } from '../src/config.ts';
import { readProjectReadiness } from '../src/integrations/readiness.ts';
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
  const run = async (phase: string) => {
    const result = await promisify(execFile)(
      python,
      [
        '-c',
        `
import asyncio, json, uuid
from app.core.database import SessionLocal, engine
from app.domain.analytics.enqueue import enqueue_post_sync_projections
from app.workers.analytics_worker import AnalyticsWorker
async def main():
    async with SessionLocal() as session:
        if '${phase}' == 'enqueue':
            await enqueue_post_sync_projections(session, project_id=uuid.UUID('${t.projectId}'), import_artifact_ids=[uuid.UUID('${gsc.artifactId}'), uuid.UUID('${ga4.artifactId}')])
            await session.commit()
    count = await AnalyticsWorker(session_factory=SessionLocal, owner='cold-connect-python').run_until_idle()
    print(json.dumps({'ran': count}))
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
  expect(first.body.items.length).toBeGreaterThan(0);
  const queries = await request(
    `demand/query-evidence?window_start=${WINDOW[0]}&window_end=${WINDOW[1]}&limit=2`,
  );
  expect(queries.body.items).toHaveLength(2);
  const next = await request(
    `demand/query-evidence?window_start=${WINDOW[0]}&window_end=${WINDOW[1]}&limit=2&cursor=${encodeURIComponent(queries.body.next_cursor!)}`,
  );
  expect(next.body.items).toHaveLength(2);
  expect(
    next.body.items.some((row) => queries.body.items.some((first) => first.id === row.id)),
  ).toBe(false);
  // The TS worker drains the whole chain, Opportunity refresh included.
  expect((await run('finish')).ran).toBe(0);
  expect(await readProjectReadiness(db, t)).toMatchObject({
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
