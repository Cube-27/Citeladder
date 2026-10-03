import { z } from 'zod';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { DRAIN_LOCK } from '../config/execution.ts';
import type { ServiceConfig } from '../config.ts';
import { getLogger } from '../logging.ts';

const tokenSchema = z.object({ access_token: z.string().min(1) });

/** Start an execution, never wait for its work. A missed start is recovered by tick. */
export function runnerStarter(
  config: ServiceConfig,
  db: Database,
  send: typeof fetch = fetch,
  now: () => number = () => performance.now(),
): () => Promise<void> {
  let lastAttempt = Number.NEGATIVE_INFINITY;
  return async () => {
    if (!config.execution.runnerJob) return;
    const time = now();
    if (time - lastAttempt < config.execution.wakeMinIntervalMs) return;
    // Reserve before awaiting: concurrent requests share the same interval.
    lastAttempt = time;
    const signal = AbortSignal.timeout(config.execution.wakeTimeoutMs);
    try {
      if (await drainActive(db, signal)) {
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
      if (!tokenResponse.ok) throw new Error('metadata_token_unavailable');
      const { access_token } = tokenSchema.parse(await tokenResponse.json());
      const response = await send(
        `https://run.googleapis.com/v2/${config.execution.runnerJob}:run`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: '{}',
          redirect: 'error',
          signal,
        },
      );
      // Consume the small operation response before returning the API response.
      await response.body?.cancel();
      if (!response.ok) throw new Error('runner_start_rejected');
    } catch {
      // Never disclose Google response bodies/tokens, or turn a committed write into an error.
      getLogger('workers.runner').warning('runner_start_failed');
    }
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
