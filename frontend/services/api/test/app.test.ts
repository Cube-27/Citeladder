import { afterAll, describe, expect, it } from 'vitest';

import { Hono } from 'hono';

import { createApp } from '../src/app.ts';
import { trustedClientIdentity } from '../src/auth/client-identity.ts';
import type { AppEnv } from '../src/context.ts';
import { originToken } from '../src/http/origin-token.ts';
import { policy } from '../src/config.ts';
import { setLogSink } from '../src/logging.ts';
import { testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);

afterAll(() => db.destroy());

describe('health and readiness', () => {
  it('serves /v1 machine routes and the MCP protocol on the API host only, and nothing else there', async () => {
    const token = 'current-origin-token-0123456789abcdef';
    const protectedApp = createApp(
      testConfig({
        K_SERVICE: 'api',
        CITELADDER_ORIGIN_TOKEN: token,
        FRONTEND_URL: 'https://app.example.test',
        PUBLIC_WEBSITE_URL: 'https://example.test',
        PUBLIC_API_URL: 'https://api.example.test',
        MCP_ENABLED: 'true',
        ENCRYPTION_KEY: 'mcp-test-encryption-not-a-real-secret',
      }),
      db,
    );
    const status = async (method: string, path: string, publicHost: string) =>
      (
        await protectedApp.request(path, {
          method,
          headers: { 'X-CiteLadder-Origin-Token': token, 'X-CiteLadder-Public-Host': publicHost },
        })
      ).status;
    const ingest = '/v1/crawl-logs/ingest/11111111-1111-4111-8111-111111111111';
    // Reaches the route: an unknown source without a token is unauthorized, not routed away.
    expect(await status('POST', ingest, 'api.example.test')).toBe(401);
    for (const publicHost of ['app.example.test', 'example.test'])
      expect(await status('POST', ingest, publicHost)).toBe(404);
    for (const path of ['/health', '/api/v1/auth/me', '/mcp/oauth/consent'])
      expect(await status('GET', path, 'api.example.test')).toBe(404);
    expect(await status('GET', '/health', 'app.example.test')).toBe(200);
    // MCP moved to the API host outright: the apex and app hosts no longer route it.
    expect(await status('GET', '/.well-known/oauth-authorization-server', 'api.example.test')).toBe(
      200,
    );
    expect(await status('POST', '/mcp', 'api.example.test')).toBe(401);
    for (const publicHost of ['app.example.test', 'example.test'])
      for (const path of ['/mcp', '/.well-known/oauth-authorization-server', '/token'])
        expect(await status('GET', path, publicHost)).toBe(404);
  });
  it('protects the raw origin, including probes and MCP, and accepts rotated tokens', async () => {
    const current = 'current-origin-token-0123456789abcdef';
    const previous = 'previous-origin-token-0123456789abcdef';
    const protectedApp = createApp(
      testConfig({
        K_SERVICE: 'api',
        CITELADDER_ORIGIN_TOKEN: current,
        CITELADDER_ORIGIN_TOKEN_PREVIOUS: previous,
        FRONTEND_URL: 'https://app.example.test',
        PUBLIC_WEBSITE_URL: 'https://example.test',
      }),
      db,
    );
    const host = { 'X-CiteLadder-Public-Host': 'app.example.test' };
    for (const path of ['/health', '/ready', '/api/v1/auth/me', '/mcp']) {
      expect((await protectedApp.request(path, { headers: host })).status).toBe(403);
      for (const token of ['wrong', 'x'.repeat(current.length)])
        expect(
          (
            await protectedApp.request(path, {
              headers: { ...host, 'X-CiteLadder-Origin-Token': token },
            })
          ).status,
        ).toBe(403);
    }
    for (const token of [current, previous])
      for (const publicHost of ['app.example.test', 'EXAMPLE.test'])
        expect(
          (
            await protectedApp.request('/health', {
              headers: {
                'X-CiteLadder-Origin-Token': token,
                'X-CiteLadder-Public-Host': publicHost,
              },
            })
          ).status,
        ).toBe(200);
    // The token alone is not enough: the public host must be one the Workers serve.
    for (const publicHost of [undefined, 'attacker.example', 'api-123.us-central1.run.app'])
      expect(
        (
          await protectedApp.request('/health', {
            headers: {
              'X-CiteLadder-Origin-Token': current,
              ...(publicHost ? { 'X-CiteLadder-Public-Host': publicHost } : {}),
            },
          })
        ).status,
      ).toBe(403);
  });
  it('takes the visitor address only from a token-admitted Worker request', async () => {
    const protectedConfig = testConfig({
      K_SERVICE: 'api',
      CITELADDER_ORIGIN_TOKEN: 'current-origin-token-0123456789abcdef',
      FRONTEND_URL: 'https://app.example.test',
    });
    const probe = new Hono<AppEnv>()
      .use(originToken(protectedConfig))
      .get('/whoami', (c) => c.text(trustedClientIdentity(c, protectedConfig)));
    const admitted = {
      'X-CiteLadder-Origin-Token': 'current-origin-token-0123456789abcdef',
      'X-CiteLadder-Public-Host': 'app.example.test',
    };
    const identity = async (headers: Record<string, string>) =>
      (await probe.request('/whoami', { headers })).text();
    expect(await identity({ ...admitted, 'X-CiteLadder-Client-IP': '::ffff:203.0.113.7' })).toBe(
      '203.0.113.7',
    );
    // A malformed or absent address never becomes a shared rate-limit subject.
    expect(await identity({ ...admitted, 'X-CiteLadder-Client-IP': 'not-an-ip' })).toBe(
      'unavailable',
    );
    const open = new Hono<AppEnv>()
      .use(originToken(config))
      .get('/whoami', (c) => c.text(trustedClientIdentity(c, config)));
    expect(
      await (
        await open.request('/whoami', { headers: { 'X-CiteLadder-Client-IP': '203.0.113.7' } })
      ).text(),
    ).toBe('unavailable');
  });

  it('reports liveness without touching the database', async () => {
    const response = await createApp(config, db).request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('is ready when PostgreSQL answers', async () => {
    const response = await createApp(config, db).request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });

  it('leaves rotation when PostgreSQL is unreachable', async () => {
    const unreachable = testConfig({
      DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:9/none',
      DB_POOL_TIMEOUT_SECONDS: '1',
      DB_CONNECT_TIMEOUT_SECONDS: '1',
    });
    const unreachableDb = testDatabase(unreachable);
    const restore = setLogSink(() => {});
    try {
      const response = await createApp(unreachable, unreachableDb).request('/ready');
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: 'unavailable', database: 'down' });
    } finally {
      setLogSink(restore);
      await unreachableDb.destroy();
    }
  });
});

describe('request ids and the error envelope', () => {
  it('rejects oversized API bodies before auth, with declared and streamed lengths', async () => {
    const app = createApp(config, db);
    const bytes = new Uint8Array(policy.api.request_body_max_bytes + 1);
    const declared = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Length': String(bytes.length) },
      body: bytes,
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const streamed = await app.request('/api/v1/auth/login', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    for (const response of [declared, streamed]) {
      expect(response.status).toBe(413);
      expect(
        response.headers
          .get('cache-control')
          ?.split(',')
          .map((value) => value.trim()),
      ).toContain('no-store');
      expect(await response.json()).toMatchObject({ error: { code: 'payload_too_large' } });
    }
  });

  it('echoes a safe client request id and replaces an unsafe one', async () => {
    const app = createApp(config, db);
    const kept = await app.request('/health', { headers: { 'X-Request-ID': 'client-id.1' } });
    expect(kept.headers.get('X-Request-ID')).toBe('client-id.1');

    const replaced = await app.request('/health', { headers: { 'X-Request-ID': 'no;way' } });
    expect(replaced.headers.get('X-Request-ID')).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('answers an unknown path with the coded 404 envelope', async () => {
    const response = await createApp(config, db).request('/nowhere', {
      headers: { 'X-Request-ID': 'trace-404' },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Not Found', request_id: 'trace-404', retryable: false },
    });
  });

  it('logs an unhandled failure with its request id and discloses nothing', async () => {
    const records: Record<string, unknown>[] = [];
    const restore = setLogSink((line) => records.push(JSON.parse(line)));
    const app = createApp(config, db);
    app.get('/boom', () => {
      throw new Error('SELECT secret FROM vault');
    });
    try {
      const response = await app.request('/boom', { headers: { 'X-Request-ID': 'trace-500' } });
      expect(response.status).toBe(500);
      expect(response.headers.get('X-Request-ID')).toBe('trace-500');
      const body = (await response.json()) as { error: unknown };
      expect(body.error).toEqual({
        code: 'internal_error',
        message: 'An unexpected error occurred',
        request_id: 'trace-500',
        retryable: true,
      });
      expect(JSON.stringify(body)).not.toContain('vault');
      expect(records).toContainEqual(
        expect.objectContaining({
          event: 'unhandled_api_exception',
          level: 'error',
          correlation_id: 'trace-500',
        }),
      );
    } finally {
      setLogSink(restore);
    }
  });
});
