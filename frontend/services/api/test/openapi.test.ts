/**
 * OpenAPI parity: a zod route contract must publish the same fragment as the
 * Pydantic routes it replaces. The Python side is FastAPI's own output for a
 * fixture family (`backend/scripts/openapi_fragments.py`) whose models cover
 * the known drift traps.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openApiDocument, type OpenApiDocument } from '../src/openapi/document.ts';
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

  it('refuses two contracts for one operation', () => {
    const [read] = parityRoutes();
    expect(() => openApiDocument([read!, read!])).toThrow(/Duplicate route contract/u);
  });
});
