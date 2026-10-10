/**
 * The public API's OpenAPI document, generated from the `public` route
 * contracts. `GET /v1/openapi.json` serves it, and the docs site's reference
 * (`apps/docs/src/data/public-api.json`) is checked against it.
 */
import { policy } from '../config.ts';
import { openApiDocument, type OpenApiDocument } from '../openapi/document.ts';
import type { RouteContract } from '../openapi/routes.ts';

const P = policy.public_api;
const PROJECT_PREFIX = `${policy.api.machine_prefix}/projects/{project_id}/`;

/** The docs group of a public path: the resource below the project, else `projects`. */
function groupOf(path: string): string {
  if (!path.startsWith(PROJECT_PREFIX)) return 'projects';
  return path.slice(PROJECT_PREFIX.length).split('/')[0] ?? 'projects';
}

export function publicApiDocument(contracts: readonly RouteContract[]) {
  const document: OpenApiDocument = openApiDocument(
    contracts.filter((contract) => contract.exposure === 'public'),
  );
  for (const [path, item] of Object.entries(document.paths))
    for (const operation of Object.values(item)) operation.tags = [groupOf(path)];
  return {
    openapi: document.openapi,
    info: { title: P.document.title, version: P.document.version },
    servers: [{ url: P.document.server_url }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: P.document.auth_description },
      },
    },
    paths: document.paths,
  };
}
