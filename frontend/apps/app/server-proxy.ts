import { TYPESCRIPT_INGRESS_PATHS } from '@citeladder/contracts/route-ownership';
import type { ProxyOptions } from 'vite';
import { resolveBackendOrigin } from '../../lib/config/backend-origin.ts';

const DEFAULT_API_SERVICE_ORIGIN = 'http://localhost:8100';

/**
 * Build Vite's development-only same-origin proxy table. BACKEND_ORIGIN and
 * API_SERVICE_ORIGIN stay in server configuration and are never exposed
 * through a VITE_* browser value. The route families the route-ownership
 * manifest gives TypeScript go to the API service, as every ingress does.
 */
export function createServerProxy(
  backendOrigin: string = process.env.BACKEND_ORIGIN ?? '',
  apiServiceOrigin: string = process.env.API_SERVICE_ORIGIN ?? '',
): Record<string, ProxyOptions> {
  return proxyRoutes(
    resolveBackendOrigin(backendOrigin),
    new URL(apiServiceOrigin.trim() || DEFAULT_API_SERVICE_ORIGIN).origin,
  );
}

/** A Caddy path pattern (`*` within one segment) as an anchored proxy key. */
function ingressPattern(path: string): string {
  const segments = path.split('*').map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return `^${segments.join('[^/]+')}(?:\\?|$)`;
}

function proxyRoutes(target: string, apiService: string): Record<string, ProxyOptions> {
  const options = (origin: string): ProxyOptions => ({ target: origin, changeOrigin: true });
  // Vite tries keys in insertion order, so the narrower TypeScript paths lead.
  const typescript = Object.fromEntries(
    TYPESCRIPT_INGRESS_PATHS.map((path) => [ingressPattern(path), options(apiService)]),
  );
  return {
    ...typescript,
    '^/api(?:/|\\?|$)': options(target),
    '^/mcp(?:/|\\?|$)': options(target),
    '^/(?:authorize|token|revoke)(?:\\?|$)': options(target),
    '^/\\.well-known/(?:oauth-authorization-server|oauth-protected-resource/mcp)(?:\\?|$)':
      options(target),
  };
}
