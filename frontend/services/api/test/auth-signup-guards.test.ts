import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { policy, type ServiceConfig } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { inDisposableDomain } from '../src/auth/reserved-domains.ts';
import { Fixtures, sessionToken, signupTestConfig, testDatabase } from './support.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const base = signupTestConfig({
  PUBLIC_SIGNUP_ENABLED: 'true',
  TURNSTILE_SECRET_KEY: 'recorded-turnstile-secret',
  FRONTEND_URL: 'https://app.example.test',
  OAUTH_GOOGLE_ENABLED: 'true',
  OAUTH_GOOGLE_CLIENT_ID: 'recorded-client',
  OAUTH_GOOGLE_CLIENT_SECRET: 'recorded-secret',
});
const db = testDatabase(base);
const fixtures = new Fixtures(db);
const prefix = `guards-${randomUUID()}`;
const password = 'password123';
const decision = { terms_revision: policy.auth.terms_revision, accept_terms: true };

const answers: Record<string, object> = {
  'solved-signup': { success: true, action: 'signup', hostname: 'app.example.test' },
  'solved-forgot': { success: true, action: 'forgot-password', hostname: 'app.example.test' },
  'solved-resend': { success: true, action: 'resend-verification', hostname: 'app.example.test' },
  'solved-elsewhere': { success: true, action: 'signup', hostname: 'other.example.test' },
};
const verifications: Record<string, string>[] = [];
let googleEmail = '';
const transport: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url === SITEVERIFY) {
    const form = Object.fromEntries(new URLSearchParams(String(init?.body)));
    verifications.push(form);
    return Response.json(
      answers[form.response ?? ''] ?? { success: false, 'error-codes': ['invalid-input-response'] },
    );
  }
  return Response.json(
    url.includes('/token')
      ? { access_token: 'recorded-token' }
      : { sub: `subject-${googleEmail}`, email: googleEmail, email_verified: true },
  );
};
const withTransport = (config: ServiceConfig) => ({
  ...config,
  auth: { ...config.auth, fetch: transport },
});
const app = createApp(withTransport(base), db);

function post(path: string, body: object, service = app) {
  return service.request(`/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function refusal(response: Response) {
  return {
    status: response.status,
    code: ((await response.json()) as { error: { code: string } }).error.code,
  };
}

async function usersWith(email: string) {
  return db.selectFrom('users').select('email').where('email', '=', email).execute();
}

async function challengesFor(userId: string) {
  return db.selectFrom('auth_challenges').select('purpose').where('user_id', '=', userId).execute();
}

async function passwordUser(email: string, origin: 'operator' | 'public' = 'operator') {
  const id = await fixtures.user();
  await db
    .updateTable('users')
    .set({ email, hashed_password: await hashPassword(password), registration_origin: origin })
    .where('id', '=', id)
    .execute();
  return id;
}

const created: string[] = [];
beforeEach(async () => {
  verifications.length = 0;
  await db
    .deleteFrom('usage_windows')
    .where('subject_kind', '=', 'client')
    .where('subject_hash', '=', createHash('sha256').update('unavailable').digest('hex'))
    .execute();
});
afterAll(async () => {
  if (created.length) await db.deleteFrom('users').where('email', 'in', created).execute();
  await fixtures.cleanup();
  await db.destroy();
});

describe('Turnstile on sign-up and email-link requests', () => {
  it('creates no account until the sign-up token verifies for sign-up on the app host', async () => {
    const email = `${prefix}-signup@example.test`;
    created.push(email);
    const body = { email, password, ...decision };
    const outcomes = [];
    for (const token of [undefined, 'forged', 'solved-forgot', 'solved-elsewhere'])
      outcomes.push(
        await refusal(await post('/auth/register', { ...body, turnstile_token: token })),
      );
    expect(outcomes).toEqual(
      Array.from({ length: 4 }, () => ({ status: 403, code: 'human_verification_failed' })),
    );
    expect(await usersWith(email)).toEqual([]);

    const accepted = await post('/auth/register', { ...body, turnstile_token: 'solved-signup' });
    expect(accepted.status).toBe(202);
    expect(await usersWith(email)).toEqual([{ email }]);
    expect(verifications.at(-1)).toEqual({
      secret: 'recorded-turnstile-secret',
      response: 'solved-signup',
    });
  });

  it('sends a reset link only with a token solved for that request', async () => {
    const email = `${prefix}-forgot@example.test`;
    const userId = await passwordUser(email);
    for (const token of [undefined, 'solved-signup'])
      expect(
        await refusal(await post('/auth/forgot-password', { email, turnstile_token: token })),
      ).toEqual({ status: 403, code: 'human_verification_failed' });
    expect(await challengesFor(userId)).toEqual([]);

    const sent = await post('/auth/forgot-password', { email, turnstile_token: 'solved-forgot' });
    expect(sent.status).toBe(202);
    expect(await challengesFor(userId)).toEqual([{ purpose: 'password_reset' }]);
  });

  it('resends a verification link only with a token solved for that request', async () => {
    const email = `${prefix}-resend@example.test`;
    const userId = await passwordUser(email, 'public');
    expect(await refusal(await post('/auth/resend-verification', { email }))).toEqual({
      status: 403,
      code: 'human_verification_failed',
    });
    expect(await challengesFor(userId)).toEqual([]);

    const sent = await post('/auth/resend-verification', {
      email,
      turnstile_token: 'solved-resend',
    });
    expect(sent.status).toBe(202);
    expect(await challengesFor(userId)).toEqual([{ purpose: 'verification' }]);
  });

  it('sends a signed-in person their own password link without a token', async () => {
    const email = `${prefix}-session@example.test`;
    const userId = await passwordUser(email);
    const cookie = `${base.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`;
    const sent = await app.request('/api/v1/auth/password-link', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(sent.status).toBe(202);
    expect(await challengesFor(userId)).toEqual([{ purpose: 'password_reset' }]);
    expect(verifications).toEqual([]);
  });

  it('signs in without any token', async () => {
    const email = `${prefix}-signin@example.test`;
    await passwordUser(email);
    const response = await post('/auth/login', { email, password, ...decision });
    expect(response.status).toBe(200);
    expect(verifications).toEqual([]);
  });

  it('challenges a Google sign-up start but not a Google sign-in start', async () => {
    const query = `?accept_terms=true&terms_revision=${policy.auth.terms_revision}`;
    const start = (extra: string) => app.request(`/api/v1/auth/oauth/google/start${query}${extra}`);
    expect(await refusal(await start('&signup=true'))).toEqual({
      status: 403,
      code: 'human_verification_failed',
    });
    expect((await start('&signup=true&turnstile_token=solved-signup')).status).toBe(200);
    expect((await start('')).status).toBe(200);
  });

  it('fails closed when no usable secret is configured, or Cloudflare cannot answer', async () => {
    const email = `${prefix}-closed@example.test`;
    const body = { email, password, ...decision, turnstile_token: 'solved-signup' };
    const unconfigured = createApp(
      { ...base, auth: { ...base.auth, turnstile: { secret: '', testKeysAllowed: false } } },
      db,
    );
    const testSecretInProduction = createApp(
      {
        ...base,
        auth: {
          ...base.auth,
          turnstile: { secret: '1x0000000000000000000000000000000AA', testKeysAllowed: false },
        },
      },
      db,
    );
    const unreachable = createApp(
      {
        ...base,
        auth: {
          ...base.auth,
          fetch: () => Promise.reject(new Error('offline')),
        },
      },
      db,
    );
    const outcomes = [];
    for (const service of [unconfigured, testSecretInProduction, unreachable])
      outcomes.push(await refusal(await post('/auth/register', body, service)));
    expect(outcomes).toEqual(
      Array.from({ length: 3 }, () => ({ status: 503, code: 'human_verification_unavailable' })),
    );
    expect(await usersWith(email)).toEqual([]);
  });

  it('answers Cloudflare test secrets locally: always-pass accepts only the dummy token', async () => {
    const development = createApp(signupTestConfig({ PUBLIC_SIGNUP_ENABLED: 'true' }), db);
    const email = `${prefix}-dummy@example.test`;
    created.push(email);
    const body = { email, password, ...decision };
    expect(
      await refusal(
        await post('/auth/register', { ...body, turnstile_token: 'solved-signup' }, development),
      ),
    ).toEqual({ status: 403, code: 'human_verification_failed' });
    const accepted = await post(
      '/auth/register',
      { ...body, turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' },
      development,
    );
    expect(accepted.status).toBe(202);
    expect(await usersWith(email)).toEqual([{ email }]);
  });
});

describe('disposable email domains at sign-up', () => {
  it('matches a listed domain and its subdomains in any case, and nothing that merely contains it', () => {
    expect(
      [
        'someone@mailinator.com',
        'someone@inbox.mailinator.com',
        'Someone@MAILINATOR.COM.',
        'someone@mailinator.com.example.test',
        'someone@gmail.com',
      ].map(inDisposableDomain),
    ).toEqual([true, true, true, false, false]);
  });

  it('refuses a disposable address as an email field error before any account exists', async () => {
    const email = `${prefix}@inbox.mailinator.com`;
    const response = await post('/auth/register', {
      email,
      password,
      ...decision,
      turnstile_token: 'solved-signup',
    });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: object }).error).toMatchObject({
      code: 'disposable_email_domain',
      details: { field: 'email' },
    });
    expect(await usersWith(email)).toEqual([]);
    expect(verifications).toEqual([]);
  });

  it('refuses a Google sign-up with a disposable address and creates nothing', async () => {
    googleEmail = `${prefix}-google@mailinator.com`;
    const started = await app.request(
      `/api/v1/auth/oauth/google/start?accept_terms=true&terms_revision=${policy.auth.terms_revision}&signup=true&turnstile_token=solved-signup`,
    );
    const { state } = (await started.json()) as { state: string };
    const nonce = started.headers
      .getSetCookie()
      .find((value) => value.startsWith(policy.auth.oauth.cookie_name))!
      .split(';')[0]!;
    const callback = await app.request(
      `/api/v1/auth/oauth/google/callback?${new URLSearchParams({ code: 'recorded-code', state })}`,
      { headers: { Cookie: nonce } },
    );
    expect(callback.headers.get('location')).toBe(
      'https://app.example.test/login?error=oauth_signin_email_disposable',
    );
    expect(await usersWith(googleEmail)).toEqual([]);
  });

  it('leaves an existing account on a disposable domain able to sign in', async () => {
    const email = `${prefix}-existing@mailinator.com`;
    await passwordUser(email);
    expect((await post('/auth/login', { email, password, ...decision })).status).toBe(200);
  });
});
