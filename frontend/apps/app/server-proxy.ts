import { TYPESCRIPT_INGRESS_PATHS } from '@citeladder/contracts/route-ownership';
import type { ProxyOptions } from 'vite';
import { resolveApiServiceOrigin } from '../../lib/config/api-service-origin.ts';

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);

/** A Vite proxy key: the path with or without its query string. */
function proxyKey(path: string): string {
  return path.endsWith('/*')
    ? `^${escaped(path.slice(0, -1))}`
    : String.raw`^${escaped(path)}(?:\?|$)`;
}

/** Development-only same-origin proxy; the upstream never enters browser bundles. */
export function createServerProxy(
  apiServiceOrigin: string = process.env.API_SERVICE_ORIGIN ?? '',
): Record<string, ProxyOptions> {
  const target = resolveApiServiceOrigin(apiServiceOrigin);
  return Object.fromEntries(
    TYPESCRIPT_INGRESS_PATHS.map((path) => [proxyKey(path), { target, changeOrigin: true }]),
  );
}
