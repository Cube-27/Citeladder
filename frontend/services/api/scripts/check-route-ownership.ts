/**
 * `pnpm check:routes -- --python-openapi <file>`: the route-ownership gate.
 *
 * Reads FastAPI's published document (`backend/scripts/export_openapi.py`),
 * generates the TypeScript service's, and checks both, the frozen Python
 * fragments and the two ingress Caddyfiles against the manifest. Run by
 * `scripts/quality.mjs --scope api`, locally and in CI.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ROUTE_OWNERSHIP, type RouteStack } from '@citeladder/contracts/route-ownership';

import { policy } from '../src/config.ts';
import { openApiDocument, type OpenApiDocument } from '../src/openapi/document.ts';
import { ingressRouter } from '../src/openapi/ingress.ts';
import { routeOwnershipFailures } from '../src/openapi/ownership.ts';
import { ROUTE_CONTRACTS } from '../src/openapi/routes.ts';

const repository = new URL('../../../../', import.meta.url);
const frozenRoot = new URL('../golden/families/', import.meta.url);

// The two ingress files: production's origin Caddy and local Compose.
const INGRESS_FILES = ['infra/gcp/runtime/Caddyfile', 'frontend/local-compose-routes.caddy'];

// How each ingress file names the two API upstreams: the Python web process
// on :8000 and the TypeScript service on its exported port.
const UPSTREAMS = {
  python: ['BACKEND_ORIGIN', ':8000'],
  typescript: ['API_SERVICE_ORIGIN', `:${policy.api.service_port}`],
};

function readJson(url: URL): OpenApiDocument {
  return JSON.parse(readFileSync(url, 'utf8')) as OpenApiDocument;
}

function frozenFragments(): Record<string, OpenApiDocument> {
  if (!existsSync(frozenRoot)) return {};
  return Object.fromEntries(
    readdirSync(frozenRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name.replace(/\.json$/u, ''), readJson(new URL(name, frozenRoot))]),
  );
}

const { values } = parseArgs({ options: { 'python-openapi': { type: 'string' } } });
const pythonOpenApi = values['python-openapi'];
if (!pythonOpenApi) {
  process.stderr.write('Usage: check-route-ownership.ts --python-openapi <file>\n');
  process.exit(2);
}

const failures = routeOwnershipFailures({
  apiPrefix: policy.api.prefix,
  manifest: ROUTE_OWNERSHIP,
  python: readJson(pathToFileURL(resolve(pythonOpenApi))),
  typescript: openApiDocument(ROUTE_CONTRACTS),
  frozen: frozenFragments(),
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
const stacks: RouteStack[] = Object.values(ROUTE_OWNERSHIP);
const owned = stacks.filter((stack) => stack === 'typescript').length;
process.stdout.write(
  `Route ownership passed: ${Object.keys(ROUTE_OWNERSHIP).length} families, ${owned} TypeScript-owned.\n`,
);
