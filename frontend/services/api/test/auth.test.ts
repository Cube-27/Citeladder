import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sessionUser } from '../src/auth/session.ts';
import { workspaceMember } from '../src/auth/workspace.ts';
import type { AppEnv } from '../src/context.ts';
import { onError } from '../src/errors.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const cookie = config.session.cookieName;

function probeApp(serviceConfig = config) {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.use('*', sessionUser(serviceConfig, db));
  app.get('/me', (c) => c.json({ id: c.get('user').id }));
  app.get('/w/:workspace_id', workspaceMember(db), (c) =>
    c.json({ id: c.get('workspace').workspaceId, capabilities: c.get('workspace').capabilities() }),
  );
  app.post('/w/:workspace_id', workspaceMember(db, 'write'), (c) => c.json({ ok: true }));
  return app;
}

type ProbeBody = {
  id?: string;
  capabilities?: string[];
  detail?: unknown;
  error: { code: string; message: string };
};

async function call(path: string, token?: string, method = 'GET', app = probeApp()) {
  const headers: Record<string, string> = token ? { Cookie: `${cookie}=${token}` } : {};
  const response = await app.request(path, { method, headers });
  const body = (await response.json()) as ProbeBody;
  return { status: response.status, body };
}

let userId: string;
let viewerToken: string;

beforeAll(async () => {
  userId = await fixtures.user({ sessionVersion: 2 });
  viewerToken = await sessionToken({ sub: userId, ver: 2 });
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

describe('session verification', () => {
  it('accepts a current session and resolves its user', async () => {
    expect(await call('/me', viewerToken)).toEqual({ status: 200, body: { id: userId } });
  });

  it.each([
    ['no cookie', async () => undefined, 'Not authenticated'],
    [
      'a foreign signature',
      () => sessionToken({ sub: userId, ver: 2 }, 'x'.repeat(40)),
      'Invalid token',
    ],
    ['a non-UUID subject', () => sessionToken({ sub: 'someone', ver: 2 }), 'Invalid token'],
    ['a missing version', () => sessionToken({ sub: userId }), 'Invalid token'],
    ['a revoked version', () => sessionToken({ sub: userId, ver: 1 }), 'Session no longer valid'],
    [
      'an unknown user',
      () => sessionToken({ sub: randomUUID(), ver: 0 }),
      'Session no longer valid',
    ],
  ])('refuses %s', async (_label, token, message) => {
    const { status, body } = await call('/me', await token());
    expect(status).toBe(401);
    expect(body.error).toMatchObject({ code: 'unauthorized', message });
  });

  it('refuses an inactive account', async () => {
    const inactive = await fixtures.user({ active: false });
    const { status, body } = await call('/me', await sessionToken({ sub: inactive, ver: 0 }));
    expect([status, body.detail]).toEqual([401, 'Inactive user']);
  });

  it('refuses every session once demo access has expired', async () => {
    const expired = probeApp(testConfig({ DEMO_MODE: 'true' }));
    const { status, body } = await call('/me', viewerToken, 'GET', expired);
    expect([status, body.detail]).toEqual([401, 'Demo access has expired']);
  });
});

describe('workspace membership', () => {
  let viewed: string;

  beforeAll(async () => {
    viewed = await fixtures.workspace();
    await fixtures.member(viewed, userId, 'viewer');
  });

  it('authorizes a member with the role capability set', async () => {
    const { status, body } = await call(`/w/${viewed}`, viewerToken);
    expect(status).toBe(200);
    expect(body).toEqual({ id: viewed, capabilities: ['read'] });
  });

  it('refuses a capability the role lacks with the backend wording', async () => {
    const { status, body } = await call(`/w/${viewed}`, viewerToken, 'POST');
    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'workspace_role_forbidden',
      message: 'Workspace member access is required',
    });
  });

  it('cannot tell a foreign workspace from a missing one', async () => {
    const foreign = await fixtures.workspace();
    const other = await fixtures.user();
    await fixtures.member(foreign, other, 'owner');
    const foreignResult = await call(`/w/${foreign}`, viewerToken);
    const missingResult = await call(`/w/${randomUUID()}`, viewerToken);
    expect(foreignResult.status).toBe(404);
    expect(foreignResult.body.detail).toBe('Workspace not found');
    expect(missingResult.body.detail).toBe(foreignResult.body.detail);
  });

  it('never authorizes through a system workspace membership', async () => {
    const system = await fixtures.workspace({ system: true });
    await fixtures.member(system, userId, 'owner');
    expect((await call(`/w/${system}`, viewerToken)).status).toBe(404);
  });

  it('rejects a malformed workspace id before querying', async () => {
    const { status, body } = await call('/w/not-a-uuid', viewerToken);
    expect(status).toBe(422);
    expect(body.error.code).toBe('validation_error');
  });

  it('confers nothing for a role outside the matrix', async () => {
    const odd = await fixtures.workspace();
    await fixtures.member(odd, userId, 'superuser');
    const { body } = await call(`/w/${odd}`, viewerToken);
    expect(body.capabilities).toEqual([]);
  });
});
