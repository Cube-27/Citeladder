import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { observeCommittedWork } from '../src/db/committed-work.ts';
import type { Database } from '../src/db/database.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { drainLanes, runnerOwners, tickAndDrain } from '../src/workers/runner.ts';
import { loadWorkerSettings } from '../src/config.ts';
import { Fixtures, testConfig, testDatabase } from './support.ts';
import { setLogSink } from '../src/logging.ts';

const config = testConfig({ DB_POOL_SIZE: '4', DB_MAX_OVERFLOW: '0' });
const db = testDatabase(config),
  reader = testDatabase(config);
const fixtures = new Fixtures(db);
let workspaces: string[];

async function enqueue(connection: Database, workspaceId = workspaces[0]!, id = randomUUID()) {
  const now = new Date();
  await connection
    .insertInto('analytics_tasks')
    .values({
      id,
      workspace_id: workspaceId,
      task_kind: 'traffic_snapshot_refresh',
      payload: {},
      idempotency_key: `runner-test:${id}`,
      status: 'queued',
      priority: 0,
      randomized_position: 0,
      available_at: now,
      attempt_count: 0,
      max_attempts: 3,
      error_code: '',
      error_detail: '',
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return id;
}
beforeAll(async () => {
  const user = await fixtures.user();
  workspaces = [await fixtures.ownedWorkspace(user), await fixtures.joinedWorkspace(user)];
});
beforeEach(async () => {
  await db.deleteFrom('analytics_tasks').where('workspace_id', 'in', workspaces).execute();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
  await reader.destroy();
});

describe('committed API work at PostgreSQL', () => {
  it('starts after commit; an independent connection sees the durable row', async () => {
    const id = randomUUID();
    const wake = vi.fn(async () => {
      expect(
        await reader
          .selectFrom('analytics_tasks')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst(),
      ).toEqual({ id });
    });
    await observeCommittedWork(async () => {
      await db.transaction().execute(async (trx) => {
        await enqueue(trx, workspaces[0], id);
        expect(
          await reader
            .selectFrom('analytics_tasks')
            .select('id')
            .where('id', '=', id)
            .executeTakeFirst(),
        ).toBeUndefined();
        expect(wake).not.toHaveBeenCalled();
      });
    }, wake);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('does not wake for rolled-back work, empty updates or conflict no-ops', async () => {
    const wake = vi.fn(async () => {});
    await expect(
      observeCommittedWork(async () => {
        await db.transaction().execute(async (trx) => {
          await enqueue(trx);
          throw new Error('rollback');
        });
      }, wake),
    ).rejects.toThrow('rollback');
    const id = await enqueue(db);
    await observeCommittedWork(async () => {
      await enqueue(db, workspaces[0], id);
      await db
        .updateTable('analytics_tasks')
        .set({ status: 'queued' })
        .where('id', '=', randomUUID())
        .execute();
      await db.selectFrom('analytics_tasks').selectAll().execute();
    }, wake);
    expect(wake).not.toHaveBeenCalled();
  });

  it('treats SQL parameter objects as data rather than executable query nodes', async () => {
    const wake = vi.fn(async () => {});
    const payload = {
      kind: 'InsertQueryNode',
      into: {
        kind: 'TableNode',
        table: { identifier: { name: 'analytics_tasks' } },
      },
    };
    await observeCommittedWork(async () => {
      await db
        .updateTable('workspaces')
        .set({ name: sql<string>`${payload}::jsonb::text` })
        .where('id', '=', workspaces[0]!)
        .execute();
    }, wake);
    expect(wake).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'respects rollback-to-savepoint while retaining earlier work (%s)',
    async (earlier) => {
      const wake = vi.fn(async () => {});
      await observeCommittedWork(async () => {
        await db.transaction().execute(async (trx) => {
          if (earlier) await enqueue(trx);
          await sql`savepoint later_work`.execute(trx);
          await enqueue(trx);
          await sql`rollback to savepoint later_work`.execute(trx);
          await sql`release savepoint later_work`.execute(trx);
        });
      }, wake);
      expect(wake).toHaveBeenCalledTimes(earlier ? 1 : 0);
    },
  );

  it('does not mistake COMMIT in an aborted transaction for durable work', async () => {
    const wake = vi.fn(async () => {});
    await observeCommittedWork(async () => {
      await db.transaction().execute(async (trx) => {
        await enqueue(trx);
        await sql`select 1 / 0`.execute(trx).catch(() => {});
      });
    }, wake);
    expect(wake).not.toHaveBeenCalled();
  });

  it('preserves quoted savepoint identity and clears an error after rollback to a savepoint', async () => {
    const wake = vi.fn(async () => {});
    await observeCommittedWork(async () => {
      await db.transaction().execute(async (trx) => {
        await sql`savepoint "Upper"`.execute(trx);
        await enqueue(trx);
        await sql`savepoint "upper"`.execute(trx);
        await sql`select 1 / 0`.execute(trx).catch(() => {});
        await sql`rollback to savepoint "Upper"`.execute(trx);
        await sql`release savepoint "Upper"`.execute(trx);
      });
    }, wake);
    expect(wake).not.toHaveBeenCalled();
    await observeCommittedWork(async () => {
      await db.transaction().execute(async (trx) => {
        await enqueue(trx);
        await sql`savepoint later`.execute(trx);
        await sql`select 1 / 0`.execute(trx).catch(() => {});
        await sql`rollback to savepoint later`.execute(trx);
        await sql`release savepoint later`.execute(trx);
      });
    }, wake);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('wakes for an autocommitted retry and committed work preceding an HTTP failure, never for GET', async () => {
    const id = await enqueue(db);
    const wake = vi.fn(async () => {});
    const app = createApp(config, db, { startRunner: wake });
    app.post('/retry-fixture', async (c) => {
      await db
        .updateTable('analytics_tasks')
        .set({ status: 'retry_wait' })
        .where('id', '=', id)
        .execute();
      return c.json({ status: 'queued' });
    });
    app.post('/partial-fixture', async () => {
      await db.transaction().execute((trx) => enqueue(trx));
      throw new Error('later operation failed');
    });
    app.get('/read-fixture', async (c) =>
      c.json(await db.selectFrom('analytics_tasks').select('id').execute()),
    );
    const restore = setLogSink(() => {});
    try {
      expect((await app.request('/retry-fixture', { method: 'POST' })).status).toBe(200);
      expect((await app.request('/partial-fixture', { method: 'POST' })).status).toBe(500);
      expect((await app.request('/read-fixture')).status).toBe(200);
      expect(wake).toHaveBeenCalledTimes(2);
    } finally {
      setLogSink(restore);
    }
  });

  it('keeps concurrent committing and rolling-back workspace requests separate', async () => {
    const committed = vi.fn(async () => {}),
      rolledBack = vi.fn(async () => {});
    await Promise.all([
      observeCommittedWork(async () => {
        await db.transaction().execute((trx) => enqueue(trx, workspaces[0]));
      }, committed),
      observeCommittedWork(async () => {
        await db
          .transaction()
          .execute(async (trx) => {
            await enqueue(trx, workspaces[1]);
            throw new Error('rollback');
          })
          .catch(() => {});
      }, rolledBack),
    ]);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(rolledBack).not.toHaveBeenCalled();
  });
});

it('overlapping runners share real leases and settle each workspace task once', async () => {
  const ids = await Promise.all(workspaces.map((workspace) => enqueue(db, workspace)));
  const executed: string[] = [];
  const worker = () =>
    new AnalyticsWorker(db, loadWorkerSettings({}), {
      executors: {
        traffic_snapshot_refresh: async (task) => {
          executed.push(task.id);
          await Promise.resolve();
        },
      },
    });
  const first = worker(),
    second = worker();
  const options = { signal: new AbortController().signal, deadline: performance.now() + 10000 };
  await Promise.all([
    drainLanes([{ name: 'analytics', run: () => first.runOnce() }], options),
    drainLanes([{ name: 'analytics', run: () => second.runOnce() }], options),
  ]);
  expect(executed.sort()).toEqual(ids.sort());
  const rows = await db
    .selectFrom('analytics_tasks')
    .select(['status', 'attempt_count'])
    .where('id', 'in', ids)
    .execute();
  expect(rows).toEqual([
    { status: 'succeeded', attempt_count: 1 },
    { status: 'succeeded', attempt_count: 1 },
  ]);
});

it('composes every production lane and periodic owner on an idle disposable database', async () => {
  // Global workers must not claim rows retained by other files in the shared suite.
  const schema = `runner_test_${randomUUID().replaceAll('-', '')}`;
  await sql`create schema ${sql.id(schema)}`.execute(db);
  const url = new URL(config.databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const isolatedConfig = testConfig({
    DATABASE_URL: url.toString(),
    DB_POOL_SIZE: '4',
    DB_MAX_OVERFLOW: '0',
  });
  const isolated = testDatabase(isolatedConfig);
  try {
    const tables = await sql<{
      tablename: string;
    }>`select tablename from pg_catalog.pg_tables where schemaname = 'public'`.execute(db);
    // Idle owners need column contracts, without duplicating every production index.
    for (const table of tables.rows)
      await sql`create table ${sql.id(schema, table.tablename)} (like ${sql.id('public', table.tablename)})`.execute(
        db,
      );
    const owners = await runnerOwners(isolated, isolatedConfig);
    expect(
      await tickAndDrain(owners, {
        signal: new AbortController().signal,
        deadline: performance.now() + 30000,
        firstLane: 0,
      }),
    ).toBe(0);
  } finally {
    await isolated.destroy();
    await sql`drop schema ${sql.id(schema)} cascade`.execute(db);
  }
});
