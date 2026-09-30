import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { configEnvironment, policy } from '../src/config.ts';
import type { AppEnv } from '../src/context.ts';
import { loadMcpConfig } from '../src/mcp/config.ts';
import { authorizedWorkspaceIds, authorizeProject } from '../src/mcp/data.ts';
import { authenticateMcp, consentCsrf, tokenHash } from '../src/mcp/oauth.ts';
import { admitRegistration, registerClient, RegistrationLimit } from '../src/mcp/registration.ts';
import { registerMcpRoutes } from '../src/mcp/server.ts';
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
async function pending(clientId: string) {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'bound-state',
    resource: `${protocol}/mcp`,
  });
  const response = await app.request(`${protocol}/authorize?${query}`);
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

it('binds CSRF, explicit selection, PKCE and redirect before a code can be consumed once', async () => {
  const c = await client('client_secret_basic');
  const transaction = await pending(c.client_id);
  expect((await consent(transaction, [tenant.workspaceId], 'wrong')).status).toBe(403);
  expect((await consent(transaction, [])).status).toBe(403);
  const foreign = await fixtures.tenant();
  expect((await consent(transaction, [foreign.workspaceId])).status).toBe(403);
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
    .select(['workspace_ids', 'access_token_hash'])
    .where('client_id', '=', c.client_id)
    .executeTakeFirstOrThrow();
  expect(row.workspace_ids).toEqual([tenant.workspaceId]);
  const success = (await exchanges.find((r) => r.status === 200)!.json()) as {
    access_token: string;
  };
  expect(row.access_token_hash).toBe(tokenHash(config, success.access_token));
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
  await expect(
    registerClient(db, loadMcpConfig(config), {
      redirect_uris: ['http://remote.example/callback'],
    }),
  ).rejects.toThrow('Redirect URIs');
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
  await app.request(`${protocol}/revoke`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: c.client_id, token: rotated.refresh_token }),
  });
  expect(await authorizedWorkspaceIds(db, live)).toEqual([]);
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
  const admin = await fixtures.user();
  await fixtures.member(tenant.workspaceId, admin, 'admin');
  const adminCookie = `${config.session.cookieName}=${await sessionToken({ sub: admin, ver: 0 })}`;
  const product = createApp(config, db);
  const list = await product.request(`/api/v1/workspaces/${tenant.workspaceId}/mcp/connections`, {
    headers: { cookie: adminCookie },
  });
  expect(await list.json()).toEqual([
    expect.objectContaining({ workspace_ids: [tenant.workspaceId] }),
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
      .every((r) => r.reason instanceof RegistrationLimit),
  ).toBe(true);
  // The route has no socket peer in Hono's request harness: all calls share
  // the explicit unavailable identity, never a spoofed forwarded header.
  identities.push('unavailable');
  await db
    .deleteFrom('usage_windows')
    .where('subject_hash', '=', createHash('sha256').update('unavailable').digest('hex'))
    .execute();
  expect((await app.request(`${protocol}/mcp/register`, { method: 'OPTIONS' })).status).toBe(204);
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
