import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  drainLanes,
  exclusiveDrain,
  idlePause,
  LaneFailures,
  tickAndDrain,
  runnerOwners,
} from '../src/workers/runner.ts';
import { startSuccessor } from '../src/workers/execution-process.ts';
import { SiteHealthWorker } from '../src/workers/site-health-worker.ts';
import { SiteFixtures } from './site-health-fixtures.ts';
import { siteWorkerSettings } from '../src/site-health/runtime.ts';
import { sql } from 'kysely';
import { createDatabase } from '../src/db/database.ts';
import { testConfig } from './support.ts';
import { executionSettings } from '../src/config/execution.ts';
import { runnerStarter } from '../src/workers/start-runner.ts';
import { loadConfig } from '../src/config.ts';
import { setLogSink } from '../src/logging.ts';

const options = () => ({
  signal: new AbortController().signal,
  deadline: 100,
  now: () => 0,
  firstLane: 0,
});

describe('bounded runner', () => {
  it('settles a Site Health batch with queued heartbeats under the real runner pool bound', async () => {
    const config = testConfig({ RUNNER_DB_POOL_SIZE: '4' });
    const db = createDatabase(config, { execution: true });
    const fixtures = new SiteFixtures(db);
    try {
      const ids = [];
      for (let index = 0; index < config.execution.poolSize; index++) {
        const seed = await fixtures.crawl('running');
        ids.push(await fixtures.task(seed));
      }
      const worker = new SiteHealthWorker(db, {
        settings: { ...siteWorkerSettings({}), concurrency: 4, heartbeat: 0.01 },
        executors: {
          link_metrics: async (trx) => {
            await sql`select pg_sleep(0.2)`.execute(trx);
          },
        },
      });
      const heartbeat = vi.spyOn(worker.queue, 'heartbeat');
      expect(await worker.runOnce(config.execution.poolSize)).toBe(4);
      const rows = await db
        .selectFrom('site_crawl_tasks')
        .select(['id', 'status', 'attempt_count', 'lease_owner'])
        .where('id', 'in', ids)
        .execute();
      expect(rows).toHaveLength(4);
      expect(
        rows.every(
          (row) =>
            row.status === 'succeeded' && row.attempt_count === 1 && row.lease_owner === null,
        ),
      ).toBe(true);
      expect(heartbeat).toHaveBeenCalled();
    } finally {
      await fixtures.cleanup();
      await db.destroy();
    }
  });
  it.each([1, 8])(
    'bounds Site Health batches by its policy and the pool (worker limit %i)',
    async (concurrency) => {
      const config = testConfig({ SITE_HEALTH_WORKER_CONCURRENCY: String(concurrency) });
      const db = createDatabase(config, { execution: true });
      const run = vi.spyOn(SiteHealthWorker.prototype, 'drain').mockResolvedValue(0);
      try {
        const owners = await runnerOwners(db, config);
        await owners.lanes.find((lane) => lane.name === 'site-health')!.run(() => true);
        expect(run).toHaveBeenCalledWith(
          Math.min(concurrency, config.execution.poolSize),
          expect.any(Function),
        );
      } finally {
        run.mockRestore();
        await db.destroy();
      }
    },
  );
  it('passes the same live budget to periodic work and stops within a phase', async () => {
    let clock = 0;
    let processed = 0;
    const drain = vi.fn(async () => 0);
    await tickAndDrain(
      {
        periodic: [
          {
            name: 'batch',
            run: async (canAdmit) => {
              while (canAdmit()) {
                processed++;
                clock = 101;
              }
            },
          },
        ],
        lanes: [{ name: 'tasks', run: drain }],
      },
      { ...options(), now: () => clock },
    );
    expect(processed).toBe(1);
    expect(drain).not.toHaveBeenCalled();
  });
  it('keeps an idle drain until deferred work is due within the budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T00:00:00Z') });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    let due: Date | null = new Date(Date.now() + 2000);
    let deferred = 1;
    const pauses: number[] = [];
    const tasks = await drainLanes(
      [
        {
          name: 'site-health',
          run: async () => {
            if (!deferred || pauses.length === 0) return 0;
            deferred = 0;
            due = null;
            return 1;
          },
          nextDue: async () => due,
        },
      ],
      { ...options(), deadline: 10_000, pause: async (ms) => pauses.push(ms) },
    );
    expect(tasks).toBe(1);
    expect(pauses).toEqual([2000]);
  });

  it('leaves work due after the deadline instead of pausing past it', async () => {
    const pause = vi.fn(async () => undefined);
    const tasks = await drainLanes(
      [
        {
          name: 'site-health',
          run: async () => 0,
          nextDue: async () => new Date(Date.now() + 60_000),
        },
      ],
      { ...options(), deadline: 10_000, pause },
    );
    expect(tasks).toBe(0);
    expect(pause).not.toHaveBeenCalled();
  });

  it('pauses only within the remaining budget and backs off on due-but-unclaimed work', () => {
    expect(idlePause(null, 10_000, 5000)).toBeNull();
    expect(idlePause(40, 300, 5000)).toBe(40);
    // A due row another claimer holds must not spin, nor pause past the deadline.
    expect(idlePause(0, 10_000, 5000)).toBe(250);
    expect(idlePause(0, 200, 5000)).toBeNull();
    expect(idlePause(60_000, 300_000, 5000)).toBe(5000);
    expect(idlePause(9000, 8000, 5000)).toBeNull();
  });

  it('reports the earlier of deferred Site Health work and a lease that will expire', async () => {
    const db = createDatabase(testConfig({}), { execution: true });
    const fixtures = new SiteFixtures(db);
    try {
      const seed = await fixtures.crawl('running');
      const worker = new SiteHealthWorker(db, {
        taskScope: { workspaceId: seed.workspaceId, crawlId: seed.crawlId },
      });
      expect(await worker.nextDue()).toBeNull();
      const later = new Date(Date.now() + 30_000);
      const expiry = new Date(Date.now() + 5000);
      const [deferred, running] = [await fixtures.task(seed), await fixtures.task(seed)];
      await db
        .updateTable('site_crawl_tasks')
        .set({ available_at: later })
        .where('id', '=', deferred)
        .execute();
      await db
        .updateTable('site_crawl_tasks')
        .set({ status: 'running', lease_owner: 'dead-worker', lease_expires_at: expiry })
        .where('id', '=', running)
        .execute();
      // A killed holder's lease is recovered at expiry, so the runner must stay for it.
      expect((await worker.nextDue())?.getTime()).toBe(expiry.getTime());
      await db
        .updateTable('site_crawl_tasks')
        .set({ status: 'succeeded', lease_owner: null, lease_expires_at: null })
        .where('id', '=', running)
        .execute();
      expect((await worker.nextDue())?.getTime()).toBe(later.getTime());
    } finally {
      await fixtures.cleanup();
      await db.destroy();
    }
  });

  it('releases a contended Site Health task without failing the lane or charging an attempt', async () => {
    const db = createDatabase(testConfig({}), { execution: true });
    const fixtures = new SiteFixtures(db);
    const restore = setLogSink(() => {});
    try {
      const seed = await fixtures.crawl('running');
      const id = await fixtures.task(seed);
      const lockTimeout = () => Object.assign(new Error('lock timeout'), { code: '55P03' });
      const worker = new SiteHealthWorker(db, {
        taskScope: { workspaceId: seed.workspaceId, crawlId: seed.crawlId },
        executors: {
          link_metrics: async () => {
            throw lockTimeout();
          },
        },
      });
      // A sibling still holds the crawl lock when the failure is settled.
      vi.spyOn(worker, 'fail').mockRejectedValueOnce(lockTimeout());
      expect(await worker.runOnce(1)).toBe(1);
      expect(
        await db
          .selectFrom('site_crawl_tasks')
          .select(['status', 'attempt_count', 'conflict_count', 'lease_owner', 'error_code'])
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
      ).toEqual({
        status: 'retry_wait',
        attempt_count: 0,
        conflict_count: 1,
        lease_owner: null,
        error_code: 'db_conflict',
      });
    } finally {
      setLogSink(restore);
      await fixtures.cleanup();
      await db.destroy();
    }
  });

  it('still starts a successor for the owners that did not fail', async () => {
    const restore = setLogSink(() => {});
    try {
      const lanes = [
        {
          name: 'bad',
          run: async () => {
            throw new Error('database unavailable');
          },
          nextDue: async () => new Date(),
        },
        {
          name: 'good',
          run: async () => 0,
          nextDue: async () => new Date(Date.now() + 1000),
        },
      ];
      const error = await drainLanes(lanes, options()).catch((caught: unknown) => caught);
      if (!(error instanceof LaneFailures)) throw new Error('expected lane failures');
      const failed = error.lanes;
      expect([...failed]).toEqual(['bad']);
      const started: string[] = [];
      const start = async () => {
        started.push('successor');
      };
      const live = new AbortController().signal;
      const remaining = lanes.filter((lane) => !failed.has(lane.name));
      expect(
        await startSuccessor({ lanes: remaining, budgetMs: 300_000, signal: live, start }),
      ).toBe(true);
      // Work due beyond a fresh budget waits for tick.
      expect(await startSuccessor({ lanes: remaining, budgetMs: 500, signal: live, start })).toBe(
        false,
      );
      expect(started).toEqual(['successor']);
    } finally {
      setLogSink(restore);
    }
  });

  it('drains successors into earlier lanes before declaring idle', async () => {
    let earlier = 0,
      later = 1;
    const seen: string[] = [];
    const tasks = await drainLanes(
      [
        {
          name: 'earlier',
          run: async () => {
            seen.push('earlier');
            const count = earlier;
            earlier = 0;
            return count;
          },
        },
        {
          name: 'later',
          run: async () => {
            seen.push('later');
            if (!later) return 0;
            later--;
            earlier++;
            return 1;
          },
        },
      ],
      options(),
    );
    expect(tasks).toBe(2);
    expect(seen).toEqual(['earlier', 'later', 'earlier', 'later', 'earlier', 'later']);
  });

  it.each(['deadline', 'signal'])(
    'finishes claimed work but admits nothing after %s',
    async (reason) => {
      let clock = 0;
      const stop = new AbortController();
      const second = vi.fn(async () => 1);
      const completed: string[] = [];
      await drainLanes(
        [
          {
            name: 'first',
            run: async () => {
              if (reason === 'signal') stop.abort();
              else clock = 101;
              await Promise.resolve();
              completed.push('settled');
              return 1;
            },
          },
          { name: 'second', run: second },
        ],
        { ...options(), signal: stop.signal, now: () => clock },
      );
      expect(completed).toEqual(['settled']);
      expect(second).not.toHaveBeenCalled();
    },
  );

  it('tries independent owners once after a lane failure and reports failure', async () => {
    const bad = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const good = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);
    const restore = setLogSink(() => {});
    try {
      await expect(
        drainLanes(
          [
            { name: 'bad', run: bad },
            { name: 'good', run: good },
          ],
          options(),
        ),
      ).rejects.toThrow('Runner lanes failed');
      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(2);
    } finally {
      setLogSink(restore);
    }
  });

  it('runs periodic work once before draining, and preserves remaining budget', async () => {
    let clock = 0;
    const seen: string[] = [];
    await tickAndDrain(
      {
        periodic: [
          {
            name: 'schedules',
            run: async () => {
              seen.push('scheduled');
              clock = 60;
            },
          },
        ],
        lanes: [
          {
            name: 'tasks',
            run: async () => {
              seen.push('settled');
              clock = 101;
              return 1;
            },
          },
        ],
      },
      { ...options(), now: () => clock },
    );
    expect(seen).toEqual(['scheduled', 'settled']);
  });

  it('still drains and runs other phases after one periodic owner fails', async () => {
    const completed = vi.fn(async () => 0);
    const restore = setLogSink(() => {});
    try {
      await expect(
        tickAndDrain(
          {
            periodic: [
              {
                name: 'failed',
                run: async () => {
                  throw new Error('failed');
                },
              },
              { name: 'other', run: completed },
            ],
            lanes: [{ name: 'drain', run: completed }],
          },
          options(),
        ),
      ).rejects.toThrow('Tick failed');
      expect(completed).toHaveBeenCalledTimes(2);
    } finally {
      setLogSink(restore);
    }
  });
});

describe('Cloud Run wake-up', () => {
  const job = 'projects/citeladder-test/locations/us-central1/jobs/runner';
  const db = createDatabase(testConfig());
  afterAll(() => db.destroy());
  it('coalesces a burst and permits another launch after the interval', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'recorded-access-token' }))
      .mockResolvedValueOnce(Response.json({ name: 'operations/test' }))
      .mockResolvedValueOnce(Response.json({ access_token: 'recorded-access-token' }))
      .mockResolvedValueOnce(Response.json({ name: 'operations/test2' }));
    let clock = 0;
    const start = runnerStarter(
      testConfig({ CLOUD_RUN_RUNNER_JOB: job, CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32) }),
      db,
      send,
      () => clock,
    );
    await Promise.all(Array.from({ length: 20 }, () => start()));
    expect(send).toHaveBeenCalledTimes(2);
    clock = 5000;
    await start();
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[0]).toMatchObject([
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    ]);
    expect(send.mock.calls[1]).toMatchObject([
      `https://run.googleapis.com/v2/${job}:run`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer recorded-access-token' },
        body: '{}',
        redirect: 'error',
      },
    ]);
  });
  it('is disabled without a job, and failure leaves the committed response usable without secret diagnostics', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('private bearer token'));
    await runnerStarter(loadConfig({}), db, send)();
    expect(send).not.toHaveBeenCalled();
    const records: Record<string, unknown>[] = [];
    const restore = setLogSink((line) => records.push(JSON.parse(line)));
    try {
      await expect(
        runnerStarter(
          testConfig({ CLOUD_RUN_RUNNER_JOB: job, CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32) }),
          db,
          send,
        )(),
      ).resolves.toBeUndefined();
    } finally {
      setLogSink(restore);
    }
    expect(records).toEqual([
      expect.objectContaining({ event: 'runner_start_failed', level: 'warning' }),
    ]);
    expect(JSON.stringify(records)).not.toContain('private bearer token');
  });

  it('skips Google requests while a runner holds the database drain lock', async () => {
    const config = testConfig({
      CLOUD_RUN_RUNNER_JOB: job,
      CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32),
    });
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'recorded-access-token' }))
      .mockResolvedValueOnce(Response.json({ name: 'operations/test' }));
    const start = runnerStarter(config, db, send, () => 0);
    await exclusiveDrain(config, {
      signal: new AbortController().signal,
      deadline: Number.POSITIVE_INFINITY,
    })(async () => {
      await start();
      expect(send).not.toHaveBeenCalled();
      return 0;
    });
    await start();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('continues a bounded launch when the drain probe fails', async () => {
    const unavailable = createDatabase(testConfig());
    await unavailable.destroy();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'recorded-access-token' }))
      .mockResolvedValueOnce(Response.json({ name: 'operations/test' }));
    const restore = setLogSink(() => {});
    try {
      const start = runnerStarter(
        testConfig({ CLOUD_RUN_RUNNER_JOB: job, CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32) }),
        unavailable,
        send,
        () => 0,
      );
      await start();
      await start();
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      setLogSink(restore);
    }
  });

  it('bounds a stalled PostgreSQL lock probe by the wake deadline', async () => {
    const delayed = db.withPlugin({
      transformQuery: () => sql`select pg_sleep(0.2), false as held`.toOperationNode(),
      transformResult: async ({ result }) => result,
    });
    const send = vi.fn<typeof fetch>();
    const restore = setLogSink(() => {});
    try {
      await runnerStarter(
        testConfig({
          CLOUD_RUN_RUNNER_JOB: job,
          CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32),
          RUNNER_WAKE_TIMEOUT_MS: '20',
        }),
        delayed,
        send,
      )();
      expect(send).not.toHaveBeenCalled();
    } finally {
      setLogSink(restore);
    }
  });

  it('keeps a newer launch reservation when an older probe reports an active drain', async () => {
    let probes = 0;
    const delayed = db.withPlugin({
      transformQuery: () =>
        (++probes === 1
          ? sql`select pg_sleep(0.1), true as held`
          : sql`select false as held`
        ).toOperationNode(),
      transformResult: async ({ result }) => result,
    });
    let clock = 0;
    const send = vi.fn<typeof fetch>(async (url) =>
      Response.json(
        String(url).startsWith('http:')
          ? { access_token: 'recorded' }
          : { name: 'operations/test' },
      ),
    );
    const start = runnerStarter(
      testConfig({ CLOUD_RUN_RUNNER_JOB: job, CITELADDER_ORIGIN_TOKEN: 'a'.repeat(32) }),
      delayed,
      send,
      () => clock,
    );
    const older = start();
    clock = 5000;
    await start();
    await older;
    clock = 5001;
    await start();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

it('refuses arbitrary credential destinations, unbounded pools and unprotected Cloud Run API startup', () => {
  expect(() => executionSettings({ CLOUD_RUN_RUNNER_JOB: 'https://example.test/job' })).toThrow();
  expect(() => executionSettings({ RUNNER_DB_POOL_SIZE: '5' })).toThrow();
  expect(() => executionSettings({ RUNNER_BUDGET_SECONDS: '0' })).toThrow();
  expect(() => executionSettings({ K_SERVICE: 'api' })).toThrow();
  expect(() => executionSettings({ CITELADDER_ORIGIN_TOKEN_PREVIOUS: 'a'.repeat(32) })).toThrow();
  // A job execution serves no HTTP; it may start its successor without the origin token.
  const job = 'projects/p/locations/us-central1/jobs/citeladder-runner';
  expect(
    executionSettings({ CLOUD_RUN_RUNNER_JOB: job, CLOUD_RUN_JOB: 'citeladder-runner' }),
  ).toMatchObject({
    runnerJob: job,
    protectOrigin: false,
  });
  expect(() => executionSettings({ CLOUD_RUN_RUNNER_JOB: job })).toThrow();
});

describe('exclusive drain on PostgreSQL', () => {
  const live = () => ({ signal: new AbortController().signal, deadline: Number.POSITIVE_INFINITY });

  it('admits one drain at a time and lets a later execution take over once it ends', async () => {
    const config = testConfig();
    const holding = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const active = exclusiveDrain(
      config,
      live(),
      0,
    )(async () => {
      started.resolve();
      await holding.promise;
      return 3;
    });
    try {
      await started.promise;
      const blocked = vi.fn(async () => 1);
      // A concurrent execution gives up without draining while the lock is held.
      expect(await exclusiveDrain(config, live(), 300)(blocked)).toBe(0);
      expect(blocked).not.toHaveBeenCalled();
      // A waiting execution proceeds as soon as the active drain releases.
      const waiting = exclusiveDrain(config, live(), 5_000)(async () => 2);
      holding.resolve();
      expect(await active).toBe(3);
      expect(await waiting).toBe(2);
    } finally {
      // A failed assertion must not leave the lock session open.
      holding.resolve();
      await active.catch(() => undefined);
    }
  });

  it('keeps the only pooled connection free for lanes that query the database', async () => {
    const config = testConfig({ RUNNER_DB_POOL_SIZE: '1', DB_POOL_TIMEOUT_SECONDS: '2' });
    const db = createDatabase(config, { execution: true });
    try {
      const drained = await exclusiveDrain(
        config,
        live(),
        0,
      )(async () => {
        const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db);
        return rows[0]!.one;
      });
      expect(drained).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});
