import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { sql } from 'kysely';

import type { ServiceConfig } from './config.ts';
import { policy } from './config.ts';
import type { AppEnv } from './context.ts';
import type { Database } from './db/database.ts';
import { ApiError, onError, onNotFound } from './errors.ts';
import { apiNoStore } from './http/no-store.ts';
import { conditionalReads } from './http/revalidate.ts';
import { getLogger } from './logging.ts';
import { requestId } from './request-id.ts';
import { PRODUCT_ROUTES } from './routes/index.ts';
import { registerMethodGuards, selfBoundedBodies } from './routes/define.ts';
import { registerMcpRoutes } from './mcp/server.ts';
import { observeCommittedWork } from './db/committed-work.ts';
import { runnerStarter } from './workers/start-runner.ts';
import { registerScheduledTick } from './workers/scheduled-tick.ts';
import type { JWTVerifyGetKey } from 'jose';
import { originToken } from './http/origin-token.ts';
import { ROUTE_CONTRACTS } from './openapi/routes.ts';
import { publicApiDocument } from './public-api/openapi.ts';

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
  options: { startRunner?: () => Promise<boolean>; schedulerKeys?: JWTVerifyGetKey } = {},
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId(config.requestIdHeader));
  // JSON only: an event stream or a streamed export must reach the client
  // chunk by chunk, which a compressor's buffering would hold back. The
  // Cloud Run to Worker hop is metered egress, so the origin compresses.
  app.use(
    compress({
      threshold: policy.api.response_compression_min_bytes,
      contentTypeFilter: /^application\/(?:[\w.+-]+\+)?json(?:[;\s]|$)/i,
    }),
  );
  app.use(apiNoStore());
  app.use(conditionalReads());
  const startRunner = options.startRunner ?? runnerStarter(config, db);
  // Before the origin token: its admission is Cloud Scheduler's Google ID token.
  registerScheduledTick(app, config, db, { startRunner, keys: options.schedulerKeys });
  // Liveness, before the origin token too: Cloud Run's probe and the uptime
  // check cannot sign. Dependency-free and byte-stable, so it reveals nothing.
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.use(originToken(config));
  app.use((_c, next) => observeCommittedWork(next, startRunner));
  const ordinaryBodyLimit = bodyLimit({
    maxSize: policy.api.request_body_max_bytes,
    onError: () => {
      throw new ApiError(413, 'Request body too large');
    },
  });
  const streamsOwnBody = selfBoundedBodies(PRODUCT_ROUTES);
  for (const prefix of ['/api/*', `${policy.api.machine_prefix}/*`])
    app.use(prefix, (c, next) =>
      streamsOwnBody(c.req.method, c.req.path) ? next() : ordinaryBodyLimit(c, next),
    );
  app.onError(onError);
  app.notFound(onNotFound);
  registerMcpRoutes(app, config, db);

  app.get('/ready', async (c) =>
    (await databaseReachable(db, config.readinessTimeoutMs))
      ? c.json({ status: 'ready' })
      : c.json({ status: 'unavailable', database: 'down' }, 503),
  );

  const publicDocument = publicApiDocument(ROUTE_CONTRACTS);
  app.get(`${policy.api.machine_prefix}/openapi.json`, (c) => c.json(publicDocument));

  registerMethodGuards(app, PRODUCT_ROUTES);
  for (const route of PRODUCT_ROUTES) route.register(app, config, db);

  return app;
}
