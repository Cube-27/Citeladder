import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { setLogSink } from '../src/logging.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig({ ABUSE_CLIENT_ERROR_CLIENT_LIMIT: '3' });
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const app = createApp(config, db);
let userId: string, workspaceId: string;

const report = {
  kind: 'render',
  message: 'Cannot read properties of undefined (reading "points")',
  stack: 'TypeError: boom\n    at Plot (https://app.citeladder.test/app-assets/chart.js?v=2:1:40)',
  route: '/projects/1f0c/ai-traffic',
  release: 'abc123',
  component: 'chart',
};

/** Fixture requests carry no socket, so every one is the `unavailable` client. */
async function clearClientBudget() {
  await db
    .deleteFrom('usage_windows')
    .where('subject_kind', '=', 'client')
    .where('subject_hash', '=', createHash('sha256').update('unavailable').digest('hex'))
    .where('operation', '=', 'client_errors.report')
    .execute();
}

async function send(body: unknown, headers: Record<string, string> = {}) {
  const records: Record<string, unknown>[] = [];
  const restore = setLogSink((line) => records.push(JSON.parse(line) as Record<string, unknown>));
  try {
    const response = await app.request('/api/v1/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, records: records.filter((r) => r.event === 'client.error') };
  } finally {
    setLogSink(restore);
  }
}

beforeAll(async () => {
  userId = await fixtures.user();
  workspaceId = await fixtures.ownedWorkspace(userId);
});
beforeEach(clearClientBudget);
afterAll(async () => {
  await clearClientBudget();
  await fixtures.cleanup();
  await db.destroy();
});

describe('client error sink', () => {
  it('logs a signed-out report with no reporter and without URL query strings, and answers 204', async () => {
    const result = await send(report);
    expect(result.status).toBe(204);
    expect(result.records).toEqual([
      expect.objectContaining({
        event: 'client.error',
        logger: 'api.client_errors',
        level: 'error',
        kind: 'render',
        message: 'Cannot read properties of undefined (reading "points")',
        stack:
          'TypeError: boom\n    at Plot (https://app.citeladder.test/app-assets/chart.js:1:40)',
        route: '/projects/1f0c/ai-traffic',
        release: 'abc123',
        component: 'chart',
        user_id: null,
        workspace_id: null,
      }),
    ]);
  });

  it('takes the reporter from the session and logs a missing chunk as a warning', async () => {
    const cookie = `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`;
    const result = await send(
      { ...report, kind: 'chunk_load', component: undefined },
      { cookie, 'x-workspace-id': workspaceId },
    );
    expect(result.status).toBe(204);
    expect(result.records).toEqual([
      expect.objectContaining({
        level: 'warning',
        kind: 'chunk_load',
        component: null,
        user_id: userId,
        workspace_id: workspaceId,
      }),
    ]);
  });

  it('refuses reporter fields, unknown kinds, query strings and oversized fields', async () => {
    const refused = [
      { ...report, user_id: randomUUID() },
      { ...report, workspace_id: randomUUID() },
      { ...report, kind: 'network' },
      { ...report, route: '/projects?search=private' },
      { ...report, message: 'x'.repeat(501) },
    ];
    const statuses = [];
    for (const body of refused) {
      await clearClientBudget();
      statuses.push((await send(body)).status);
    }
    expect(statuses).toEqual([422, 422, 422, 422, 422]);
  });

  it('refuses a body over the byte cap before parsing it', async () => {
    const result = await send(JSON.stringify({ ...report, padding: 'x'.repeat(20000) }));
    expect(result).toEqual({ status: 413, records: [] });
  });

  it('throttles one client past its budget', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send(report)).status);
    expect(statuses).toEqual([204, 204, 204, 429]);
  });
});
