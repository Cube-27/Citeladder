import type { Hono } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { startSuccessor } from './execution-process.ts';
import { runnerOwners, runPeriodic } from './runner.ts';

const SCHEDULED_TICK_PATH = '/internal/tick';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

type SchedulerIdentity = { invoker: string; audience: string };

async function fromScheduler(
  authorization: string | undefined,
  expected: SchedulerIdentity,
  keys: JWTVerifyGetKey,
): Promise<boolean> {
  const token = /^Bearer (\S+)$/u.exec(authorization ?? '')?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: expected.audience,
      algorithms: ['RS256'],
    });
    return payload.email === expected.invoker && payload.email_verified === true;
  } catch {
    return false;
  }
}

export function registerScheduledTick(
  app: Hono<AppEnv>,
  config: ServiceConfig,
  db: Database,
  options: { startRunner: () => Promise<boolean>; keys?: JWTVerifyGetKey },
): void {
  const tick = config.execution.scheduledTick;
  if (!tick) return;
  const keys = options.keys ?? googleKeys;
  let owners: ReturnType<typeof runnerOwners> | undefined;
  app.post(SCHEDULED_TICK_PATH, async (c) => {
    if (!(await fromScheduler(c.req.header('authorization'), tick, keys)))
      throw new ApiError(403, 'Forbidden');
    owners ??= runnerOwners(db, config).catch((error: unknown) => {
      owners = undefined;
      throw error;
    });
    const { lanes, periodic } = await owners;
    const signal = c.req.raw.signal;
    const deadline = performance.now() + tick.budgetSeconds * 1000;
    const failures = await runPeriodic(periodic, { signal, deadline });
    const runnerStarted = await startSuccessor({
      lanes,
      budgetMs: config.execution.budgetSeconds * 1000,
      signal,
      start: options.startRunner,
    });
    getLogger('workers.runner').info('scheduled_tick_completed', {
      failed_phases: failures.length,
      runner_started: runnerStarted,
    });
    return failures.length
      ? c.json({ status: 'failed' }, 500)
      : c.json({ status: 'ok', runner_started: runnerStarted });
  });
}
