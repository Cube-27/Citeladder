import { proxyWorkerRequest, type WorkerOriginConfig } from '@/lib/server/worker-origin-proxy';

export interface ApexEnv {
  ORIGIN_UPSTREAM: string;
  ORIGIN_TOKEN: string;
  PUBLIC_WEBSITE_HOST: string;
  PUBLIC_APP_ORIGIN: string;
  LOCAL_WORKER_ORIGIN?: string;
}

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
  'ai-traffic',
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
  if (path === '/api/v1/billing/webhooks/razorpay' && request.method === 'POST') {
    return proxyWorkerRequest(request, config);
  }
  // Public contact intake is handled by Astro in this Worker, never the product API.
  if (path === '/api/v1/contact') return null;
  // Machine routes (`/v1/...`) and MCP are served on the API host only; MCP
  // paths fall through to the site's own 404 page.
  if (
    path === '/api' ||
    path.startsWith('/api/') ||
    path === '/v1' ||
    path.startsWith('/v1/') ||
    isProductPath(path)
  ) {
    return noStore(404);
  }
  return null;
}
