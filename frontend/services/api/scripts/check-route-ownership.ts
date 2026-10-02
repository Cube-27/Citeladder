/** Check native route declarations and all API/protocol ingress paths. */
import { readFileSync } from 'node:fs';

import { ROUTE_OWNERSHIP } from '@citeladder/contracts/route-ownership';

import { policy } from '../src/config.ts';
import { openApiDocument } from '../src/openapi/document.ts';
import { ingressRouter } from '../src/openapi/ingress.ts';
import { routeOwnershipFailures } from '../src/openapi/ownership.ts';
import { ROUTE_CONTRACTS } from '../src/openapi/routes.ts';
import { MCP_PROTOCOL_PATHS } from '../src/mcp/server.ts';

const repository = new URL('../../../../', import.meta.url);

// Every ingress that proxies /api: production's origin Caddy, and locally the
// combined-origin Compose ingress and the Vite app container.
const INGRESS_FILES = [
  'infra/gcp/runtime/Caddyfile',
  'frontend/local-compose-routes.caddy',
  'frontend/apps/app/Caddyfile',
];

// Recognize retired upstream names too, so stale ingress fails explicitly.
const UPSTREAMS = {
  python: ['BACKEND_ORIGIN', '127.0.0.1:8000'],
  typescript: ['API_SERVICE_ORIGIN', `127.0.0.1:${policy.api.service_port}`],
};

const failures = routeOwnershipFailures({
  apiPrefix: policy.api.prefix,
  manifest: ROUTE_OWNERSHIP,
  protocolPaths: MCP_PROTOCOL_PATHS,
  typescript: openApiDocument(ROUTE_CONTRACTS),
  ingress: Object.fromEntries(
    INGRESS_FILES.map((file) => [
      file,
      ingressRouter(readFileSync(new URL(file, repository), 'utf8'), UPSTREAMS),
    ]),
  ),
});

if (failures.length > 0) {
  process.stderr.write(
    `Route ownership failed:\n${failures.map((line) => `- ${line}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Route ownership passed: ${Object.keys(ROUTE_OWNERSHIP).length} native families.\n`,
);
