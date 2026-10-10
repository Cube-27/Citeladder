import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openApiDocument } from '../src/openapi/document.ts';
import { routeOwnershipFailures, type OwnershipInputs } from '../src/openapi/ownership.ts';

function ownershipInputs(overrides: Partial<OwnershipInputs> = {}): OwnershipInputs {
  return {
    apiPrefix: '/api/v1',
    manifest: { executions: 'typescript' },
    typescript: openApiDocument([
      {
        family: 'executions',
        method: 'get',
        path: '/api/v1/executions/{item_id}',
        pathParams: z.object({ item_id: z.uuid() }),
        responses: { 200: z.object({ name: z.string() }) },
      },
    ]),
    ...overrides,
  };
}
describe('route-ownership gate', () => {
  it('accepts declared families', () => {
    expect(routeOwnershipFailures(ownershipInputs())).toEqual([]);
  });
  it('rejects a served family missing from the manifest', () => {
    expect(routeOwnershipFailures(ownershipInputs({ manifest: {} }))).toContainEqual(
      expect.stringContaining('assigns to no stack'),
    );
  });
  it('rejects a manifest family without a route', () => {
    expect(
      routeOwnershipFailures(
        ownershipInputs({ manifest: { executions: 'typescript', billing: 'typescript' } }),
      ),
    ).toContainEqual(expect.stringContaining('has no declared route'));
  });
  it('refuses an unknown route owner', () => {
    expect(
      routeOwnershipFailures(ownershipInputs({ manifest: { executions: 'other' } })),
    ).toContainEqual(expect.stringContaining('must be TypeScript-owned'));
  });
  it('refuses ambiguous family tags', () => {
    const input = ownershipInputs();
    input.typescript.paths['/api/v1/executions/{item_id}']!.get!.tags = ['executions', 'billing'];
    expect(routeOwnershipFailures(input)).toContainEqual(
      expect.stringContaining('exactly one family tag'),
    );
  });
});
