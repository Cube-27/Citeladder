import { z } from 'zod';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { DRAIN_LOCK } from '../config/execution.ts';
import type { ServiceConfig } from '../config.ts';
import { failureFacts, getLogger } from '../logging.ts';

const tokenSchema = z.object({ access_token: z.string().min(1) });

type StartMode = 'wake' | 'handover';
// Needs run.jobs.runWithOverrides, which only the runner's own identity holds.
const handoverBody = JSON.stringify({
  overrides: { containerOverrides: [{ env: [{ name: 'RUNNER_HANDOVER', value: 'true' }] }] },
});

/** A refused Google call: its own code and the HTTP status, never the body. */
class RunnerStartError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * Start an execution, never wait for its work. A missed start is recovered by tick.
 * Single-flight: while one attempt is in flight (its timeout may outlast the
 * interval), every caller shares it instead of starting a duplicate execution.
 * The returned promise never rejects. A `handover` start comes from the
 * draining runner itself, so it skips the drain probe (which would find that
 * runner's lock) and flags the successor to wait out the in-flight tail.
 */
export function runnerStarter(
  config: ServiceConfig,
  db: Database,
  send: typeof fetch = fetch,
  now: () => number = () => performance.now(),
): (mode?: StartMode) => Promise<void> {
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<void> | null = null;
  const attempt = async (time: number, mode: StartMode) => {
    const signal = AbortSignal.timeout(config.execution.wakeTimeoutMs);
    try {
      if (mode === 'wake' && (await drainActive(db, signal))) {
        // Only undo this probe's reservation; a newer probe may already own it.
        if (lastAttempt === time) lastAttempt = Number.NEGATIVE_INFINITY;
        return;
      }
      const tokenResponse = await send(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
          redirect: 'error',
          signal,
        },
      );
      if (!tokenResponse.ok)
        throw new RunnerStartError('metadata_token_unavailable', tokenResponse.status);
      const { access_token } = tokenSchema.parse(await tokenResponse.json());
      const response = await send(
        `https://run.googleapis.com/v2/${config.execution.runnerJob}:run`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: mode === 'handover' ? handoverBody : '{}',
          redirect: 'error',
          signal,
        },
      );
      // Consume the small operation response before returning the API response.
      await response.body?.cancel();
      if (!response.ok) throw new RunnerStartError('runner_start_rejected', response.status);
    } catch (error) {
      // Never disclose Google response bodies/tokens, or turn a committed write into an error.
      getLogger('workers.runner').warning('runner_start_failed', {
        ...failureFacts(error),
        status: error instanceof RunnerStartError ? error.status : null,
        timed_out: signal.aborted,
        elapsed_ms: Math.round(now() - time),
      });
    }
  };
  return (mode = 'wake') => {
    if (!config.execution.runnerJob) return Promise.resolve();
    if (inFlight) return inFlight;
    const time = now();
    if (time - lastAttempt < config.execution.wakeMinIntervalMs) return Promise.resolve();
    // Reserve before awaiting: concurrent requests share the same interval.
    lastAttempt = time;
    const current = attempt(time, mode).finally(() => {
      inFlight = null;
    });
    inFlight = current;
    return current;
  };
}

async function drainActive(db: Database, signal: AbortSignal): Promise<boolean> {
  try {
    const active = await sql<{ held: boolean }>`select exists (
      select 1 from pg_locks where locktype = 'advisory' and granted
      and database = (select oid from pg_database where datname = current_database())
      and classid = ((hashtextextended(${DRAIN_LOCK}, 0) >> 32) & 4294967295)::oid
      and objid = (hashtextextended(${DRAIN_LOCK}, 0) & 4294967295)::oid
      and objsubid = 1
    ) as held`.execute(db, { signal, inflightQueryAbortStrategy: 'cancel query' });
    return active.rows[0]?.held ?? false;
  } catch (error) {
    if (signal.aborted) throw error;
    // The probe is an optimization. The runner itself enforces drain exclusivity.
    getLogger('workers.runner').warning('runner_lock_check_failed');
    return false;
  }
}
