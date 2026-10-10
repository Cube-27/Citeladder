import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { routeApiHostRequest, type ApiHostEnv } from './worker';

const env: ApiHostEnv = {
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'a'.repeat(32),
  PUBLIC_API_HOST: 'api.citeladder.com',
};
const SOURCE = '11111111-1111-4111-8111-111111111111';

afterEach(() => vi.unstubAllGlobals());

function captureUpstream() {
  const sent: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      sent.push(request);
      return new Response('{}', { status: 202 });
    }),
  );
  return sent;
}

describe('API host route ownership', () => {
  it('serves only the configured host', async () => {
    const sent = captureUpstream();
    const response = await routeApiHostRequest(
      new Request(`https://citeladder-api-host.workers.dev/v1/crawl-logs/ingest/${SOURCE}`, {
        method: 'POST',
        body: '{}',
      }),
      env,
    );
    expect(response.status).toBe(404);
    expect(sent).toHaveLength(0);
  });
  it.each(['ingest', 'firehose'])(
    'forwards POST /v1/crawl-logs/%s with the origin token and API public host, without cookies',
    async (kind) => {
      const sent = captureUpstream();
      const payload = new Uint8Array([31, 139, 1, 2]);
      const response = await routeApiHostRequest(
        new Request(`https://api.citeladder.com/v1/crawl-logs/${kind}/${SOURCE}`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer clw_test',
            'content-encoding': 'gzip',
            cookie: 'session=private',
          },
          body: payload,
        }),
        env,
      );
      expect(response.status).toBe(202);
      expect(sent[0]!.url).toBe(`https://origin.citeladder.com/v1/crawl-logs/${kind}/${SOURCE}`);
      expect(new Uint8Array(await sent[0]!.arrayBuffer())).toEqual(payload);
      expect(sent[0]!.headers.get('authorization')).toBe('Bearer clw_test');
      expect(sent[0]!.headers.get('x-citeladder-origin-token')).toBe(env.ORIGIN_TOKEN);
      expect(sent[0]!.headers.get('x-citeladder-public-host')).toBe('api.citeladder.com');
      expect(sent[0]!.headers.get('cookie')).toBeNull();
    },
  );
  it('forwards public API calls with their bearer key and method, without cookies', async () => {
    const sent = captureUpstream();
    for (const [method, path] of [
      ['GET', '/v1/projects?limit=10'],
      ['GET', '/v1/openapi.json'],
      ['POST', `/v1/projects/${SOURCE}/audits`],
      ['PATCH', `/v1/projects/${SOURCE}/prompts/${SOURCE}`],
      ['DELETE', `/v1/projects/${SOURCE}/topics/${SOURCE}`],
    ] as const) {
      const response = await routeApiHostRequest(
        new Request('https://api.citeladder.com' + path, {
          method,
          headers: { authorization: 'Bearer cl_live_test', cookie: 'session=private' },
        }),
        env,
      );
      expect(response.status).toBe(202);
    }
    expect(sent.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      'GET /v1/projects',
      'GET /v1/openapi.json',
      `POST /v1/projects/${SOURCE}/audits`,
      `PATCH /v1/projects/${SOURCE}/prompts/${SOURCE}`,
      `DELETE /v1/projects/${SOURCE}/topics/${SOURCE}`,
    ]);
    expect(sent.every((request) => request.headers.get('cookie') === null)).toBe(true);
    expect(sent[0]!.headers.get('authorization')).toBe('Bearer cl_live_test');
  });
  it('answers everything else with a JSON 404 and never reaches the origin', async () => {
    const sent = captureUpstream();
    for (const [method, path] of [
      ['GET', '/pricing'],
      ['GET', '/'],
      ['GET', '/api/v1/auth/me'],
      ['POST', '/api/v1/crawl-logs/ingest/' + SOURCE],
      ['GET', '/v1/crawl-logs/ingest/' + SOURCE],
      ['POST', '/v1/crawl-logs/ingest/not-a-uuid'],
      ['PUT', `/v1/projects/${SOURCE}/topics`],
      ['GET', '/v1'],
      ['POST', '/mcp'],
    ] as const) {
      const response = await routeApiHostRequest(
        new Request('https://api.citeladder.com' + path, { method }),
        env,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'not_found' } });
    }
    expect(sent).toHaveLength(0);
  });
  it('refuses plain HTTP unless local Wrangler opts in', async () => {
    const sent = captureUpstream();
    const request = () =>
      new Request(`http://api.citeladder.com/v1/crawl-logs/ingest/${SOURCE}`, {
        method: 'POST',
        body: '{}',
      });
    expect((await routeApiHostRequest(request(), env)).status).toBe(404);
    expect(sent).toHaveLength(0);
    const local = {
      ...env,
      ORIGIN_UPSTREAM: 'http://api-service:8100',
      LOCAL_WORKER_ORIGIN: 'true',
    };
    expect((await routeApiHostRequest(request(), local)).status).toBe(202);
  });
});
