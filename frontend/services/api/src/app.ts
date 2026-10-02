/**
 * The TypeScript API service application.
 *
 * Serves liveness, readiness and the route families the route-ownership
 * manifest assigns to TypeScript (`routes/`); ingress sends only those paths
 * here.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { sql } from 'kysely';

import type { ServiceConfig } from './config.ts';
import { policy } from './config.ts';
import type { AppEnv } from './context.ts';
import type { Database } from './db/database.ts';
import { ApiError, onError, onNotFound } from './errors.ts';
import { apiNoStore } from './http/no-store.ts';
import { getLogger } from './logging.ts';
import { requestId } from './request-id.ts';
import { PRODUCT_ROUTES } from './routes/index.ts';
import { registerMethodGuards } from './routes/define.ts';
import { registerMcpRoutes } from './mcp/server.ts';
import { observeCommittedWork } from './db/committed-work.ts';
import { runnerStarter } from './workers/start-runner.ts';
import { originToken } from './http/origin-token.ts';

const logger = getLogger('api');

async function databaseReachable(db: Database, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs);
  });
  try {
    // The server-side statement timeout ends the probe's own query at the same
    // bound, so a timed-out probe never keeps its pooled connection busy.
    const probe = db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`.execute(trx);
      await sql`SELECT 1`.execute(trx);
    });
    // A probe that loses the race still settles later; observe it so a late
    // rejection is not an unhandled one.
    probe.catch(() => undefined);
    await Promise.race([probe, timeout]);
    return true;
  } catch (error) {
    logger.warning('readiness probe failed', { exception: String(error) });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(
  config: ServiceConfig,
  db: Database,
  options: { startRunner?: () => Promise<void> } = {},
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId(config.requestIdHeader));
  app.use(apiNoStore());
  app.use(originToken(config));
  const startRunner = options.startRunner ?? runnerStarter(config);
  app.use(async (_c, next) => observeCommittedWork(next, startRunner));
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: policy.api.request_body_max_bytes,
      onError: () => {
        throw new ApiError(413, 'Request body too large');
      },
    }),
  );
  app.onError(onError);
  app.notFound(onNotFound);
  registerMcpRoutes(app, config, db);

  // Liveness: dependency-free and byte-stable, like the backend's /health.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Readiness: bounded database reachability; never calls a provider.
  app.get('/ready', async (c) =>
    (await databaseReachable(db, config.readinessTimeoutMs))
      ? c.json({ status: 'ready' })
      : c.json({ status: 'unavailable', database: 'down' }, 503),
  );

  registerMethodGuards(app, PRODUCT_ROUTES);
  for (const route of PRODUCT_ROUTES) route.register(app, config, db);

  return app;
}
