import { caddyPathSource } from '@citeladder/contracts/caddy-path';
import { TYPESCRIPT_INGRESS_PATHS } from '@citeladder/contracts/route-ownership';
import type { ProxyOptions } from 'vite';
import { resolveApiServiceOrigin } from '../../lib/config/api-service-origin.ts';

/** Development-only same-origin proxy; the upstream never enters browser bundles. */
export function createServerProxy(
  apiServiceOrigin: string = process.env.API_SERVICE_ORIGIN ?? '',
): Record<string, ProxyOptions> {
  const target = resolveApiServiceOrigin(apiServiceOrigin);
  return Object.fromEntries(
    TYPESCRIPT_INGRESS_PATHS.map((path) => [
      caddyPathSource(path, { proxyKey: true }),
      { target, changeOrigin: true },
    ]),
  );
}
