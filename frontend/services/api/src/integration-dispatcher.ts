import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { IntegrationDispatcher } from './workers/integration-dispatcher.ts';
import { getLogger } from './logging.ts';

const logger = getLogger('worker.integration-dispatcher');
const db = createDatabase(loadConfig());
const dispatcher = new IntegrationDispatcher(db);
const stop = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info('integration_dispatcher_stopping', { signal });
    stop.abort();
  });
}
try {
  await dispatcher.runForever(stop.signal);
} finally {
  await db.destroy();
}
