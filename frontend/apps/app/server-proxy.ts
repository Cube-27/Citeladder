import type { ProxyOptions } from 'vite';
import { resolveBackendOrigin } from '../../lib/config/backend-origin';

/**
 * Build Vite's development-only same-origin proxy table. BACKEND_ORIGIN stays
 * in server configuration and is never exposed through a VITE_* browser value.
 */
export function createServerProxy(
  backendOrigin: string = process.env.BACKEND_ORIGIN ?? '',
): Record<string, ProxyOptions> {
  return proxyRoutes(resolveBackendOrigin(backendOrigin));
}

function proxyRoutes(target: string): Record<string, ProxyOptions> {
  const options = (): ProxyOptions => ({ target, changeOrigin: true });
  return {
    '^/api(?:/|\\?|$)': options(),
    '^/mcp(?:/|\\?|$)': options(),
    '^/(?:authorize|token|revoke)(?:\\?|$)': options(),
    '^/\\.well-known/(?:oauth-authorization-server|oauth-protected-resource/mcp)(?:\\?|$)':
      options(),
  };
}
