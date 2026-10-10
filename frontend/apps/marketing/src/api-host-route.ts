import { proxyWorkerRequest } from '@/lib/server/worker-origin-proxy';

/** Bindings the API host needs; the marketing host's bindings stay with apex-route. */
export interface ApiHostEnv {
  ORIGIN_UPSTREAM: string;
  ORIGIN_TOKEN: string;
  PUBLIC_API_HOST: string;
  LOCAL_WORKER_ORIGIN?: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/**
 * The API host's whole surface: machine routes forwarded unchanged to Cloud
 * Run. Later public API and MCP routes extend this list.
 */
const MACHINE_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/ingest/${UUID}$`, 'u') },
  { method: 'POST', path: new RegExp(`^/v1/crawl-logs/firehose/${UUID}$`, 'u') },
];

/** Whether this request is addressed to the API host; it never reaches Astro or the assets. */
export function isApiHostRequest(request: Request, env: ApiHostEnv): boolean {
  return env.PUBLIC_API_HOST !== '' && new URL(request.url).hostname === env.PUBLIC_API_HOST;
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
  const allowed = MACHINE_ROUTES.some(
    (route) => route.method === request.method && route.path.test(url.pathname),
  );
  if (!allowed) return notFound();
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  return proxyWorkerRequest(new Request(request, { headers }), {
    upstream: env.ORIGIN_UPSTREAM,
    publicHost: env.PUBLIC_API_HOST,
    originToken: env.ORIGIN_TOKEN,
    allowDevelopmentHttp: localHttp,
  });
}
