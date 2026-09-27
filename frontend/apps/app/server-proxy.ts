import { caddyPathSource } from '@citeladder/contracts/caddy-path';
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

// The paths every ingress sends to the Python backend, as Caddy path patterns.
const BACKEND_PATHS = [
  '/api',
  '/api/*',
  '/mcp',
  '/mcp/*',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
] as const;

function proxyRoutes(target: string, apiService: string): Record<string, ProxyOptions> {
  const options = (origin: string): ProxyOptions => ({ target: origin, changeOrigin: true });
  // Each key is Caddy's own matcher, folding case as Caddy does, so dev routes
  // a path as production does. Vite tries keys in insertion order, so the
  // narrower TypeScript paths lead.
  const routes = (paths: readonly string[], origin: string) =>
    paths.map((path) => [caddyPathSource(path, { caseless: true }), options(origin)] as const);
  return Object.fromEntries([
    ...routes(TYPESCRIPT_INGRESS_PATHS, apiService),
    ...routes(BACKEND_PATHS, target),
  ]);
}
