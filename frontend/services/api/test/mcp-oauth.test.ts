import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { configEnvironment, policy } from '../src/config.ts';
import type { AppEnv } from '../src/context.ts';
import { loadMcpConfig } from '../src/mcp/config.ts';
import { authorizedWorkspaceIds, authorizeProject } from '../src/mcp/data.ts';
import { authenticateMcp, consentCsrf, tokenHash } from '../src/mcp/oauth.ts';
import { admitRegistration, admitToolCall, registerClient } from '../src/mcp/registration.ts';
import { pruneUsageWindows } from '../src/abuse/usage.ts';
import { ApiError } from '../src/errors.ts';
import { registerMcpRoutes } from '../src/mcp/server.ts';
import { cleanupMcpProtocol } from '../src/mcp/maintenance.ts';
import { mcpPolicy } from '../src/mcp/config.ts';
import { billingAccount, grant as accountGrant } from './prompt-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

let config = testConfig();
const db = testDatabase(config);
const fixtures = new VisibilityFixtures(db);
const protocol = 'https://protocol.example.test';
const browser = 'https://app.example.test';
const callback = 'https://client.example.test/callback';
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const clients: string[] = [];
const identities: string[] = [];
let tenant: Tenant;
let cookie: string;
let session: string;
let app: Hono<AppEnv>;

beforeEach(async () => {
  config = testConfig({
    MCP_ENABLED: 'true',
    MCP_PUBLIC_BASE_URL: protocol,
    FRONTEND_URL: browser,
    ENCRYPTION_KEY: 'mcp-test-encryption-not-a-real-secret',
    MCP_ALLOWED_ACCOUNT_EMAIL: '',
    ABUSE_MCP_REGISTER_BURST_LIMIT: '2',
    ABUSE_MCP_REGISTER_CLIENT_LIMIT: '100',
    ABUSE_MCP_REGISTER_GLOBAL_LIMIT: '1000',
  });
  tenant = await fixtures.tenant();
  await db
    .insertInto('policy_acceptances')
    .values({
      id: randomUUID(),
      workspace_id: tenant.workspaceId,
      actor_id: tenant.userId,
      terms_revision: policy.mcp.terms_revision,
      privacy_notice_revision: 'test',
      context: 'test',
      accepted_at: new Date(),
    })
    .execute();
  session = await sessionToken({ sub: tenant.userId, ver: 0 });
  cookie = `${config.session.cookieName}=${session}`;
  app = new Hono<AppEnv>();
  registerMcpRoutes(app, config, db);
});
afterAll(async () => {
  await fixtures.cleanup();
  if (clients.length)
    await db.deleteFrom('mcp_oauth_clients').where('client_id', 'in', clients).execute();
  if (identities.length)
    await db
      .deleteFrom('usage_windows')
      .where(
        'subject_hash',
        'in',
        identities.map((id) => createHash('sha256').update(id).digest('hex')),
      )
      .execute();
  await db.destroy();
});

async function client(method: 'none' | 'client_secret_basic' = 'none') {
  const result = await registerClient(db, loadMcpConfig(config), {
    redirect_uris: [callback],
    client_name: '<Unverified>',
    token_endpoint_auth_method: method,
  });
  clients.push(result.client_id);
  return result;
}
function authorizationQuery(clientId: string) {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'bound-state',
    resource: `${protocol}/mcp`,
  });
  return query;
}
async function pending(clientId: string) {
  const response = await app.request(`${protocol}/authorize?${authorizationQuery(clientId)}`);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get('location')!);
  expect(location.origin).toBe(browser);
  return location.searchParams.get('transaction')!;
}
async function consent(
  transaction: string,
  selected = [tenant.workspaceId],
  csrf = consentCsrf(config, session, transaction),
  decision = 'approve',
) {
  const form = new URLSearchParams({ transaction, csrf_token: csrf, decision });
  for (const id of selected) form.append('workspace_id', id);
  return app.request(`${browser}/mcp/oauth/consent`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}
async function token(clientId: string, values: Record<string, string>, authorization?: string) {
  return app.request(`${protocol}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(authorization ? { authorization } : {}),
    },
    body: new URLSearchParams({ client_id: clientId, ...values }),
  });
}
async function grant() {
  const c = await client();
  const transaction = await pending(c.client_id);
  const approved = await consent(transaction);
  const destination = new URL(approved.headers.get('location')!);
  expect(destination.searchParams.get('state')).toBe('bound-state');
  const response = await token(c.client_id, {
    grant_type: 'authorization_code',
    code: destination.searchParams.get('code')!,
    code_verifier: verifier,
    redirect_uri: callback,
  });
  expect(response.status).toBe(200);
  const value = (await response.json()) as { access_token: string; refresh_token: string };
  const principal = await authenticateMcp(
    db,
    config,
    new Request(`${protocol}/mcp`, { headers: { authorization: `Bearer ${value.access_token}` } }),
  );
  expect(principal).not.toBeNull();
  return { client: c, value, principal: principal! };
}

it('serializes parallel authorization admission at the per-client outstanding cap', async () => {
  const c = await client();
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      app.request(`${protocol}/authorize?${authorizationQuery(c.client_id)}`),
    ),
  );
  const targets = responses.map((response) => new URL(response.headers.get('location')!));
  expect(targets.filter((url) => url.origin === browser)).toHaveLength(
    mcpPolicy.authorization_outstanding_limit,
  );
  // Over the cap, the error goes back to the client's proven redirect.
  expect(
    targets
      .filter((url) => url.origin !== browser)
      .map((url) => [url.searchParams.get('error'), url.searchParams.get('state')]),
  ).toEqual(Array.from({ length: 7 }, () => ['temporarily_unavailable', 'bound-state']));
  expect(
    await db
      .selectFrom('mcp_authorization_requests')
      .select('id')
      .where('client_id', '=', c.client_id)
      .execute(),
  ).toHaveLength(5);
});

it('bounds query bytes and decoded state before writing usage or requests', async () => {
  const c = await client();
  const before = await db
    .selectFrom('usage_windows')
    .select('id')
    .where('operation', 'like', 'mcp.authorize.%')
    .execute();
  for (const [key, value] of [
    ['state', 'é'.repeat(513)],
    ['extra', 'x'.repeat(8192)],
  ]) {
    const query = authorizationQuery(c.client_id);
    query.set(key!, value!);
    expect((await app.request(`${protocol}/authorize?${query}`)).status).toBe(400);
  }
  expect(
    await db
      .selectFrom('usage_windows')
      .select('id')
      .where('operation', 'like', 'mcp.authorize.%')
      .execute(),
  ).toEqual(before);
  expect(
    await db
      .selectFrom('mcp_authorization_requests')
      .select('id')
      .where('client_id', '=', c.client_id)
      .execute(),
  ).toEqual([]);
});

it.each([
  ['mcp.authorize.client', 'client', null, mcpPolicy.authorization_client_limit],
  ['mcp.authorize.source', 'client', 'unavailable', mcpPolicy.authorization_source_limit],
  ['mcp.authorize.global', 'global', 'mcp.authorize', mcpPolicy.authorization_global_limit],
] as const)(
  'refuses an exhausted %s budget before allocating a request',
  async (operation, kind, subject, limit) => {
    const c = await client();
    const hash = createHash('sha256')
      .update(subject ?? c.client_id)
      .digest('hex');
    const now = new Date();
    const start = Math.floor(now.getTime() / 60000) * 60000;
    await db
      .insertInto('usage_windows')
      .values({
        id: randomUUID(),
        subject_kind: kind,
        subject_hash: hash,
        operation,
        count: limit,
        window_started_at: new Date(start),
        expires_at: new Date(start + 60000),
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict
          .constraint('uq_usage_window_subject_operation_start')
          .doUpdateSet({ count: limit }),
      )
      .execute();
    try {
      const refused = await app.request(`${protocol}/authorize?${authorizationQuery(c.client_id)}`);
      expect(new URL(refused.headers.get('location')!).searchParams.get('error')).toBe(
        'temporarily_unavailable',
      );
      expect(
        await db
          .selectFrom('mcp_authorization_requests')
          .select('id')
          .where('client_id', '=', c.client_id)
          .execute(),
      ).toEqual([]);
    } finally {
      await db
        .deleteFrom('usage_windows')
        .where('operation', '=', operation)
        .where('subject_hash', '=', hash)
        .execute();
    }
  },
);

it('cleans only expired unconsumed protocol rows and preserves grants and audit data', async () => {
  const issued = await grant();
  const c = issued.client;
  await pending(c.client_id);
  await pending(c.client_id);
  const requests = await db
    .selectFrom('mcp_authorization_requests')
    .selectAll()
    .where('client_id', '=', c.client_id)
    .where('consumed_at', 'is', null)
    .execute();
  const expired = new Date(Date.now() - 60000);
  await db
    .updateTable('mcp_authorization_requests')
    .set({ expires_at: expired })
    .where('id', '=', requests[0]!.id)
    .execute();
  await db
    .updateTable('mcp_authorization_requests')
    .set({ expires_at: expired })
    .where('client_id', '=', c.client_id)
    .where('consumed_at', 'is not', null)
    .execute();
  const code = await db
    .selectFrom('mcp_authorization_codes')
    .selectAll()
    .where('client_id', '=', c.client_id)
    .executeTakeFirstOrThrow();
  await db
    .updateTable('mcp_authorization_codes')
    .set({ expires_at: expired })
    .where('id', '=', code.id)
    .execute();
  const staleCodeId = randomUUID();
  await db
    .insertInto('mcp_authorization_codes')
    .values({
      ...code,
      workspace_ids: JSON.stringify(code.workspace_ids),
      scopes: JSON.stringify(code.scopes),
      id: staleCodeId,
      code_hash: randomUUID(),
      consumed_at: null,
      expires_at: expired,
    })
    .execute();
  const usageId = randomUUID();
  await db
    .insertInto('usage_windows')
    .values({
      id: usageId,
      subject_kind: 'client',
      subject_hash: randomUUID(),
      operation: 'test.cleanup',
      count: 1,
      window_started_at: expired,
      expires_at: expired,
      created_at: expired,
      updated_at: expired,
    })
    .execute();
  const ancient = randomUUID();
  await db
    .insertInto('mcp_authorization_codes')
    .values({
      ...code,
      workspace_ids: JSON.stringify(code.workspace_ids),
      scopes: JSON.stringify(code.scopes),
      id: ancient,
      code_hash: randomUUID(),
      consumed_at: new Date(0),
      expires_at: new Date(0),
    })
    .execute();
  await cleanupMcpProtocol(db);
  await pruneUsageWindows(db, new Date(), 1000);
  expect(
    await db
      .selectFrom('mcp_authorization_requests')
      .select('id')
      .where('client_id', '=', c.client_id)
      .execute(),
  ).toHaveLength(2);
  // Recently consumed audit stays; past retention it goes, like stale unconsumed codes.
  expect(
    await db
      .selectFrom('mcp_authorization_codes')
      .select('id')
      .where('client_id', '=', c.client_id)
      .execute(),
  ).toEqual([{ id: code.id }]);
  expect(
    await db.selectFrom('usage_windows').select('id').where('id', '=', usageId).execute(),
  ).toEqual([]);
  expect(
    await authenticateMcp(
      db,
      config,
      new Request(`${protocol}/mcp`, {
        headers: { authorization: `Bearer ${issued.value.access_token}` },
      }),
    ),
  ).not.toBeNull();
});

it('binds CSRF, explicit selection, PKCE and redirect before a code can be consumed once', async () => {
  const c = await client('client_secret_basic');
  const transaction = await pending(c.client_id);
  expect((await consent(transaction, [tenant.workspaceId], 'wrong')).status).toBe(403);
  expect((await consent(transaction, [])).status).toBe(400);
  const foreign = await fixtures.tenant();
  expect((await consent(transaction, [foreign.workspaceId])).status).toBe(400);
  const approved = await consent(transaction);
  expect(approved.status).toBe(303);
  expect((await consent(transaction)).status).toBe(403);
  const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
  const basic = `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64')}`;
  const body = {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: callback,
  };
  expect((await token(c.client_id, body)).status).toBe(401);
  expect((await token(c.client_id, { ...body, code_verifier: 'x'.repeat(64) }, basic)).status).toBe(
    400,
  );
  expect(
    (await token(c.client_id, { ...body, redirect_uri: `${callback}?other` }, basic)).status,
  ).toBe(400);
  const exchanges = await Promise.all([
    token(c.client_id, body, basic),
    token(c.client_id, body, basic),
  ]);
  expect(exchanges.map((r) => r.status).sort()).toEqual([200, 400]);
  const row = await db
    .selectFrom('mcp_oauth_grants')
    .select(['workspace_ids', 'access_token_hash', 'revoked_at'])
    .where('client_id', '=', c.client_id)
    .executeTakeFirstOrThrow();
  expect(row.workspace_ids).toEqual([tenant.workspaceId]);
  const success = (await exchanges.find((r) => r.status === 200)!.json()) as {
    access_token: string;
  };
  expect(row.access_token_hash).toBe(tokenHash(config, success.access_token));
  // The second presentation of the code was a replay: what it minted is revoked.
  expect(row.revoked_at).not.toBeNull();
});

it('renders untrusted client metadata inert on the consent page', async () => {
  const c = await client();
  const transaction = await pending(c.client_id);
  const page = await app.request(
    `${browser}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
    { headers: { cookie } },
  );
  expect(page.status).toBe(200);
  const body = await page.text();
  expect(body).toContain('&lt;Unverified&gt;');
  expect(body).not.toContain('<Unverified>');
  expect(body).toContain(`value="${tenant.workspaceId}"`);
});

it('consumes denial without minting a grant and safely binds untrusted registration redirects', async () => {
  const c = await client();
  const transaction = await pending(c.client_id);
  const denied = await consent(transaction, [], consentCsrf(config, session, transaction), 'deny');
  expect(new URL(denied.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
  expect((await consent(transaction)).status).toBe(403);
  for (const redirect of ['http://remote.example/callback', 'javascript://x/%0aalert(1)'])
    await expect(
      registerClient(db, loadMcpConfig(config), { redirect_uris: [redirect] }),
    ).rejects.toThrow('Redirect URIs');
  const native = await registerClient(db, loadMcpConfig(config), {
    redirect_uris: ['cursor://anysphere.cursor-retrieval/oauth/callback'],
    grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
    scope: 'citeladder:read offline_access',
  });
  clients.push(native.client_id);
  expect(native).toMatchObject({
    grant_types: ['authorization_code', 'refresh_token'],
    scope: mcpPolicy.read_scope,
    token_endpoint_auth_method: 'client_secret_basic',
  });
});

it('matches loopback redirects on any port and returns later errors to the client', async () => {
  const registered = await registerClient(db, loadMcpConfig(config), {
    redirect_uris: ['http://127.0.0.1:3000/callback'],
    token_endpoint_auth_method: 'none',
  });
  clients.push(registered.client_id);
  const query = authorizationQuery(registered.client_id);
  query.set('redirect_uri', 'http://127.0.0.1:51234/callback');
  query.set('scope', 'citeladder:read offline_access');
  const accepted = await app.request(`${protocol}/authorize?${query}`);
  expect(new URL(accepted.headers.get('location')!).origin).toBe(browser);
  query.set('code_challenge_method', 'plain');
  const refused = new URL(
    (await app.request(`${protocol}/authorize?${query}`)).headers.get('location')!,
  );
  expect([
    refused.origin,
    refused.searchParams.get('error'),
    refused.searchParams.get('iss'),
  ]).toEqual(['http://127.0.0.1:51234', 'invalid_request', protocol]);
  query.set('redirect_uri', 'http://127.0.0.1:51234/elsewhere');
  expect((await app.request(`${protocol}/authorize?${query}`)).status).toBe(400);
});

it('rotates refresh tokens once and excludes membership changes, new tenants and stale loaded tokens', async () => {
  const { client: c, value, principal } = await grant();
  const extra = await fixtures.ownedWorkspace(tenant.userId);
  const extraProject = await fixtures.project(extra);
  await expect(authorizeProject(db, principal, extraProject)).rejects.toThrow('not found');
  const refresh = { grant_type: 'refresh_token', refresh_token: value.refresh_token };
  const attempts = await Promise.all([token(c.client_id, refresh), token(c.client_id, refresh)]);
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 400]);
  expect(await authorizedWorkspaceIds(db, principal)).toEqual([]);
  const rotated = (await attempts.find((r) => r.status === 200)!.json()) as {
    access_token: string;
    refresh_token: string;
  };
  const live = (await authenticateMcp(
    db,
    config,
    new Request(`${protocol}/mcp`, {
      headers: { authorization: `Bearer ${rotated.access_token}` },
    }),
  ))!;
  expect(await authorizedWorkspaceIds(db, live)).toEqual([tenant.workspaceId]);
  await db
    .deleteFrom('workspace_members')
    .where('user_id', '=', tenant.userId)
    .where('workspace_id', '=', tenant.workspaceId)
    .execute();
  expect(await authorizedWorkspaceIds(db, live)).toEqual([]);
  await fixtures.member(tenant.workspaceId, tenant.userId, 'viewer');
  expect(await authorizedWorkspaceIds(db, live)).toEqual([tenant.workspaceId]);
  await db
    .updateTable('mcp_oauth_grants')
    .set({ refresh_rotated_at: new Date(Date.now() - 120_000) })
    .where('id', '=', live.grantId)
    .execute();
  // The superseded token presented after the grace window: it leaked.
  expect((await token(c.client_id, refresh)).status).toBe(400);
  expect(await authorizedWorkspaceIds(db, live)).toEqual([]);
  expect(
    (
      await token(c.client_id, {
        grant_type: 'refresh_token',
        refresh_token: rotated.refresh_token,
      })
    ).status,
  ).toBe(400);
});

it('keeps the grant on a blank refresh scope and refuses grant types the client did not register', async () => {
  const { client: c, value } = await grant();
  const blank = await token(c.client_id, {
    grant_type: 'refresh_token',
    refresh_token: value.refresh_token,
    scope: ' ',
  });
  expect(blank.status).toBe(200);
  const rotated = (await blank.json()) as { access_token: string; refresh_token: string };
  const bearer = { authorization: `Bearer ${rotated.access_token}` };
  expect(
    await authenticateMcp(db, config, new Request(`${protocol}/mcp`, { headers: bearer })),
  ).not.toBeNull();
  await db
    .updateTable('mcp_oauth_clients')
    .set({ client_metadata: JSON.stringify({ ...c, grant_types: ['authorization_code'] }) })
    .where('client_id', '=', c.client_id)
    .execute();
  const refused = await token(c.client_id, {
    grant_type: 'refresh_token',
    refresh_token: rotated.refresh_token,
  });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: 'unsupported_grant_type' });
});

it('lets workspace admins remove only their authorization while users cannot revoke another account', async () => {
  const { principal, value } = await grant();
  const other = await fixtures.ownedWorkspace(tenant.userId);
  await db
    .updateTable('mcp_oauth_grants')
    .set({ workspace_ids: JSON.stringify([tenant.workspaceId, other]) })
    .where('id', '=', principal.grantId)
    .execute();
  await db
    .updateTable('workspaces')
    .set({ name: 'Acme' })
    .where('id', '=', tenant.workspaceId)
    .execute();
  await db.updateTable('workspaces').set({ name: 'Beta' }).where('id', '=', other).execute();
  const admin = await fixtures.user();
  await fixtures.member(tenant.workspaceId, admin, 'admin');
  const adminCookie = `${config.session.cookieName}=${await sessionToken({ sub: admin, ver: 0 })}`;
  const product = createApp(config, db);
  const used = await db
    .selectFrom('mcp_oauth_grants')
    .select('last_used_at')
    .where('id', '=', principal.grantId)
    .executeTakeFirstOrThrow();
  const own = await product.request('/api/v1/mcp/connections', { headers: { cookie } });
  expect(await own.json()).toEqual([
    expect.objectContaining({
      workspaces: [
        { id: tenant.workspaceId, name: 'Acme' },
        { id: other, name: 'Beta' },
      ],
      user_email: null,
      last_used_at: used.last_used_at!.toISOString(),
    }),
  ]);
  const list = await product.request(`/api/v1/workspaces/${tenant.workspaceId}/mcp/connections`, {
    headers: { cookie: adminCookie },
  });
  expect(await list.json()).toEqual([
    expect.objectContaining({
      workspaces: [{ id: tenant.workspaceId, name: 'Acme' }],
      user_email: `${tenant.userId}@example.test`,
    }),
  ]);
  expect(
    (
      await product.request(`/api/v1/mcp/connections/${principal.grantId}`, {
        method: 'DELETE',
        headers: { cookie: adminCookie },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await product.request(
        `/api/v1/workspaces/${tenant.workspaceId}/mcp/connections/${principal.grantId}`,
        { method: 'DELETE', headers: { cookie: adminCookie } },
      )
    ).status,
  ).toBe(204);
  expect(await authorizedWorkspaceIds(db, principal)).toEqual([other]);
  await db
    .updateTable('mcp_oauth_grants')
    .set({ workspace_ids: '[]' })
    .where('id', '=', principal.grantId)
    .execute();
  expect(
    await authenticateMcp(
      db,
      config,
      new Request(`${protocol}/mcp`, {
        headers: { authorization: `Bearer ${value.access_token}` },
      }),
    ),
  ).toBeNull();
});

it('meters malformed and oversized registrations, exempts preflight, and serializes concurrent budgets', async () => {
  const identity = randomUUID();
  identities.push(identity);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 5 }, () => admitRegistration(db, identity, configEnvironment(config))),
  );
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  expect(
    outcomes
      .filter((r) => r.status === 'rejected')
      .every((r) => r.reason instanceof ApiError && r.reason.status === 429),
  ).toBe(true);
  // The route has no socket peer in Hono's request harness: all calls share
  // the explicit unavailable identity, never a spoofed forwarded header.
  identities.push('unavailable');
  await db
    .deleteFrom('usage_windows')
    .where('subject_hash', '=', createHash('sha256').update('unavailable').digest('hex'))
    .execute();
  const preflight = await app.request(`${protocol}/mcp/register`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:6274' },
  });
  expect([preflight.status, preflight.headers.get('access-control-allow-origin')]).toEqual([
    204,
    '*',
  ]);
  expect(
    (await app.request(`${protocol}/mcp/register`, { method: 'POST', body: '{' })).status,
  ).toBe(400);
  expect(
    (
      await app.request(`${protocol}/mcp/register`, {
        method: 'POST',
        headers: { 'content-length': '20000' },
        body: 'x',
      })
    ).status,
  ).toBe(413);
  const limited = await app.request(`${protocol}/mcp/register`, {
    method: 'POST',
    body: '{}',
    headers: { 'x-forwarded-for': '203.0.113.50' },
  });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
});

it('prunes expired unused clients while preserving a live authorization request', async () => {
  const stale = await client();
  const live = await client();
  await pending(live.client_id);
  await db
    .updateTable('mcp_oauth_clients')
    .set({ created_at: new Date(0) })
    .where('client_id', 'in', [stale.client_id, live.client_id])
    .execute();
  await client();
  expect(
    (
      await db
        .selectFrom('mcp_oauth_clients')
        .select('client_id')
        .where('client_id', 'in', [stale.client_id, live.client_id])
        .execute()
    ).map((r) => r.client_id),
  ).toEqual([live.client_id]);
});

it('caps tool calls per connection and refuses the next with a retry time', async () => {
  const { principal } = await grant();
  for (let call = 0; call < mcpPolicy.tool_call_grant_limit; call++)
    await admitToolCall(db, principal.grantId, principal.userId);
  const refused = await admitToolCall(db, principal.grantId, principal.userId).catch(
    (error: unknown) => error,
  );
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).status).toBe(429);
  expect(Number((refused as ApiError).headers?.['retry-after'])).toBeGreaterThan(0);
});

/** What a person sees on a consent page: its form inputs and its visible text. */
function consentDocument(source: string) {
  const inputs: Record<string, string>[] = [];
  let text = '';
  const walk = (node: DefaultTreeAdapterMap['node']) => {
    if (node.nodeName === 'style') return;
    if (node.nodeName === 'input' && 'attrs' in node)
      inputs.push(Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value])));
    if (node.nodeName === '#text' && 'value' in node) text += node.value;
    if ('childNodes' in node) for (const child of node.childNodes) walk(child);
  };
  walk(parse(source));
  return {
    workspaces: inputs.filter(
      (input) => input.type === 'checkbox' && input.name !== 'accept_terms',
    ),
    terms: inputs.find((input) => input.name === 'accept_terms'),
    termsRevision: inputs.find((input) => input.name === 'terms_revision')?.value,
    text: text.replace(/\s+/gu, ' '),
  };
}
async function consentView(transaction: string) {
  const page = await app.request(
    `${browser}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
    { headers: { cookie } },
  );
  return { status: page.status, ...consentDocument(await page.text()) };
}
function approve(transaction: string, selected: string[], extra: Record<string, string> = {}) {
  const form = new URLSearchParams({
    transaction,
    csrf_token: consentCsrf(config, session, transaction),
    decision: 'approve',
    ...extra,
  });
  for (const id of selected) form.append('workspace_id', id);
  return app.request(`${browser}/mcp/oauth/consent`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

it('pre-selects the only shareable workspace and names the signed-in account', async () => {
  await db
    .updateTable('workspaces')
    .set({ name: 'Acme' })
    .where('id', '=', tenant.workspaceId)
    .execute();
  const view = await consentView(await pending((await client()).client_id));
  expect(view.status).toBe(200);
  expect(view.workspaces).toEqual([
    {
      type: 'checkbox',
      name: 'workspace_id',
      value: tenant.workspaceId,
      checked: '',
      required: '',
    },
  ]);
  expect(view.text).toContain(`Signed in as ${tenant.userId}@example.test`);
  expect(view.text).toContain('Acme');
  expect(view.text).not.toContain(tenant.workspaceId);
  expect(view.terms).toBeUndefined();
});

/** A workspace whose public trial ended yesterday. */
async function endedTrialWorkspace() {
  const workspaceId = await fixtures.ownedWorkspace(tenant.userId, { access: false });
  const trial = await accountGrant(db, await billingAccount(db, workspaceId), {
    key: 'workspace_access',
    value: 1,
    validFrom: new Date(Date.now() - 8 * 86_400_000),
    validUntil: new Date(Date.now() - 86_400_000),
  });
  await db
    .updateTable('account_grants')
    .set({ profile_key: policy.entitlements.public_trial.profile })
    .where('id', '=', trial)
    .execute();
  return workspaceId;
}

it('accepts the shown Terms on the consent page and tells ended access from unresolved access', async () => {
  const fresh = await fixtures.ownedWorkspace(tenant.userId);
  const ended = await endedTrialWorkspace();
  const unresolved = await fixtures.ownedWorkspace(tenant.userId, { access: false });
  await db.updateTable('workspaces').set({ name: 'Ended' }).where('id', '=', ended).execute();
  await db
    .updateTable('workspaces')
    .set({ name: 'Pending' })
    .where('id', '=', unresolved)
    .execute();
  const transaction = await pending((await client()).client_id);
  const view = await consentView(transaction);
  expect(view.workspaces.map((input) => [input.value ?? 'none', 'disabled' in input])).toEqual(
    expect.arrayContaining([
      [tenant.workspaceId, false],
      [fresh, false],
      ['none', true],
    ]),
  );
  expect(view.text).toContain('Ended Its trial or subscription has ended');
  expect(view.text).toContain('Pending Its access could not be confirmed right now');
  expect(view.terms).toEqual({ type: 'checkbox', name: 'accept_terms', value: 'yes' });
  expect(view.termsRevision).toBe(policy.mcp.terms_revision);

  for (const blocked of [ended, unresolved]) {
    const refused = await approve(transaction, [blocked]);
    expect(refused.status).toBe(400);
    expect(consentDocument(await refused.text()).text).toContain(
      'Select only workspaces that can be shared right now.',
    );
  }
  const unaccepted = await approve(transaction, [fresh]);
  expect(unaccepted.status).toBe(400);
  expect(consentDocument(await unaccepted.text()).text).toContain(
    'Accept the Terms of Service to share these workspaces.',
  );
  const approved = await approve(transaction, [fresh], {
    accept_terms: 'yes',
    terms_revision: policy.mcp.terms_revision,
  });
  expect(approved.status).toBe(303);
  expect(new URL(approved.headers.get('location')!).searchParams.get('code')).toBeTruthy();
  expect(
    await db
      .selectFrom('policy_acceptances')
      .select(['context', 'terms_revision'])
      .where('workspace_id', '=', fresh)
      .where('actor_id', '=', tenant.userId)
      .execute(),
  ).toEqual([{ context: 'mcp_consent', terms_revision: policy.mcp.terms_revision }]);
});

it('refuses Terms accepted from a page showing an older revision and records nothing', async () => {
  const fresh = await fixtures.ownedWorkspace(tenant.userId);
  const transaction = await pending((await client()).client_id);
  const stale = await approve(transaction, [fresh], {
    accept_terms: 'yes',
    terms_revision: 'superseded-revision',
  });
  expect(stale.status).toBe(400);
  const page = consentDocument(await stale.text());
  expect(page.text).toContain('The Terms of Service changed since this page loaded.');
  expect(page.termsRevision).toBe(policy.mcp.terms_revision);
  expect(
    await db
      .selectFrom('policy_acceptances')
      .select('id')
      .where('workspace_id', '=', fresh)
      .where('actor_id', '=', tenant.userId)
      .execute(),
  ).toEqual([]);
  const approved = await approve(transaction, [fresh], {
    accept_terms: 'yes',
    terms_revision: page.termsRevision!,
  });
  expect(approved.status).toBe(303);
});

it('explains an expired approval link instead of a bare error', async () => {
  const view = await consentView('expired-or-unknown');
  expect(view.status).toBe(403);
  expect(view.text).toContain('This approval link has expired');
  expect(view.text).toContain('connect CiteLadder again');
});
