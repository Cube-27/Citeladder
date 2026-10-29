import { MCP_API_HOST_PATHS } from '@citeladder/contracts/route-ownership';
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
  /** OpenAI's plugin domain-verification token; the path 404s while unset. */
  OPENAI_APPS_CHALLENGE?: string;
}

const OPENAI_APPS_CHALLENGE_PATH = '/.well-known/openai-apps-challenge';
// A literal: this Worker has no build-time env, and the docs host is the same in every deploy.
const API_DOCS_URL = 'https://docs.citeladder.com/api/';

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

function allowed(method: string, path: string): boolean {
  // Every method on MCP paths: the API answers 405 or a CORS preflight itself.
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
  // Answered here, not at the origin: a static public token, so no Cloud Run call.
  if (url.pathname === OPENAI_APPS_CHALLENGE_PATH)
    return request.method === 'GET' && env.OPENAI_APPS_CHALLENGE
      ? new Response(env.OPENAI_APPS_CHALLENGE, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      : notFound();
  // Nothing on this host is a page; crawlers are told so instead of meeting a 404.
  if (url.pathname === '/robots.txt' && (request.method === 'GET' || request.method === 'HEAD'))
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  // The bare host has no API of its own; readers who land there want the docs.
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
  fetch: (request: Request, env: ApiHostEnv) => routeApiHostRequest(request, env),
};

export default apiHostWorker;
