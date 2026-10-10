import { proxyWorkerRequest } from '../../lib/server/worker-origin-proxy';

/**
 * The `api.citeladder.com` Worker (API-OWNED): machine senders only, no assets,
 * no cookies. It forwards an allowlist to Cloud Run with the origin token and
 * answers everything else with a JSON 404.
 */
export interface ApiHostEnv {
  ORIGIN_UPSTREAM: string;
  ORIGIN_TOKEN: string;
  PUBLIC_API_HOST: string;
  LOCAL_WORKER_ORIGIN?: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/**
 * The API host's whole surface, forwarded unchanged to Cloud Run: the
 * crawl-log senders' two exact routes, the public REST API (any other
 * `/v1/...` path, which the API authenticates by key), and MCP with its OAuth
 * endpoints. Browser consent stays on the app host.
 */
const CRAWL_LOG_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/ingest/${UUID}$`, 'u') },
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/firehose/${UUID}$`, 'u') },
];
const PUBLIC_API_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
// Every method: the API answers 405 or a CORS preflight itself.
const MCP_PATHS = new Set([
  '/mcp',
  '/mcp/',
  '/mcp/register',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);

function allowed(method: string, path: string): boolean {
  if (MCP_PATHS.has(path)) return true;
  if (path === '/v1/crawl-logs' || path.startsWith('/v1/crawl-logs/'))
    return CRAWL_LOG_ROUTES.some((route) => route.method === method && route.path.test(path));
  return path.startsWith('/v1/') && PUBLIC_API_METHODS.has(method);
}

function notFound(): Response {
  return Response.json(
    { error: { code: 'not_found' } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * API-OWNED host: forward an allowlisted machine route with the origin token,
 * refuse everything else with a JSON 404. Cookies are never read or forwarded.
 */
export async function routeApiHostRequest(request: Request, env: ApiHostEnv): Promise<Response> {
  const url = new URL(request.url);
  const localHttp = env.LOCAL_WORKER_ORIGIN === 'true' && url.protocol === 'http:';
  if (!localHttp && url.protocol !== 'https:') return notFound();
  // Only the configured host; a workers.dev or preview URL is never served.
  if (url.hostname !== env.PUBLIC_API_HOST) return notFound();
  if (!allowed(request.method, url.pathname)) return notFound();
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  return proxyWorkerRequest(new Request(request, { headers }), {
    upstream: env.ORIGIN_UPSTREAM,
    publicHost: env.PUBLIC_API_HOST,
    originToken: env.ORIGIN_TOKEN,
    allowDevelopmentHttp: localHttp,
  });
}

const apiHostWorker = {
  fetch: (request: Request, env: ApiHostEnv) => routeApiHostRequest(request, env),
};

export default apiHostWorker;
