import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { getLogger } from './logging.ts';
import { IntegrationWorker } from './workers/integration-worker.ts';

const logger = getLogger('worker.integration');
const db = createDatabase(loadConfig());
const worker = new IntegrationWorker(db);
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info('integration_worker_stopping', { signal });
    stop.abort();
  });
}
try {
  await worker.runForever(stop.signal);
} finally {
  await db.destroy();
}
