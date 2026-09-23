import { proxyWorkerRequest, type WorkerOriginConfig } from '@/lib/server/worker-origin-proxy';

export interface ApexEnv {
  ORIGIN_UPSTREAM: string;
  ORIGIN_TOKEN: string;
  PUBLIC_WEBSITE_HOST: string;
  PUBLIC_APP_ORIGIN: string;
  LOCAL_WORKER_ORIGIN?: string;
}

const PROTOCOL_PATHS = new Set([
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);
const FORMER_PRODUCT_PATHS = new Set([
  'login',
  'register',
  'projects',
  'onboarding',
  'site',
  'issues',
  'demand',
  'search-intelligence',
  'performance',
  'opportunities',
  'visibility',
  'runs',
  'prompts',
  'content',
  'products',
  'ai-referrals',
  'settings',
  'invitations',
]);

function noStore(status: number, body: string | null = null): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isProductPath(path: string): boolean {
  return FORMER_PRODUCT_PATHS.has(path.split('/')[1] ?? '') || path.startsWith('/app-assets/');
}

export async function routeApexRequest(request: Request, env: ApexEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const localHttp =
    env.LOCAL_WORKER_ORIGIN === 'true' &&
    url.protocol === 'http:' &&
    url.hostname === env.PUBLIC_WEBSITE_HOST;
  if ((!localHttp && url.protocol !== 'https:') || url.hostname !== env.PUBLIC_WEBSITE_HOST) {
    return noStore(404);
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return noStore(404);
  }
  const config: WorkerOriginConfig = {
    upstream: env.ORIGIN_UPSTREAM,
    publicHost: env.PUBLIC_WEBSITE_HOST,
    originToken: env.ORIGIN_TOKEN,
    allowDevelopmentHttp: localHttp,
  };
  if (path === '/mcp/oauth/consent') {
    if (request.method === 'GET') {
      const target = new URL('/mcp/oauth/consent', env.PUBLIC_APP_ORIGIN);
      target.search = url.search;
      return new Response(null, {
        status: 302,
        headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
      });
    }
    return noStore(409, 'Restart authorization on the app.');
  }
  if (path === '/api/v1/billing/webhooks/razorpay' && request.method === 'POST') {
    return proxyWorkerRequest(request, config);
  }
  if (path === '/mcp' || path.startsWith('/mcp/') || PROTOCOL_PATHS.has(path)) {
    return proxyWorkerRequest(request, config);
  }
  if (path === '/api' || path.startsWith('/api/') || isProductPath(path)) {
    return noStore(404);
  }
  return null;
}
