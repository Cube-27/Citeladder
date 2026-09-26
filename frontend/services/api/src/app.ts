/**
 * The TypeScript API service application.
 *
 * Serves only liveness and readiness in this foundation: no product route
 * family is owned here yet, and nothing routes production traffic to it.
 */
import { Hono } from 'hono';
import { sql } from 'kysely';

import type { ServiceConfig } from './config.ts';
import type { AppEnv } from './context.ts';
import type { Database } from './db/database.ts';
import { onError, onNotFound } from './errors.ts';
import { getLogger } from './logging.ts';
import { requestId } from './request-id.ts';

const logger = getLogger('api');

async function databaseReachable(db: Database, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs);
  });
  try {
    await Promise.race([sql`SELECT 1`.execute(db), timeout]);
    return true;
  } catch (error) {
    logger.warning('readiness probe failed', { exception: String(error) });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(config: ServiceConfig, db: Database): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId(config.requestIdHeader));
  app.onError(onError);
  app.notFound(onNotFound);

  // Liveness: dependency-free and byte-stable, like the backend's /health.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Readiness: bounded database reachability; never calls a provider.
  app.get('/ready', async (c) =>
    (await databaseReachable(db, config.readinessTimeoutMs))
      ? c.json({ status: 'ready' })
      : c.json({ status: 'unavailable', database: 'down' }, 503),
  );

  return app;
}
