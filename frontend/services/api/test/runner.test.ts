import { afterAll, describe, expect, it, vi } from 'vitest';
import { drainLanes, exclusiveDrain, tickAndDrain } from '../src/workers/runner.ts';
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
