import { createHash, randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { jwtVerify } from 'jose';
import {
  ORIGIN_CLIENT_IP_HEADER,
  ORIGIN_PUBLIC_HOST_HEADER,
  ORIGIN_SIGNATURE_HEADER,
  ORIGIN_TIMESTAMP_HEADER,
  signOriginRequest,
} from '@citeladder/contracts/origin-signature';
import { createApp } from '../src/app.ts';
import { clientNetwork } from '../src/auth/client-identity.ts';
import { policy } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { Fixtures, sessionToken, signupTestConfig, testConfig, testDatabase } from './support.ts';

const config = signupTestConfig({ PUBLIC_SIGNUP_ENABLED: 'true' });
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const app = createApp(config, db);
const prefix = `pr14-${randomUUID()}`;
const email = `${prefix}@example.test`;
const password = 'password123';
const createdUsers: string[] = [];
const decision = { terms_revision: policy.auth.terms_revision, accept_terms: true };
// Sign-up also carries a Turnstile token: the dummy one Cloudflare's always-pass
// test secret accepts, which a test environment uses when none is configured.
const signUp = { ...decision, turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' };
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
  const response = await call('/auth/register', { email, password, ...signUp });
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
  const login = await call('/auth/login', { email, password, ...decision });
  expect(login.status).toBe(200);
  cookie = `${config.session.cookieName}=${(login.headers.get('set-cookie') ?? '').split(`${config.session.cookieName}=`)[1]?.split(';')[0]}`;
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
    await db
      .deleteFrom('account_policy_acceptances')
      .where('actor_id', 'in', createdUsers)
      .execute();
    await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
  }
  await clearClientBudget();
  await db.destroy();
});

describe('password auth routes', () => {
  it('serializes registration races into one identity that owns nothing yet', async () => {
    const address = `${prefix}-raced@example.test`;
    const responses = await Promise.all([
      call('/auth/register', { email: address, password, ...signUp }),
      call('/auth/register', { email: address, password, ...signUp }),
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

  it('refuses to create an account without the Terms decision and records the one it gets', async () => {
    const address = `${prefix}-undecided@example.test`;
    for (const body of [
      { email: address, password },
      { email: address, password, terms_revision: policy.auth.terms_revision },
      { email: address, password, ...decision, accept_terms: false },
    ])
      expect((await call('/auth/register', body)).status).toBe(422);
    const stale = await call('/auth/register', {
      email: address,
      password,
      ...decision,
      terms_revision: 'an-older-revision',
    });
    expect(stale.status).toBe(409);
    expect(
      await db.selectFrom('users').select('id').where('email', '=', address).execute(),
    ).toEqual([]);
    expect(
      await db
        .selectFrom('account_policy_acceptances')
        .select(['context', 'terms_revision'])
        .where('actor_id', '=', userId)
        .execute(),
    ).toEqual([{ context: 'signup', terms_revision: policy.auth.terms_revision }]);
    expect(await (await call('/auth/terms', undefined, cookie)).json()).toMatchObject({
      terms_revision: policy.auth.terms_revision,
      accepted_at: expect.any(String),
    });
  });

  it('refuses sign-up in a reserved mail domain before writing anything, but admits an ordinary one', async () => {
    await clearClientBudget();
    const guarded = createApp(testConfig({ PUBLIC_SIGNUP_ENABLED: 'true' }), db);
    const reserved = [
      `${prefix}-reserved@example.test`,
      `${prefix}-reserved@mail.example.invalid`,
      `${prefix}-reserved@example.com`,
      `${prefix}-reserved@Team.Example.ORG`,
    ];
    const refusals = [];
    for (const address of reserved) {
      const response = await call(
        '/auth/register',
        { email: address, password, ...decision },
        undefined,
        guarded,
      );
      const body = (await response.json()) as { error: { code: string; details: object } };
      refusals.push([response.status, body.error.code, body.error.details]);
    }
    expect(refusals).toEqual(
      reserved.map(() => [422, 'email_domain_reserved', { field: 'email' }]),
    );
    expect(
      await db
        .selectFrom('users')
        .select('email')
        .where(
          'email',
          'in',
          reserved.map((address) => address.toLowerCase()),
        )
        .execute(),
    ).toEqual([]);
    const ordinary = `${prefix}-ordinary@fixtures.citeladder.com`;
    const admitted = await call(
      '/auth/register',
      { email: ordinary, password, ...signUp },
      undefined,
      guarded,
    );
    expect(admitted.status).toBe(202);
    const user = await db
      .selectFrom('users')
      .select(['id', 'registration_origin'])
      .where('email', '=', ordinary)
      .executeTakeFirstOrThrow();
    createdUsers.push(user.id);
    expect(user.registration_origin).toBe('public');
  });

  it('creates the owned workspace once, with the Terms decision and a trial from that moment', async () => {
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

  it('records the Terms decision made on the sign-in form, which opens a joined workspace', async () => {
    await clearClientBudget();
    const member = await fixtures.user();
    createdUsers.push(member);
    await db
      .updateTable('users')
      .set({ hashed_password: await hashPassword(password) })
      .where('id', '=', member)
      .execute();
    await fixtures.member(workspaceId, member, 'member');
    const memberCookie = `${config.session.cookieName}=${await sessionToken({ sub: member, ver: 0 })}`;
    const credentials = { email: `${member}@example.test`, password };
    const decisions = () =>
      db
        .selectFrom('account_policy_acceptances')
        .select(['context', 'terms_revision'])
        .where('actor_id', '=', member)
        .execute();

    for (const body of [
      credentials,
      { ...credentials, terms_revision: policy.auth.terms_revision },
      { ...credentials, ...decision, accept_terms: false },
      { ...credentials, ...decision, terms_revision: 'an-older-revision' },
    ]) {
      const refused = await call('/auth/login', body);
      expect([422, 409]).toContain(refused.status);
      expect(refused.headers.get('set-cookie')).toBeNull();
    }
    expect(await decisions()).toEqual([]);
    const undecided = await call(`/workspaces/${workspaceId}/policies`, decision, memberCookie);
    expect(undecided.status).toBe(409);
    expect(((await undecided.json()) as { error: { code: string } }).error.code).toBe(
      'terms_decision_required',
    );

    for (let attempt = 0; attempt < 2; attempt += 1)
      expect((await call('/auth/login', { ...credentials, ...decision })).status).toBe(200);
    expect(await decisions()).toEqual([
      { context: 'signin', terms_revision: policy.auth.terms_revision },
    ]);
    const opened = await call(`/workspaces/${workspaceId}/policies`, decision, memberCookie);
    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({
      terms_revision: policy.auth.terms_revision,
      accepted_at: expect.any(String),
    });
    const foreign = await fixtures.ownedWorkspace(await fixtures.user());
    expect((await call(`/workspaces/${foreign}/policies`, decision, memberCookie)).status).toBe(
      404,
    );
    expect(
      await db
        .selectFrom('policy_acceptances')
        .select('workspace_id')
        .where('actor_id', '=', member)
        .execute(),
    ).toEqual([{ workspace_id: workspaceId }]);
  });

  it('keeps duplicate registration generic, session-free and trial provisioning idempotent', async () => {
    const duplicate = await call('/auth/register', { email, password, ...signUp });
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
    expect(grants.find((row) => row.key === 'prompt_runs_per_period')?.value).toBe(20);
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
      (
        await call(
          '/auth/register',
          { email, password, ...signUp },
          undefined,
          createApp(testConfig(), db),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          '/auth/login',
          { email, password, ...decision },
          undefined,
          createApp(testConfig({ DEMO_MODE: 'true' }), db),
        )
      ).status,
    ).toBe(401);
  });

  it('issues host-only HttpOnly Lax cookies and /me reads without repairing missing billing', async () => {
    const login = await call('/auth/login', { email, password, ...decision });
    const headers = login.headers.getSetCookie();
    const session = headers.find((value) => value.startsWith(`${config.session.cookieName}=`))!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain(`Max-Age=${config.session.expireSeconds}`);
    const production = createApp({ ...config, appEnv: 'production' }, db);
    const productionLogin = await call(
      '/auth/login',
      { email, password, ...decision },
      undefined,
      production,
    );
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
      body: JSON.stringify({ email, password, ...decision }),
    });
    expect(forged.status).toBe(403);
    expect(forged.headers.get('set-cookie')).toBeNull();
    const own = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ email, password, ...decision }),
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
      (await call('/auth/login', { email, password: secret, ...decision }, undefined, limited))
        .status;
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt(password)).toBe(200);
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt('incorrect')).toBe(401);
    expect(await attempt(password)).toBe(429);
  });

  it('spends the same email failure budget when changing a password or linking Google', async () => {
    await clearClientBudget();
    const limited = createApp(testConfig({ ABUSE_LOGIN_EMAIL_LIMIT: '2' }), db);
    const account = async () => {
      const id = await fixtures.user();
      await db
        .updateTable('users')
        .set({ hashed_password: await hashPassword(password) })
        .where('id', '=', id)
        .execute();
      return id;
    };
    const sessionOf = async (id: string, ver: number) =>
      `${config.session.cookieName}=${await sessionToken({ sub: id, ver })}`;

    const changer = await account();
    const change = async (current: string, ver: number) =>
      (
        await call(
          '/auth/change-password',
          { current_password: current, password: 'replacement123' },
          await sessionOf(changer, ver),
          limited,
        )
      ).status;
    expect(await change('incorrect', 0)).toBe(400);
    expect(await change(password, 0)).toBe(200);
    expect(await change('incorrect', 1)).toBe(400);
    expect(await change('incorrect', 1)).toBe(400);
    expect(await change('replacement123', 1)).toBe(429);
    const signIn = { email: `${changer}@example.test`, password: 'replacement123', ...decision };
    expect((await call('/auth/login', signIn, undefined, limited)).status).toBe(429);

    const linker = await account();
    const link = async (secret: string) =>
      (await call('/auth/link-google', { password: secret }, await sessionOf(linker, 0), limited))
        .status;
    // A mistyped password is a 400: a 401 would sign the person out in the app.
    expect(await link('incorrect')).toBe(400);
    expect(await link('incorrect')).toBe(400);
    expect(await link(password)).toBe(429);
    expect(
      (
        await call(
          '/auth/login',
          { email: `${linker}@example.test`, password, ...decision },
          undefined,
          limited,
        )
      ).status,
    ).toBe(429);
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
          { email, password: 'incorrect', ...decision },
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
          { email: 'absent@example.test', password, ...decision },
          undefined,
          createApp(limited, db),
        )
      ).status,
    ).toBe(401);
    const response = await call(
      '/auth/login',
      { email, password, ...decision },
      undefined,
      createApp(limited, db),
    );
    expect(response.status).toBe(429);
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe(
      'Too many requests',
    );
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    await clearClientBudget();
  });

  describe('per-network limits and the sign-in challenge', () => {
    const key = 'current-origin-token-0123456789abcdef';
    const behindWorker = (overrides: Record<string, string> = {}) =>
      createApp(
        testConfig({
          K_SERVICE: 'api',
          CITELADDER_ORIGIN_TOKEN: key,
          FRONTEND_URL: 'https://app.example.test',
          ...overrides,
        }),
        db,
      );
    const subjects: string[] = [];
    afterAll(async () => {
      await db
        .deleteFrom('usage_windows')
        .where(
          'subject_hash',
          'in',
          subjects.map((value) => createHash('sha256').update(value).digest('hex')),
        )
        .execute();
    });
    function freshSite() {
      return `2001:db8:${(0x1000 + randomInt(0xefff)).toString(16)}`;
    }
    async function signIn(
      service: ReturnType<typeof createApp>,
      clientIp: string,
      body: { email: string; password: string; turnstile_token?: string },
    ) {
      subjects.push(body.email, clientNetwork(clientIp, 'client'));
      const timestamp = Math.floor(Date.now() / 1000);
      const target = '/api/v1/auth/login';
      const signature = await signOriginRequest(key, {
        timestamp,
        method: 'POST',
        publicHost: 'app.example.test',
        target,
        clientIp,
      });
      const response = await service.request(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [ORIGIN_TIMESTAMP_HEADER]: String(timestamp),
          [ORIGIN_SIGNATURE_HEADER]: signature,
          [ORIGIN_PUBLIC_HOST_HEADER]: 'app.example.test',
          [ORIGIN_CLIENT_IP_HEADER]: clientIp,
        },
        body: JSON.stringify({ ...body, ...decision }),
      });
      const code = response.ok
        ? null
        : ((await response.json()) as { error: { code: string } }).error.code;
      return [response.status, code] as const;
    }
    const stranger = () => ({ email: `${randomUUID()}@example.test`, password: 'incorrect' });
    const solved = { email, password, turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' };
    const challenged = [403, 'human_verification_failed'] as const;

    it('counts every address in one IPv6 /64 against one sign-in budget', async () => {
      const site = freshSite();
      const limited = behindWorker({ ABUSE_LOGIN_CLIENT_LIMIT: '1' });
      expect(await signIn(limited, `${site}:1::1`, stranger())).toEqual([401, 'unauthorized']);
      expect(await signIn(limited, `${site}:1:ffff:ffff:ffff:ffff`, stranger())).toEqual([
        429,
        'rate_limited',
      ]);
      expect(await signIn(limited, `${site}:2::1`, stranger())).toEqual([401, 'unauthorized']);
    });

    it('challenges a network after its 5th failed sign-in, across addresses and accounts', async () => {
      const site = freshSite();
      const service = behindWorker();
      for (let attempt = 1; attempt <= 5; attempt += 1)
        expect(await signIn(service, `${site}:7::${attempt}`, stranger())).toEqual([
          401,
          'unauthorized',
        ]);
      expect(await signIn(service, `${site}:7::9`, { email, password })).toEqual(challenged);
      expect(await signIn(service, `${site}:7::9`, solved)).toEqual([200, null]);
      expect(await signIn(service, `${site}:8::1`, { email, password })).toEqual([200, null]);
    });

    it('challenges an address after its 5th failed sign-in, from any network', async () => {
      await db
        .deleteFrom('usage_windows')
        .where('operation', '=', 'auth.login.email_failure')
        .execute();
      const site = freshSite();
      const service = behindWorker();
      for (let attempt = 1; attempt <= 5; attempt += 1)
        expect(
          await signIn(service, `${site}:${attempt}::1`, { email, password: 'incorrect' }),
        ).toEqual([401, 'unauthorized']);
      expect(await signIn(service, `${site}:9::1`, { email, password })).toEqual(challenged);
      expect(await signIn(service, `${site}:9::1`, solved)).toEqual([200, null]);
      expect(await signIn(service, `${site}:9::1`, { email, password })).toEqual([200, null]);
    });

    it('challenges every sign-in once failures everywhere reach the global ceiling', async () => {
      const clearGlobal = async () => {
        await db
          .deleteFrom('usage_windows')
          .where('operation', '=', 'auth.login.global_failure')
          .execute();
      };
      await clearGlobal();
      onTestFinished(clearGlobal);
      const site = freshSite();
      const service = behindWorker({ ABUSE_LOGIN_FAILURE_GLOBAL_LIMIT: '2' });
      expect(await signIn(service, `${site}:1::1`, stranger())).toEqual([401, 'unauthorized']);
      expect(await signIn(service, `${site}:2::1`, stranger())).toEqual([401, 'unauthorized']);
      expect(await signIn(service, `${site}:3::1`, { email, password })).toEqual(challenged);
      expect(await signIn(service, `${site}:3::1`, solved)).toEqual([200, null]);
    });
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
      expect(
        (await call('/auth/login', { email: `${id}@example.test`, password, ...decision })).status,
      ).toBe(401);
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

describe('sign out everywhere and disconnect integrations', () => {
  const clientIds: string[] = [];

  afterAll(async () => {
    await db.deleteFrom('mcp_oauth_clients').where('client_id', 'in', clientIds).execute();
  });

  async function sessionCookie(id: string, ver: number) {
    return `${config.session.cookieName}=${await sessionToken({ sub: id, ver })}`;
  }

  async function connectedPerson() {
    const person = await fixtures.user();
    createdUsers.push(person);
    const workspace = await fixtures.ownedWorkspace(person);
    const account = await billingAccount(db, workspace);
    await grant(db, account, { key: 'api_access', value: 1, sourceKind: 'override' });
    await grant(db, account, { key: 'api_keys', value: 10, sourceKind: 'override' });
    const created = await app.request('/api/v1/api-keys', {
      method: 'POST',
      headers: {
        Cookie: await sessionCookie(person, 0),
        'x-workspace-id': workspace,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'CI export' }),
    });
    expect(created.status).toBe(201);
    const { secret } = (await created.json()) as { secret: string };
    const clientId = randomUUID();
    clientIds.push(clientId);
    await db
      .insertInto('mcp_oauth_clients')
      .values({
        id: randomUUID(),
        client_id: clientId,
        client_metadata: JSON.stringify({ client_name: 'test' }),
        client_secret_encrypted: '',
        created_at: new Date(),
      })
      .execute();
    const grantId = randomUUID();
    await db
      .insertInto('mcp_oauth_grants')
      .values({
        id: grantId,
        client_id: clientId,
        user_id: person,
        workspace_ids: JSON.stringify([workspace]),
        scopes: JSON.stringify(['citeladder:read']),
        resource: 'https://protocol.example.test/mcp',
        access_token_hash: randomUUID(),
        refresh_token_hash: randomUUID(),
        access_expires_at: new Date(Date.now() + 3600000),
        refresh_expires_at: new Date(Date.now() + 7200000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    return { person, secret, grantId };
  }

  async function integrations(person: { secret: string; grantId: string }) {
    const listed = await app.request('/v1/projects', {
      headers: { authorization: `Bearer ${person.secret}` },
    });
    const mcp = await db
      .selectFrom('mcp_oauth_grants')
      .select('revoked_at')
      .where('id', '=', person.grantId)
      .executeTakeFirstOrThrow();
    return { apiKeyStatus: listed.status, mcpGrantRevoked: mcp.revoked_at !== null };
  }

  async function events(person: string) {
    const rows = await db
      .selectFrom('security_events')
      .select('event')
      .where('actor_id', '=', person)
      .where('event', 'in', ['auth.logout', 'auth.logout_disconnect', 'mcp.revoke'])
      .orderBy('event')
      .execute();
    return rows.map((row) => row.event);
  }

  async function signOut(path: string, cookie: string) {
    const response = await app.request(path, { method: 'POST', headers: { Cookie: cookie } });
    return [response.status, response.headers.get('clear-site-data')];
  }

  it('plain sign-out ends every session but leaves the MCP grant and API key working', async () => {
    const connected = await connectedPerson();
    const cookie = await sessionCookie(connected.person, 0);
    const me = await call('/auth/me', undefined, cookie);
    expect([me.status, me.headers.get('clear-site-data')]).toEqual([200, null]);
    expect(await signOut('/api/v1/auth/logout', cookie)).toEqual([204, '"cache"']);
    expect((await call('/auth/me', undefined, cookie)).status).toBe(401);
    expect(await integrations(connected)).toEqual({ apiKeyStatus: 200, mcpGrantRevoked: false });
    expect(await events(connected.person)).toEqual(['auth.logout']);
  });

  it('ends every session and revokes that person’s MCP grant and API key, and nobody else’s', async () => {
    const connected = await connectedPerson();
    const bystander = await connectedPerson();
    const cookie = await sessionCookie(connected.person, 0);
    expect(await signOut('/api/v1/auth/logout-and-disconnect', cookie)).toEqual([204, '"cache"']);
    expect((await call('/auth/me', undefined, cookie)).status).toBe(401);
    expect(await integrations(connected)).toEqual({ apiKeyStatus: 401, mcpGrantRevoked: true });
    expect(await integrations(bystander)).toEqual({ apiKeyStatus: 200, mcpGrantRevoked: false });
    expect(await events(connected.person)).toEqual(['auth.logout_disconnect', 'mcp.revoke']);
  });

  it('refuses a cross-site request to disconnect', async () => {
    const connected = await connectedPerson();
    const refused = await app.request('/api/v1/auth/logout-and-disconnect', {
      method: 'POST',
      headers: { Cookie: await sessionCookie(connected.person, 0), 'sec-fetch-site': 'cross-site' },
    });
    expect(refused.status).toBe(403);
    expect(await integrations(connected)).toEqual({ apiKeyStatus: 200, mcpGrantRevoked: false });
  });
});

describe('Google sign-in', () => {
  const oauthEnv = {
    PUBLIC_SIGNUP_ENABLED: 'true',
    OAUTH_GOOGLE_ENABLED: 'true',
    OAUTH_GOOGLE_CLIENT_ID: 'recorded-client',
    OAUTH_GOOGLE_CLIENT_SECRET: 'recorded-secret',
    FRONTEND_URL: 'https://app.example.test',
  };
  const oauthConfig = signupTestConfig(oauthEnv);
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

  const signInStart = `?accept_terms=true&terms_revision=${policy.auth.terms_revision}`;
  const signUpStart = `${signInStart}&signup=true&turnstile_token=XXXX.DUMMY.TOKEN.XXXX`;

  async function start(service = oauthApp, query = signInStart) {
    const response = await call(`/auth/oauth/google/start${query}`, undefined, undefined, service);
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
      const unknown = await call(`/auth/oauth/${provider}/start${signInStart}`);
      expect(unknown.status).toBe(404);
      expect(((await unknown.json()) as Coded).error).toMatchObject({
        code: 'oauth_provider_unknown',
        details: { provider },
      });
    }
    const unconfigured = await call(`/auth/oauth/google/start${signInStart}`);
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

  it('never creates an account from sign-in: it sends the address to sign up instead', async () => {
    const { data, nonceCookie } = await start();
    const refused = await callback(data.state, nonceCookie);
    expect(refused.status).toBe(302);
    expect(refused.headers.get('location')).toBe(
      `https://app.example.test/register?${new URLSearchParams({
        error: 'oauth_signin_no_account',
        email: identityEmail,
      })}`,
    );
    expect(
      refused.headers.getSetCookie().some((value) => value.startsWith(config.session.cookieName)),
    ).toBe(false);
    expect(
      await db.selectFrom('users').select('id').where('email', '=', identityEmail).execute(),
    ).toEqual([]);
    const statuses = [];
    for (const query of [
      '',
      '?signup=true',
      '?accept_terms=true',
      `?terms_revision=${policy.auth.terms_revision}`,
      '?accept_terms=true&terms_revision=an-older-revision',
    ])
      statuses.push(
        (await call(`/auth/oauth/google/start${query}`, undefined, undefined, oauthApp)).status,
      );
    expect(statuses).toEqual([422, 422, 422, 422, 409]);
  });

  it('refuses a Google sign-up whose verified address is in a reserved mail domain', async () => {
    await clearClientBudget();
    const reserved = `${prefix}-google@team.example.com`;
    const guarded = testConfig(oauthEnv);
    guarded.auth.fetch = async (input) =>
      Response.json(
        String(input).includes('/token')
          ? { access_token: 'recorded-token' }
          : { sub: 'reserved-subject', email: reserved, email_verified: true, hd: 'example.com' },
      );
    const guardedApp = createApp(guarded, db);
    const { data, nonceCookie } = await start(guardedApp, signUpStart);
    const refused = await callback(data.state, nonceCookie, guardedApp);
    expect(refused.headers.get('location')).toBe(
      'https://app.example.test/login?error=oauth_signin_email_reserved',
    );
    expect(
      await db.selectFrom('users').select('id').where('email', '=', reserved).execute(),
    ).toEqual([]);
  });

  it('creates and reuses a passwordless account with its login receipt, landing on the workspace chooser', async () => {
    const { data, nonceCookie } = await start(oauthApp, signUpStart);
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
    expect(
      await db
        .selectFrom('account_policy_acceptances')
        .select('context')
        .where('actor_id', '=', user.id)
        .execute(),
    ).toEqual([{ context: 'signup' }]);
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
    expect(
      await db
        .selectFrom('account_policy_acceptances')
        .select('context')
        .where('actor_id', '=', user.id)
        .execute(),
    ).toEqual([{ context: 'signup' }]);
  });

  it('records the Terms decision carried through Google for an existing account it signs in', async () => {
    await clearClientBudget();
    const person = await fixtures.user();
    createdUsers.push(person);
    subject = `existing-subject-${person}`;
    identityEmail = `${person}@example.test`;
    const now = new Date();
    await db
      .insertInto('user_identities')
      .values({
        id: randomUUID(),
        user_id: person,
        provider: 'google',
        subject,
        email: identityEmail,
        email_verified: true,
        created_at: now,
        updated_at: now,
      })
      .execute();
    const signedIn = await start();
    const landing = await callback(signedIn.data.state, signedIn.nonceCookie);
    expect(landing.headers.get('location')).toBe('https://app.example.test/workspaces');
    expect(
      landing.headers.getSetCookie().some((value) => value.startsWith(config.session.cookieName)),
    ).toBe(true);
    expect(
      await db
        .selectFrom('account_policy_acceptances')
        .select(['context', 'terms_revision'])
        .where('actor_id', '=', person)
        .execute(),
    ).toEqual([{ context: 'signin', terms_revision: policy.auth.terms_revision }]);
    subject = 'google-subject';
    identityEmail = `${prefix}-google@example.test`;
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
    const login = await call('/auth/login', { email, password, ...decision });
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
