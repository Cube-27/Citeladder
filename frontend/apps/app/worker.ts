import { proxyWorkerRequest } from '../../lib/server/worker-origin-proxy';
import { APP_CONTENT_SECURITY_POLICY } from '../../lib/config/content-security-policy';
import { SECURITY_HEADERS as SHARED_SECURITY_HEADERS } from '../../lib/config/security-headers';
import type { WorkerEnv as GeneratedEnv } from './worker-configuration';

// Local Compose runs this Worker under `wrangler dev` over HTTP against the
// API container; production never sets the binding.
type WorkerEnv = GeneratedEnv & { LOCAL_WORKER_ORIGIN?: string };

// The product is never indexed.
const SECURITY_HEADERS = { ...SHARED_SECURITY_HEADERS, 'X-Robots-Tag': 'noindex, nofollow' };
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
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', APP_CONTENT_SECURITY_POLICY);
  }
  if (html) headers.set('Cache-Control', 'no-store');
  if (immutable) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(result.body, { status: result.status, headers });
}

function isReserved(path: string): boolean {
  return (
    path === '/mcp' ||
    path.startsWith('/mcp/') ||
    ['/authorize', '/token', '/revoke'].includes(path) ||
    path === '/.well-known' ||
    path.startsWith('/.well-known/')
  );
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
      ? response(
          '{"name":"CiteLadder","start_url":"/","display":"standalone"}',
          200,
          'application/manifest+json',
        )
      : response(null, 405);
  }
  return null;
}

async function dynamicRoute(
  request: Request,
  env: WorkerEnv,
  path: string,
): Promise<Response | null> {
  // Signed payment delivery, machine routes (API host) and operational
  // endpoints have another owner. Reject them before a proxy can create a second host.
  if (
    /^\/api\/v1\/billing\/webhooks(?:\/|$)/.test(path) ||
    /^\/v1(?:\/|$)/.test(path) ||
    /^\/api\/v1\/(?:internal|health|ready)(?:\/|$)/.test(path)
  ) {
    return response('Not found.', 404);
  }
  if (path === '/api' || path.startsWith('/api/')) {
    return proxied(request, env);
  }
  if (path === '/mcp/oauth/consent' && ['GET', 'POST'].includes(request.method)) {
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
  // HEAD probes (uptime checks, `curl -I`) rarely send an HTML Accept header.
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
  if (
    ['/verify-email', '/reset-password', '/invitations/accept'].includes(
      path.replace(/\/+$/u, '').toLowerCase(),
    )
  ) {
    const headers = new Headers(result.headers);
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', 'no-store');
    return new Response(result.body, { status: result.status, headers });
  }
  return result;
}

const appWorker = { fetch: handleAppRequest };
export default appWorker;
