import {
  CREDENTIAL_LINK_PATHS,
  isIngressPath,
  MCP_API_HOST_PATHS,
  MCP_CONSENT_PATH,
} from '@citeladder/contracts/route-ownership';
import { proxyWorkerRequest } from '../../lib/server/worker-origin-proxy';
import { withRequestLog } from '../../lib/server/worker-request-log';
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_CONTENT_SECURITY_POLICY_REPORT_ONLY,
  APP_REPORTING_ENDPOINTS,
} from '../../lib/config/content-security-policy';
import {
  APP_SECURITY_HEADERS,
  APP_SHELL_CACHE_CONTROL,
  OPENER_KEPT_AUTH_PATHS,
} from '../../lib/config/security-headers';
import { routePath } from '../../lib/navigation/route-path';
import type { WorkerEnv as GeneratedEnv } from './worker-configuration';

type WorkerEnv = GeneratedEnv & { LOCAL_WORKER_ORIGIN?: string };

// Vite's build.assetsDir; unhashed public/ files (for example the theme
// bootstrap) share the naming shape and must stay revalidated.
const FINGERPRINTED_DIRECTORY = '/app-assets/';
const FINGERPRINTED_EXTENSIONS = new Set(['js', 'css', 'woff', 'woff2', 'png', 'webp', 'svg']);

function response(body: string | null, status: number, contentType = 'text/plain'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

function decorate(result: Response, html = false, immutable = false): Response {
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(APP_SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', APP_CONTENT_SECURITY_POLICY);
    headers.set('Content-Security-Policy-Report-Only', APP_CONTENT_SECURITY_POLICY_REPORT_ONLY);
    headers.set('Reporting-Endpoints', APP_REPORTING_ENDPOINTS);
  }
  if (html) headers.set('Cache-Control', APP_SHELL_CACHE_CONTROL);
  if (immutable) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(result.body, { status: result.status, headers });
}

const API_HOST_ROOTS = [...new Set([...MCP_API_HOST_PATHS].map((path) => path.split('/')[1]))].map(
  (segment) => `/${segment}`,
);

function isReserved(path: string): boolean {
  return API_HOST_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

function isResource(path: string): boolean {
  return (
    path.split('/').some((segment) => segment.startsWith('.')) ||
    path.startsWith('/app-assets/') ||
    path.startsWith('/fonts/') ||
    path.startsWith('/brand/') ||
    path.startsWith('/blog/') ||
    /\.[a-z0-9]{1,8}$/i.test(path)
  );
}

function localWorker(env: WorkerEnv): boolean {
  return env.LOCAL_WORKER_ORIGIN === 'true';
}

function proxied(request: Request, env: WorkerEnv): Promise<Response> {
  return proxyWorkerRequest(request, {
    upstream: env.ORIGIN_UPSTREAM,
    publicHost: env.PUBLIC_APP_HOST,
    originToken: env.ORIGIN_TOKEN,
    allowDevelopmentHttp: localWorker(env),
  });
}

function metadataRoute(path: string, method: string): Response | null {
  const documentMethod = method === 'GET' || method === 'HEAD';
  if (path === '/health') return documentMethod ? response('ok', 200) : response(null, 405);
  if (path === '/robots.txt') {
    return documentMethod ? response('User-agent: *\nDisallow: /\n', 200) : response(null, 405);
  }
  if (path === '/site.webmanifest') {
    return documentMethod
      ? response('{"name":"CiteLadder","start_url":"/"}', 200, 'application/manifest+json')
      : response(null, 405);
  }
  return null;
}

async function dynamicRoute(
  request: Request,
  env: WorkerEnv,
  path: string,
): Promise<Response | null> {
  if (
    /^\/api\/v1\/billing\/webhooks(?:\/|$)/.test(path) ||
    /^\/v1(?:\/|$)/.test(path) ||
    /^\/api\/v1\/(?:internal|health|ready)(?:\/|$)/.test(path)
  ) {
    return response('Not found.', 404);
  }
  if (
    isIngressPath(path) &&
    (path !== MCP_CONSENT_PATH || ['GET', 'POST'].includes(request.method))
  ) {
    return proxied(request, env);
  }
  if (isReserved(path) || path === '/ready') return response('Not found.', 404);
  return metadataRoute(path, request.method);
}

function isFingerprinted(path: string): boolean {
  if (!path.startsWith(FINGERPRINTED_DIRECTORY)) return false;
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  const hyphen = filename.indexOf('-');
  const fingerprint = filename.slice(hyphen + 1, dot);
  return (
    dot > hyphen &&
    hyphen >= 0 &&
    FINGERPRINTED_EXTENSIONS.has(filename.slice(dot + 1)) &&
    fingerprint.length >= 8 &&
    /^[A-Za-z0-9_-]+$/.test(fingerprint)
  );
}

async function staticOrNavigation(
  request: Request,
  env: WorkerEnv,
  url: URL,
  path: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return decorate(response(null, 405));
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) {
    const html = asset.headers.get('content-type')?.includes('text/html') ?? false;
    return decorate(asset, html, !html && isFingerprinted(path));
  }
  const document =
    request.method === 'HEAD' || request.headers.get('accept')?.includes('text/html');
  if (isResource(path) || !document) {
    return decorate(response('Not found.', 404));
  }
  const entry = new Request(new URL('/index.html', url), { method: request.method });
  return decorate(await env.ASSETS.fetch(entry), true);
}

export async function handleAppRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const allowedScheme = url.protocol === 'https:' || (localWorker(env) && url.protocol === 'http:');
  if (!allowedScheme || url.hostname !== env.PUBLIC_APP_HOST) {
    return decorate(response('Not found.', 404));
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return decorate(response('Not found.', 404));
  }
  const routed = await dynamicRoute(request, env, path);
  const result = routed ? decorate(routed) : await staticOrNavigation(request, env, url, path);
  return withPathPolicy(result, routePath(path));
}

function withPathPolicy(result: Response, route: string): Response {
  const credentialLink = CREDENTIAL_LINK_PATHS.has(route);
  const keepsOpener = route === MCP_CONSENT_PATH || OPENER_KEPT_AUTH_PATHS.has(route);
  if (!credentialLink && !keepsOpener) return result;
  const headers = new Headers(result.headers);
  if (credentialLink) {
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', 'no-store');
  }
  if (keepsOpener) headers.delete('Cross-Origin-Opener-Policy');
  return new Response(result.body, { status: result.status, headers });
}

const appWorker = { fetch: withRequestLog(handleAppRequest) };
export default appWorker;
