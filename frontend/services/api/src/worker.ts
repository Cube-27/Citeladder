/**
 * The TypeScript analytics worker process (TypeScript migration PR 4).
 *
 * Same image as the API service, another command. SIGTERM stops polling and
 * lets the task in hand finish before the pool closes; its lease otherwise
 * expires and the next analytics pass returns the row to the queue.
 */
import { loadConfig, loadWorkerSettings } from './config.ts';
import { createDatabase } from './db/database.ts';
import { getLogger } from './logging.ts';
import { AnalyticsWorker } from './workers/analytics-worker.ts';
import { parseArgs } from 'node:util';

const logger = getLogger('worker');
const db = createDatabase(loadConfig());
const worker = new AnalyticsWorker(db, loadWorkerSettings());
const stop = new AbortController();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info('analytics_worker_stopping', { signal });
    stop.abort();
  });
}

try {
  const { values } = parseArgs({ options: { drain: { type: 'boolean', default: false } } });
  if (values.drain) await worker.runUntilIdle(1000, stop.signal);
  else await worker.runForever(stop.signal);
} finally {
  await db.destroy();
}
