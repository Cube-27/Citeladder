/**
 * OpenAPI parity: a zod route contract must publish the same fragment as the
 * Pydantic routes it replaces. The Python side is FastAPI's own output for a
 * fixture family (`backend/scripts/openapi_fragments.py`) whose models cover
 * the known drift traps.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openApiDocument, type JsonSchema, type OpenApiDocument } from '../src/openapi/document.ts';
import { familyFragment } from '../src/openapi/fragment.ts';
import type { RouteContract } from '../src/openapi/routes.ts';

const python = JSON.parse(
  readFileSync(new URL('../golden/openapi/parity.json', import.meta.url), 'utf8'),
) as OpenApiDocument & { family: string };

const child = z.object({ label: z.string(), weight: z.number() });

function parityResponse(overrides: z.ZodRawShape = {}) {
  return z.object({
    id: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    name: z.string().max(80),
    note: z.string().nullable(),
    nickname: z.string().nullable().default(null),
    count: z.int().default(0),
    kind: z.enum(['alpha', 'beta']),
    fixed: z.literal('only').default('only'),
    tone: z.enum(['calm', 'loud']),
    tags: z.array(z.string()),
    children: z.array(child),
    best_child: child.nullable(),
    totals: z.record(z.string(), z.int()),
    ...overrides,
  });
}

function parityRoutes(response = parityResponse()): RouteContract<'parity'>[] {
  const itemPath = z.object({ item_id: z.uuid() });
  return [
    {
      family: 'parity',
      method: 'get',
      path: '/api/v1/parity/{item_id}',
      pathParams: itemPath,
      query: z.object({
        limit: z.int().min(1).max(100).default(20),
        cursor: z.string().nullable().optional(),
      }),
      responses: { 200: response },
    },
    {
      family: 'parity',
      method: 'post',
      path: '/api/v1/parity',
      body: z.object({
        name: z.string().min(1).max(80),
        note: z.string().nullable().default(null),
        kind: z.enum(['alpha', 'beta']).default('alpha'),
      }),
      responses: { 201: response },
    },
    {
      family: 'parity',
      method: 'delete',
      path: '/api/v1/parity/{item_id}',
      pathParams: itemPath,
      responses: { 204: null },
    },
  ];
}

function tsFragment(routes: RouteContract<'parity'>[]) {
  return familyFragment(openApiDocument(routes), python.family);
}

describe('OpenAPI fragment parity', () => {
  it('publishes the Pydantic fragment for equivalent zod contracts', () => {
    expect(tsFragment(parityRoutes())).toEqual(familyFragment(python, python.family));
  });

  it.each([
    ['an optional field where Python declares a nullable one', { note: z.string().optional() }],
    ['a required field where Python declares a default', { count: z.int() }],
    ['a different enum', { kind: z.enum(['alpha', 'gamma']) }],
    ['a missing format', { id: z.string() }],
  ])('detects %s', (_label, overrides) => {
    expect(tsFragment(parityRoutes(parityResponse(overrides)))).not.toEqual(
      familyFragment(python, python.family),
    );
  });

  it('compares a property named like an annotation', () => {
    const routes = (title: z.ZodType) => parityRoutes(parityResponse({ title })).slice(0, 1);
    expect(tsFragment(routes(z.string()))).not.toEqual(tsFragment(routes(z.int())));
  });

  it('refuses two contracts for one operation', () => {
    const [read] = parityRoutes();
    expect(() => openApiDocument([read!, read!])).toThrow(/Duplicate route contract/u);
  });

  it('compares a recursive schema by shape, not by the name each stack gives it', () => {
    const tree = (name: string, ref: string, children: object): OpenApiDocument => ({
      openapi: '3.1.0',
      paths: {
        '/api/v1/tree': {
          get: {
            tags: ['tree'],
            responses: { '200': { content: { 'application/json': { schema: { $ref: ref } } } } },
          },
        },
      },
      components: {
        schemas: {
          [name]: { type: 'object', properties: { label: { type: 'string' }, children } },
        },
      },
    });
    const node = (ref: string) => ({ type: 'array', items: { $ref: ref } });
    const pydantic = tree('Node', '#/components/schemas/Node', node('#/components/schemas/Node'));
    const zod = tree(
      'TreeNode',
      '#/components/schemas/TreeNode',
      node('#/components/schemas/TreeNode'),
    );
    const flat = tree('Node', '#/components/schemas/Node', {
      type: 'array',
      items: { type: 'string' },
    });
    expect(familyFragment(zod, 'tree')).toEqual(familyFragment(pydantic, 'tree'));
    expect(familyFragment(flat, 'tree')).not.toEqual(familyFragment(pydantic, 'tree'));
  });

  it('ignores alias hops and keeps constraints beside a recursive reference', () => {
    const document = (schemas: Record<string, object>): OpenApiDocument => ({
      openapi: '3.1.0',
      paths: {
        '/api/v1/tree': {
          get: {
            tags: ['tree'],
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Root' } },
                },
              },
            },
          },
        },
      },
      components: { schemas: schemas as Record<string, JsonSchema> },
    });
    const node = (children: object) => ({
      type: 'object',
      properties: { children: { type: 'array', items: children } },
    });
    const direct = document({ Root: node({ $ref: '#/components/schemas/Root' }) });
    const aliased = document({
      Root: { $ref: '#/components/schemas/Node' },
      Node: node({ $ref: '#/components/schemas/Root' }),
    });
    const capped = document({
      Root: node({ $ref: '#/components/schemas/Root', maxProperties: 3 }),
    });
    expect(familyFragment(aliased, 'tree')).toEqual(familyFragment(direct, 'tree'));
    expect(familyFragment(capped, 'tree')).not.toEqual(familyFragment(direct, 'tree'));
  });

  it('applies path-level parameters to every operation under the path', () => {
    const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } } as const;
    const operation = { tags: ['items'], responses: { '200': {} } };
    const shared = {
      openapi: '3.1.0',
      paths: { '/api/v1/items/{id}': { parameters: [id], get: operation } },
    } as unknown as OpenApiDocument;
    const inline: OpenApiDocument = {
      openapi: '3.1.0',
      paths: { '/api/v1/items/{id}': { get: { ...operation, parameters: [id] } } },
    };
    expect(familyFragment(shared, 'items')).toEqual(familyFragment(inline, 'items'));
  });

  it('resolves a chained path-level parameter reference before operation overrides', () => {
    const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } } as const;
    const operation = { tags: ['items'], responses: { '200': {} } };
    const referenced = {
      openapi: '3.1.0',
      paths: {
        '/api/v1/items/{id}': {
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          get: operation,
          put: { ...operation, parameters: [{ ...id, schema: { type: 'integer' } }] },
        },
      },
      components: {
        parameters: { ItemId: { $ref: '#/components/parameters/Id' }, Id: id },
      },
    } as unknown as OpenApiDocument;
    const fragment = familyFragment(referenced, 'items');
    expect(fragment['GET /api/v1/items/{id}']?.parameters).toEqual([id]);
    expect(fragment['PUT /api/v1/items/{id}']?.parameters).toEqual([
      { ...id, schema: { type: 'integer' } },
    ]);
  });
});
