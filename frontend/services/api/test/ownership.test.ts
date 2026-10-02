import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openApiDocument } from '../src/openapi/document.ts';
import { ingressRouter } from '../src/openapi/ingress.ts';
import { routeOwnershipFailures, type OwnershipInputs } from '../src/openapi/ownership.ts';

const UPSTREAMS = { python: ['RETIRED_ORIGIN'], typescript: ['API_SERVICE_ORIGIN'] };
function native(overrides: Partial<OwnershipInputs> = {}): OwnershipInputs {
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
    ingress: { Caddyfile: ingressRouter('reverse_proxy {$API_SERVICE_ORIGIN}', UPSTREAMS) },
    ...overrides,
  };
}
describe('native route-ownership gate', () => {
  it('accepts declared families with matching ingress', () => {
    expect(routeOwnershipFailures(native())).toEqual([]);
  });
  it('rejects a served family missing from the manifest', () => {
    expect(routeOwnershipFailures(native({ manifest: {} }))).toContainEqual(
      expect.stringContaining('assigns to no stack'),
    );
  });
  it('rejects a manifest family without a route', () => {
    expect(
      routeOwnershipFailures(
        native({ manifest: { executions: 'typescript', billing: 'typescript' } }),
      ),
    ).toContain("'billing' has no declared route");
  });
  it('refuses a retired route owner', () => {
    expect(routeOwnershipFailures(native({ manifest: { executions: 'python' } }))).toContain(
      "'executions' must be TypeScript-owned",
    );
  });
  it('refuses misrouted native operations', () => {
    expect(
      routeOwnershipFailures(
        native({
          ingress: { Caddyfile: ingressRouter('reverse_proxy {$RETIRED_ORIGIN}', UPSTREAMS) },
        }),
      ),
    ).toEqual([expect.stringContaining('must reach only typescript, but reaches [python]')]);
  });
  it('checks protocol paths independently of OpenAPI', () => {
    expect(
      routeOwnershipFailures(
        native({
          protocolPaths: ['/mcp', '/token'],
          ingress: {
            Caddyfile: ingressRouter(
              'reverse_proxy /token {$RETIRED_ORIGIN}\nreverse_proxy {$API_SERVICE_ORIGIN}',
              UPSTREAMS,
            ),
          },
        }),
      ),
    ).toEqual([expect.stringContaining('/token must reach only typescript')]);
  });
  it('refuses ambiguous family tags', () => {
    const input = native();
    input.typescript.paths['/api/v1/executions/{item_id}']!.get!.tags = ['executions', 'billing'];
    expect(routeOwnershipFailures(input)).toContainEqual(
      expect.stringContaining('exactly one family tag'),
    );
  });
});
