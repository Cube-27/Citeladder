/**
 * The route-ownership gate: one writing stack per family, TypeScript parity
 * with the frozen Python fragment, and ingress that agrees with both.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openApiDocument, type OpenApiDocument } from '../src/openapi/document.ts';
import { ingressRouter } from '../src/openapi/ingress.ts';
import { routeOwnershipFailures, type OwnershipInputs } from '../src/openapi/ownership.ts';

const PREFIX = '/api/v1';
const UPSTREAMS = { python: ['BACKEND_ORIGIN'], typescript: ['API_SERVICE_ORIGIN'] };

/** FastAPI's spelling of one operation per family. */
function pythonDocument(families: string[]): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {
    '/health': { get: { tags: ['health'], responses: {} } },
  };
  for (const family of families) {
    paths[`${PREFIX}/${family}/{item_id}`] = {
      get: {
        tags: [family],
        parameters: [
          {
            name: 'item_id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', title: 'Name' } },
                  required: ['name'],
                },
              },
            },
          },
        },
      },
    };
  }
  return { openapi: '3.1.0', paths };
}

function executionsRoute(response: z.ZodType = z.object({ name: z.string() })) {
  return openApiDocument([
    {
      family: 'executions',
      method: 'get',
      path: `${PREFIX}/executions/{item_id}`,
      pathParams: z.object({ item_id: z.uuid() }),
      responses: { 200: response },
    },
  ]);
}

const SPLIT_INGRESS = `
@ts_api path /api/v1/executions/*
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
@backend path /api /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
`;
const PYTHON_INGRESS = `
@backend path /api /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
`;

/** `executions` moved to TypeScript; `projects` stays Python. */
function migrated(overrides: Partial<OwnershipInputs> = {}): OwnershipInputs {
  return {
    apiPrefix: PREFIX,
    manifest: { executions: 'typescript', projects: 'python' },
    python: pythonDocument(['projects']),
    typescript: executionsRoute(),
    frozen: { executions: pythonDocument(['executions']) },
    ingress: { Caddyfile: ingressRouter(SPLIT_INGRESS, UPSTREAMS) },
    ...overrides,
  };
}

describe('route-ownership gate', () => {
  it('accepts a migrated family with parity and matching ingress', () => {
    expect(routeOwnershipFailures(migrated())).toEqual([]);
  });

  it('refuses a Python family the manifest does not list', () => {
    const failures = routeOwnershipFailures(
      migrated({ python: pythonDocument(['projects', 'billing']) }),
    );
    expect(failures).toEqual([
      expect.stringContaining("'billing' is missing from the route-ownership manifest"),
    ]);
  });

  it('refuses a TypeScript family that Python still serves', () => {
    const failures = routeOwnershipFailures(
      migrated({ python: pythonDocument(['projects', 'executions']) }),
    );
    expect(failures).toContainEqual(
      expect.stringContaining('Python still serves GET /api/v1/executions'),
    );
  });

  it('refuses a TypeScript family without a frozen fragment', () => {
    const failures = routeOwnershipFailures(migrated({ frozen: {} }));
    expect(failures).toEqual([expect.stringContaining('--freeze-family executions')]);
  });

  it('refuses TypeScript contracts that drift from the frozen fragment', () => {
    const failures = routeOwnershipFailures(
      migrated({ typescript: executionsRoute(z.object({ name: z.string().nullable() })) }),
    );
    expect(failures).toEqual(["'executions' parity: GET /api/v1/executions/{item_id} differs"]);
  });

  it('refuses TypeScript routes for a family the manifest gives Python', () => {
    const failures = routeOwnershipFailures(
      migrated({ manifest: { executions: 'python', projects: 'python' }, frozen: {} }),
    );
    expect(failures).toContainEqual(
      "The TypeScript service serves 'executions', which the manifest assigns to python",
    );
  });

  it('refuses ingress that still sends a TypeScript family to Python', () => {
    const failures = routeOwnershipFailures(
      migrated({ ingress: { Caddyfile: ingressRouter(PYTHON_INGRESS, UPSTREAMS) } }),
    );
    expect(failures).toEqual([
      "Caddyfile: /api/v1/executions/{item_id} ('executions') must reach only typescript, but reaches [python]",
    ]);
  });
});
