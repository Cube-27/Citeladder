import { MCP_API_HOST_PATHS } from '@citeladder/contracts/route-ownership';
import { proxyWorkerRequest } from '../../lib/server/worker-origin-proxy';
import { withRequestLog } from '../../lib/server/worker-request-log';

export interface ApiHostEnv {
  ORIGIN_UPSTREAM: string;
  ORIGIN_TOKEN: string;
  PUBLIC_API_HOST: string;
  LOCAL_WORKER_ORIGIN?: string;
  OPENAI_APPS_CHALLENGE?: string;
}

const OPENAI_APPS_CHALLENGE_PATH = '/.well-known/openai-apps-challenge';
const API_DOCS_URL = 'https://docs.citeladder.com/api/';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CRAWL_LOG_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/ingest/${UUID}$`, 'u') },
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/firehose/${UUID}$`, 'u') },
];
const PUBLIC_API_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

function allowed(method: string, path: string): boolean {
  if (MCP_API_HOST_PATHS.has(path)) return true;
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

export async function routeApiHostRequest(request: Request, env: ApiHostEnv): Promise<Response> {
  const url = new URL(request.url);
  const localHttp = env.LOCAL_WORKER_ORIGIN === 'true' && url.protocol === 'http:';
  if (!localHttp && url.protocol !== 'https:') return notFound();
  if (url.hostname !== env.PUBLIC_API_HOST) return notFound();
  if (url.pathname === OPENAI_APPS_CHALLENGE_PATH)
    return request.method === 'GET' && env.OPENAI_APPS_CHALLENGE
      ? new Response(env.OPENAI_APPS_CHALLENGE, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      : notFound();
  if (url.pathname === '/robots.txt' && (request.method === 'GET' || request.method === 'HEAD'))
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD'))
    return Response.redirect(API_DOCS_URL, 301);
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
  fetch: withRequestLog(routeApiHostRequest),
};

export default apiHostWorker;
