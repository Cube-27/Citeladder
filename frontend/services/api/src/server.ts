import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { getLogger } from './logging.ts';

const logger = getLogger('api');
const config = loadConfig();
const db = createDatabase(config);
const server = serve({ fetch: createApp(config, db).fetch, port: config.port }, (info) =>
  logger.info('api_service_started', { port: info.port }),
);

function shutdown(signal: string): void {
  logger.info('api_service_stopping', { signal });
  server.close(() => {
    void db.destroy().then(() => process.exit(0));
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
