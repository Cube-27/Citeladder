import { MCP_CONSENT_PATH, TYPESCRIPT_INGRESS_PATHS } from '@citeladder/contracts/route-ownership';
import type { ProxyOptions } from 'vite';
import { resolveApiServiceOrigin } from '../../lib/config/api-service-origin.ts';

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);

function proxyKey(path: string): string {
  return path.endsWith('/*')
    ? `^${escaped(path.slice(0, -1))}`
    : String.raw`^${escaped(path)}(?:\?|$)`;
}

export function createServerProxy(
  apiServiceOrigin: string = process.env.API_SERVICE_ORIGIN ?? '',
): Record<string, ProxyOptions> {
  const target = resolveApiServiceOrigin(apiServiceOrigin);
  return Object.fromEntries(
    TYPESCRIPT_INGRESS_PATHS.map((path) => [
      proxyKey(path),
      // Consent checks it is served on the app origin, so it keeps the browser's Host.
      { target, changeOrigin: path !== MCP_CONSENT_PATH },
    ]),
  );
}
