import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jwtVerify } from 'jose';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig({ PUBLIC_SIGNUP_ENABLED: 'true' });
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const app = createApp(config, db);
const prefix = `pr14-${randomUUID()}`;
const email = `${prefix}@example.test`;
const password = 'password123';
const createdUsers: string[] = [];
let cookie: string;
let userId: string;
let workspaceId: string;

function call(path: string, body?: object, session?: string, service = app) {
  return service.request(`/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function clearClientBudget() {
  await db
    .deleteFrom('usage_windows')
    .where('subject_kind', '=', 'client')
    .where('subject_hash', '=', createHash('sha256').update('unavailable').digest('hex'))
    .execute();
}

beforeAll(async () => {
  await clearClientBudget();
  const response = await call('/auth/register', { email, password });
  expect(response.status).toBe(202);
  const user = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();
  userId = user.id;
  createdUsers.push(userId);
  await db
    .updateTable('users')
    .set({ email_verified_at: new Date(), email_verification_method: 'verification' })
    .where('id', '=', userId)
    .execute();
  const login = await call('/auth/login', { email, password });
  expect(login.status).toBe(200);
  cookie = `${config.session.cookieName}=${(login.headers.get('set-cookie') ?? '').split(`${config.session.cookieName}=`)[1]?.split(';')[0]}`;
  // Signing up and signing in create nothing; onboarding creates the owned workspace.
  expect(
    await db.selectFrom('workspace_members').select('id').where('user_id', '=', userId).execute(),
  ).toEqual([]);
  const shown = (await (await call('/auth/policies', undefined, cookie)).json()) as {
    terms_revision: string;
  };
  const created = await call(
    '/workspaces',
    { name: 'Acme', terms_revision: shown.terms_revision, accept_terms: true },
    cookie,
  );
  expect(created.status).toBe(201);
  workspaceId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await fixtures.cleanup();
  if (createdUsers.length) {
    const spaces = await db
      .selectFrom('workspace_members')
      .select('workspace_id')
      .where('user_id', 'in', createdUsers)
      .where('role', '=', 'owner')
      .execute();
    if (spaces.length)
      await db
        .deleteFrom('workspaces')
        .where(
          'id',
          'in',
          spaces.map((row) => row.workspace_id),
        )
        .execute();
    await db.deleteFrom('security_events').where('actor_id', 'in', createdUsers).execute();
    await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
  }
  await clearClientBudget();
  await db.destroy();
});

describe('password auth routes', () => {
  it('serializes registration races into one identity that owns nothing yet', async () => {
    const address = `${prefix}-raced@example.test`;
    const responses = await Promise.all([
      call('/auth/register', { email: address, password }),
      call('/auth/register', { email: address, password }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const user = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', address)
      .executeTakeFirstOrThrow();
    createdUsers.push(user.id);
    expect(
      await db
        .selectFrom('workspace_members')
        .select('workspace_id')
        .where('user_id', '=', user.id)
        .execute(),
    ).toEqual([]);
  });

  it('creates the owned workspace once, with the Terms decision and a trial from that moment', async () => {
    const decision = { terms_revision: policy.auth.terms_revision, accept_terms: true };
    expect((await call('/workspaces', { name: 'Second' }, cookie)).status).toBe(422);
    const again = await call('/workspaces', { name: 'Second', ...decision }, cookie);
    expect(again.status).toBe(403);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
      'workspace_limit_exceeded',
    );
    const accepted = await call(`/workspaces/${workspaceId}/policies`, undefined, cookie);
    expect(((await accepted.json()) as { accepted_at: string | null }).accepted_at).not.toBeNull();

    const other = await fixtures.user();
    const otherCookie = `${config.session.cookieName}=${await sessionToken({ sub: other, ver: 0 })}`;
    const stale = await call(
      '/workspaces',
      { name: 'Stale', terms_revision: 'an-older-revision', accept_terms: true },
      otherCookie,
    );
    expect(stale.status).toBe(409);
    expect(
      await db.selectFrom('workspace_members').select('id').where('user_id', '=', other).execute(),
    ).toEqual([]);
  });

  it('keeps duplicate registration generic, session-free and trial provisioning idempotent', async () => {
    const duplicate = await call('/auth/register', { email, password });
    expect(duplicate.status).toBe(202);
    expect(duplicate.headers.get('set-cookie')).toBeNull();
    const account = await db
      .selectFrom('billing_accounts')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow();
    const grants = await db
      .selectFrom('account_grants')
      .select(['key', 'value', 'valid_until'])
      .where('billing_account_id', '=', account.id)
      .execute();
    expect(
      grants.every(
        (row) => row.valid_until?.getTime() === account.created_at.getTime() + 7 * 86400000,
      ),
    ).toBe(true);
    expect(grants.find((row) => row.key === 'successful_answers')?.value).toBe(20);
    expect(account.registration_cohort_at).toEqual(
      (
        await db
          .selectFrom('users')
          .select('created_at')
          .where('id', '=', userId)
          .executeTakeFirstOrThrow()
      ).created_at,
    );
    const runtime = await db
      .selectFrom('workspace_site_health_runtime')
      .select(['monitored_url_limit', 'resolved_entitlement_lifecycle_version'])
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow();
    expect(runtime.monitored_url_limit).toBe(policy.entitlements.baseline.grants.monitored_urls);
    expect(runtime.resolved_entitlement_lifecycle_version).toBe(1);
  });

  it('gates signup and demo expiry on the server', async () => {
    expect(
      (await call('/auth/register', { email, password }, undefined, createApp(testConfig(), db)))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          '/auth/login',
          { email, password },
          undefined,
          createApp(testConfig({ DEMO_MODE: 'true' }), db),
        )
      ).status,
    ).toBe(401);
  });

  it('issues host-only HttpOnly Lax cookies and /me reads without repairing missing billing', async () => {
    const login = await call('/auth/login', { email, password });
    const headers = login.headers.getSetCookie();
    const session = headers.find((value) => value.startsWith(`${config.session.cookieName}=`))!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain(`Max-Age=${config.session.expireSeconds}`);
    const production = createApp({ ...config, appEnv: 'production' }, db);
    const productionLogin = await call('/auth/login', { email, password }, undefined, production);
    expect(
      productionLogin.headers
        .getSetCookie()
        .find((value) => value.startsWith(config.session.cookieName)),
    ).toContain('Secure');
    expect(session).not.toContain('Domain=');
    const token = session.split(';')[0]!.split('=')[1]!;
    expect(
      (await jwtVerify(token, new TextEncoder().encode(config.session.secretKey))).payload,
    ).toMatchObject({ sub: userId, ver: 0 });
    const withoutWorkspace = await fixtures.user();
    const me = await call(
      '/auth/me',
      undefined,
      `${config.session.cookieName}=${await sessionToken({ sub: withoutWorkspace, ver: 0 })}`,
    );
    expect(me.status).toBe(200);
    expect(
      await db
        .selectFrom('workspace_members')
        .select('id')
        .where('user_id', '=', withoutWorkspace)
        .execute(),
    ).toEqual([]);
  });

  it('refuses a sign-in another site submits from the browser', async () => {
    await clearClientBudget();
    const forged = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Sec-Fetch-Site': 'cross-site' },
      body: JSON.stringify({ email, password }),
    });
    expect(forged.status).toBe(403);
    expect(forged.headers.get('set-cookie')).toBeNull();
    const own = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ email, password }),
    });
    expect(own.status).toBe(200);
  });

  it('refuses even the correct password once the email failure budget is spent', async () => {
    await clearClientBudget();
    await db
      .deleteFrom('usage_windows')
      .where('operation', '=', 'auth.login.email_failure')
      .execute();
    const limited = createApp(testConfig({ ABUSE_LOGIN_EMAIL_LIMIT: '2' }), db);
    const attempt = async (secret: string) =>
      (await call('/auth/login', { email, password: secret }, undefined, limited)).status;
    // A success forgets earlier failures, so one wrong guess does not carry over.
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt(password)).toBe(200);
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt(password)).toBe(429);
  });

  it('lets concurrent wrong guesses verify no more passwords than the email budget', async () => {
    await clearClientBudget();
    await db
      .deleteFrom('usage_windows')
      .where('operation', '=', 'auth.login.email_failure')
      .execute();
    const limited = createApp(
      testConfig({ ABUSE_LOGIN_EMAIL_LIMIT: '2', ABUSE_LOGIN_CLIENT_LIMIT: '50' }),
      db,
    );
    const statuses = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const response = await call(
          '/auth/login',
          { email, password: 'incorrect' },
          undefined,
          limited,
        );
        return response.status;
      }),
    );
    expect(statuses.sort()).toEqual([401, 401, 429, 429, 429]);
  });

  it('commits the client budget before a refused login and shares it across application instances', async () => {
    await clearClientBudget();
    const limited = testConfig({ ABUSE_LOGIN_CLIENT_LIMIT: '1' });
    expect(
      (
        await call(
          '/auth/login',
          { email: 'absent@example.test', password },
          undefined,
          createApp(limited, db),
        )
      ).status,
    ).toBe(401);
    const response = await call(
      '/auth/login',
      { email, password },
      undefined,
      createApp(limited, db),
    );
    expect(response.status).toBe(429);
    expect(((await response.json()) as { detail: string }).detail).toBe('Too many requests');
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    await clearClientBudget();
  });

  it('refuses passwordless and inactive users, and logout invalidates all existing sessions', async () => {
    const passwordless = await fixtures.user();
    const inactive = await fixtures.user({ active: false });
    await db
      .updateTable('users')
      .set({ hashed_password: await hashPassword(password) })
      .where('id', '=', inactive)
      .execute();
    for (const id of [passwordless, inactive])
      expect((await call('/auth/login', { email: `${id}@example.test`, password })).status).toBe(
        401,
      );
    const logout = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(logout.status).toBe(204);
    expect((await call('/auth/me', undefined, cookie)).status).toBe(401);
    const receipt = await db
      .selectFrom('security_events')
      .select('event')
      .where('actor_id', '=', userId)
      .where('event', '=', 'auth.logout')
      .execute();
    expect(receipt).toHaveLength(1);
  });
});

describe('Google sign-in', () => {
  const oauthConfig = testConfig({
    PUBLIC_SIGNUP_ENABLED: 'true',
    OAUTH_GOOGLE_ENABLED: 'true',
    OAUTH_GOOGLE_CLIENT_ID: 'recorded-client',
    OAUTH_GOOGLE_CLIENT_SECRET: 'recorded-secret',
    FRONTEND_URL: 'https://app.example.test',
  });
  let subject = 'google-subject';
  let identityEmail = `${prefix}-google@example.test`;
  let verified = true;
  const requests: string[] = [];
  const transport: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return Response.json(
      url.includes('/token')
        ? { access_token: 'recorded-token' }
        : { sub: subject, email: identityEmail, email_verified: verified, hd: 'example.test' },
    );
  };
  const oauthApp = createApp(
    { ...oauthConfig, auth: { ...oauthConfig.auth, fetch: transport } },
    db,
  );

  async function start(service = oauthApp) {
    const response = await call('/auth/oauth/google/start', undefined, undefined, service);
    const data = (await response.json()) as { state: string; authorize_url: string };
    return {
      data,
      nonceCookie: response.headers
        .getSetCookie()
        .find((value) => value.startsWith(policy.auth.oauth.cookie_name))!
        .split(';')[0]!,
    };
  }
  async function callback(state: string, nonceCookie?: string, service = oauthApp) {
    return service.request(
      `/api/v1/auth/oauth/google/callback?${new URLSearchParams({ code: 'recorded-code', state })}`,
      {
        headers: nonceCookie ? { Cookie: nonceCookie } : {},
      },
    );
  }

  it('codes unknown providers (GitHub included) and an unconfigured Google', async () => {
    type Coded = { error: { code: string; details: { provider: string } } };
    for (const provider of ['gitlab', 'github']) {
      const unknown = await call(`/auth/oauth/${provider}/start`);
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as Coded).error).toMatchObject({
        code: 'oauth_provider_unknown',
        details: { provider },
      });
    }
    const unconfigured = await call('/auth/oauth/google/start');
    expect(unconfigured.status).toBe(503);
    expect(((await unconfigured.json()) as Coded).error).toMatchObject({
      code: 'oauth_provider_not_configured',
      details: { provider: 'google' },
    });
  });

  it('uses the sign-in Google client and identity scopes, with cookie-bound state', async () => {
    const { data, nonceCookie } = await start();
    const params = new URL(data.authorize_url).searchParams;
    expect(params.get('client_id')).toBe('recorded-client');
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.has('access_type') || params.has('include_granted_scopes')).toBe(false);
    const before = requests.length;
    const invalid = await callback(data.state);
    expect(invalid.headers.get('location')).toContain('oauth_signin_state_invalid');
    expect(invalid.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(requests).toHaveLength(before);
    const wrong = await callback(data.state, nonceCookie.replace(/=.+$/u, '=different'));
    expect(wrong.headers.get('location')).toContain('oauth_signin_state_invalid');
  });

  it('maps malformed, oversized and rejected provider responses to text-free failures', async () => {
    for (const response of [
      new Response('credential-bearing upstream error', { status: 401 }),
      Response.json({ access_token: 42 }),
      new Response('x'.repeat(policy.auth.oauth.response_max_bytes + 1)),
    ]) {
      const failing = createApp(
        { ...oauthConfig, auth: { ...oauthConfig.auth, fetch: async () => response } },
        db,
      );
      const { data, nonceCookie } = await start(failing);
      const result = await callback(data.state, nonceCookie, failing);
      expect(result.headers.get('location')).toBe(
        'https://app.example.test/login?error=oauth_signin_failed',
      );
      expect(
        result.headers.getSetCookie().some((value) => value.startsWith(config.session.cookieName)),
      ).toBe(false);
    }
  });

  it('creates and reuses a passwordless account with its login receipt, landing on the workspace chooser', async () => {
    const { data, nonceCookie } = await start();
    const success = await callback(data.state, nonceCookie);
    expect(success.status).toBe(302);
    expect(success.headers.get('location')).toBe('https://app.example.test/workspaces');
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', identityEmail)
      .executeTakeFirstOrThrow();
    createdUsers.push(user.id);
    expect(user.hashed_password).toBeNull();
    // Google sign-in creates the identity only; onboarding creates the workspace.
    expect(
      await db
        .selectFrom('workspace_members')
        .select('id')
        .where('user_id', '=', user.id)
        .execute(),
    ).toEqual([]);
    const again = await start();
    expect((await callback(again.data.state, again.nonceCookie)).status).toBe(302);
    expect(
      await db.selectFrom('user_identities').select('id').where('user_id', '=', user.id).execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('actor_id', '=', user.id)
        .where('event', '=', 'auth.google_login')
        .execute(),
    ).toHaveLength(2);
  });

  it('refuses unverified linking and a second provider subject without changing the existing link', async () => {
    subject = 'second-subject';
    verified = false;
    const unverified = await start();
    expect(
      (await callback(unverified.data.state, unverified.nonceCookie)).headers.get('location'),
    ).toContain('oauth_signin_email_unverified');
    verified = true;
    const other = await start();
    expect((await callback(other.data.state, other.nonceCookie)).headers.get('location')).toContain(
      'oauth_signin_link_required',
    );
  });

  it('requires existing credentials before linking, then retains stable subject after email changes', async () => {
    subject = 'password-linked-subject';
    identityEmail = email;
    const first = await start();
    expect((await callback(first.data.state, first.nonceCookie)).headers.get('location')).toContain(
      'oauth_signin_link_required',
    );
    const login = await call('/auth/login', { email, password });
    const loginCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith(config.session.cookieName))!
      .split(';')[0]!;
    const linking = await call('/auth/link-google', { password }, loginCookie, oauthApp);
    const linkData = (await linking.json()) as { state: string };
    const linkCookies = linking.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect((await callback(linkData.state, linkCookies)).headers.get('location')).toBe(
      'https://app.example.test/workspaces',
    );
    identityEmail = `${prefix}-changed@example.test`;
    const changed = await start();
    const response = await callback(changed.data.state, changed.nonceCookie);
    const session = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(config.session.cookieName))!
      .split(';')[0]!;
    expect((await call('/auth/me', undefined, session)).status).toBe(200);
    expect(
      (
        await db
          .selectFrom('user_identities')
          .select('user_id')
          .where('subject', '=', subject)
          .executeTakeFirstOrThrow()
      ).user_id,
    ).toBe(userId);
  });
});
