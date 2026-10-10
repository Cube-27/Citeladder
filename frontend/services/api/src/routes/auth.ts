import {
  authResponseSchema,
  authSecuritySchema,
  registrationResponseSchema,
  oauthStartResponseSchema,
  oauthProvidersResponseSchema,
} from '@citeladder/contracts/auth';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { safeAuthReturnPath } from '@citeladder/contracts/auth-continuation';
import { sealContinuation, openContinuation, continuationCookie } from '../auth/continuation.ts';
import { z } from 'zod';
import { defineGetRoute, definePostRoute } from './define.ts';
import { demoAccessExpired, policy, type ServiceConfig } from '../config.ts';
import { ApiError } from '../errors.ts';
import { readBody } from '../http/body.ts';
import {
  registerUser,
  authenticateUser,
  issueSession,
  sessionView,
  logoutUser,
} from '../auth/service.ts';
import {
  cookieOptions,
  clearOAuthCookies,
  clearAuthOAuthCookie,
  clearSessionCookie,
  setSessionCookie,
} from '../auth/cookies.ts';
import {
  knownProvider,
  providerConfigured,
  startSignIn,
  completeSignIn,
  SignInError,
  withoutTrailingSlashes,
} from '../auth/oauth.ts';
import { trustedClientIdentity } from '../auth/client-identity.ts';
import {
  enforceSubjectRequest,
  releaseSubjectBudget,
  requireSubjectBudget,
} from '../abuse/usage.ts';
import type { Context } from 'hono';
import type { Database } from '../db/database.ts';
import { passwordSchema, verifyAccountPassword } from '../auth/password.ts';
import { requestChallenge, consumeChallenge, changePassword } from '../auth/challenges.ts';

const credentialsSchema = z.object({
  return_to: z.string().max(1024).optional(),
  email: z.email().trim().max(255),
  password: passwordSchema,
});
const base = { family: 'auth', authorize: 'public', params: { path: {}, query: {} } } as const;
const oauthPath = { provider: { scalar: { kind: 'str' }, required: true } } as const;
const oauth = policy.auth.oauth;
const acknowledgment = {
  message: 'If the address is eligible, you can use the email link to continue.',
};
const emailSchema = z.object({
  email: z.email().trim().max(255),
  return_to: z.string().max(1024).optional(),
});
const challengeSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: passwordSchema,
});
const changePasswordSchema = z.object({
  current_password: passwordSchema,
  password: passwordSchema,
});

async function mailboxMeter(db: Database, c: Context, config: ServiceConfig, subject?: string) {
  const cfg = policy.auth.mailbox;
  const budget = {
    operation: 'auth.mailbox.request',
    limit: cfg.request_limit,
    windowSeconds: cfg.request_window_seconds,
  };
  await enforceSubjectRequest(db, 'client', trustedClientIdentity(c, config), budget);
  if (subject) await enforceSubjectRequest(db, 'email', subject, budget);
}

async function meter(db: Database, c: Context, config: ServiceConfig, register = false) {
  const cfg = config.auth.limits;
  const limit = register ? cfg.register_client_limit : cfg.login_client_limit;
  const windowSeconds = register ? cfg.register_window_seconds : cfg.login_window_seconds;
  await enforceSubjectRequest(db, 'client', trustedClientIdentity(c, config), {
    operation: register ? 'auth.register.client' : 'auth.login.client',
    limit,
    windowSeconds,
  });
}

function loginFailureBudget(config: ServiceConfig) {
  return {
    operation: 'auth.login.email_failure',
    limit: config.auth.limits.login_email_limit,
    windowSeconds: config.auth.limits.login_window_seconds,
  };
}

function signInRedirect(c: Context, config: ServiceConfig, error?: string): Response {
  clearAuthOAuthCookie(c, config);
  const url = new URL(
    `${withoutTrailingSlashes(config.auth.frontendUrl)}${error ? oauth.error_path : oauth.landing_path}`,
  );
  if (error) url.searchParams.set('error', error);
  return c.redirect(url.toString(), 302);
}

export const authRoutes = [
  definePostRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/link-google',
    response: oauthStartResponseSchema,
    body: z.object({ password: passwordSchema }),
    async handle({ c, db, config }) {
      await mailboxMeter(db, c, config);
      const payload = await readBody(c, z.object({ password: passwordSchema }));
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', c.get('user').id)
        .executeTakeFirstOrThrow();
      if (!(await verifyAccountPassword(payload.password, user.hashed_password)))
        throw new ApiError(401, 'Invalid credentials');
      const started = await startSignIn(config, 'google');
      const options = {
        ...cookieOptions(config),
        path: oauth.cookie_path,
        maxAge: Number(config.auth.oauthSettings.state_ttl_seconds),
      };
      setCookie(c, oauth.cookie_name, started.nonce, options);
      setCookie(
        c,
        continuationCookie,
        await sealContinuation(config, started.nonce, undefined, {
          userId: user.id,
          version: user.session_version,
        }),
        options,
      );
      return { authorize_url: started.authorize_url, state: started.state };
    },
  }),
  defineGetRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/security',
    response: authSecuritySchema,
    async handle({ c, db }) {
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', c.get('user').id)
        .executeTakeFirstOrThrow();
      const identities = await db
        .selectFrom('user_identities')
        .select('provider')
        .where('user_id', '=', user.id)
        .execute();
      return {
        email: user.email,
        email_verified: Boolean(user.email_verified_at),
        methods: [
          ...(user.hashed_password ? ['password'] : []),
          ...identities.map((identity) => identity.provider),
        ],
      };
    },
  }),
  ...(['resend-verification', 'forgot-password'] as const).map((operation) =>
    definePostRoute({
      ...base,
      path: `/api/v1/auth/${operation}`,
      response: registrationResponseSchema,
      status: 202,
      body: emailSchema,
      async handle({ c, db, config }) {
        const payload = await readBody(c, emailSchema);
        await mailboxMeter(db, c, config, payload.email);
        await requestChallenge(
          db,
          config,
          payload.email,
          operation === 'forgot-password' ? 'password_reset' : 'verification',
          payload.return_to,
        );
        return acknowledgment;
      },
    }),
  ),
  ...(['verify-email', 'reset-password'] as const).map((operation) =>
    definePostRoute({
      ...base,
      path: `/api/v1/auth/${operation}`,
      response: registrationResponseSchema,
      body: challengeSchema,
      async handle({ c, db, config }) {
        const payload = await readBody(c, challengeSchema);
        await mailboxMeter(db, c, config);
        const email = await consumeChallenge(
          db,
          payload.token,
          payload.password,
          operation === 'verify-email' ? 'verification' : 'password_reset',
        );
        // A completed reset proves mailbox ownership, so earlier failures stop counting.
        if (operation === 'reset-password')
          await releaseSubjectBudget(db, 'email', email, loginFailureBudget(config).operation);
        clearSessionCookie(c, config);
        return { message: 'Your account is ready. Sign in to continue.' };
      },
    }),
  ),
  definePostRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/change-password',
    response: registrationResponseSchema,
    body: changePasswordSchema,
    async handle({ c, db, config }) {
      const payload = await readBody(c, changePasswordSchema);
      await mailboxMeter(db, c, config);
      const user = c.get('user');
      await changePassword(
        db,
        user.id,
        user.sessionVersion,
        payload.current_password,
        payload.password,
      );
      clearSessionCookie(c, config);
      clearOAuthCookies(c, config);
      return { message: 'Password changed. Sign in again.' };
    },
  }),
  definePostRoute({
    ...base,
    path: '/api/v1/auth/register',
    response: registrationResponseSchema,
    status: 202,
    body: credentialsSchema,
    async handle({ c, db, config }) {
      if (config.demo.enabled || !config.auth.publicSignup)
        throw new ApiError(403, 'Registration is disabled');
      const payload = await readBody(c, credentialsSchema);
      await meter(db, c, config, true);
      await mailboxMeter(db, c, config, payload.email);
      await registerUser(db, payload.email, payload.password);
      await requestChallenge(db, config, payload.email, 'verification', payload.return_to);
      return acknowledgment;
    },
  }),
  definePostRoute({
    ...base,
    path: '/api/v1/auth/login',
    response: authResponseSchema,
    body: credentialsSchema,
    async handle({ c, db, config }) {
      if (demoAccessExpired(config)) throw new ApiError(401, 'Demo access has expired');
      const payload = await readBody(c, credentialsSchema);
      await meter(db, c, config);
      const failures = loginFailureBudget(config);
      // An exhausted address refuses even a correct password until its window
      // passes or a password reset proves mailbox ownership.
      const failedBefore = await requireSubjectBudget(db, 'email', payload.email, failures);
      const user = await authenticateUser(db, payload.email, payload.password);
      if (!user) {
        await enforceSubjectRequest(db, 'email', payload.email, failures);
        throw new ApiError(401, 'Invalid credentials');
      }
      if (failedBefore) await releaseSubjectBudget(db, 'email', payload.email, failures.operation);
      clearOAuthCookies(c, config);
      setSessionCookie(c, config, await issueSession(config, user));
      return { user: sessionView(user) };
    },
  }),
  defineGetRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/me',
    response: authResponseSchema,
    async handle({ c, db }) {
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', c.get('user').id)
        .executeTakeFirstOrThrow();
      return { user: sessionView(user) };
    },
  }),
  definePostRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/logout',
    response: z.null(),
    raw: true,
    status: 204,
    async handle({ c, db, config }) {
      await logoutUser(db, c.get('user').id);
      clearSessionCookie(c, config);
      clearOAuthCookies(c, config);
      return c.body(null, 204);
    },
  }),
  defineGetRoute({
    ...base,
    path: '/api/v1/auth/oauth/providers',
    response: oauthProvidersResponseSchema,
    handle: ({ config }) =>
      Promise.resolve({
        providers: Object.entries(oauth.labels).map(([provider, label]) => ({
          provider,
          label,
          configured: providerConfigured(config, knownProvider(provider)),
        })),
      }),
  }),
  defineGetRoute({
    ...base,
    path: '/api/v1/auth/oauth/{provider}/start',
    params: { path: oauthPath, query: { return_to: { scalar: { kind: 'str' }, default: '' } } },
    response: oauthStartResponseSchema,
    async handle({ c, db, config }, { path, query }) {
      await mailboxMeter(db, c, config);
      const { authorize_url, state, nonce } = await startSignIn(
        config,
        knownProvider(path.provider),
      );
      setCookie(c, oauth.cookie_name, nonce, {
        ...cookieOptions(config),
        path: oauth.cookie_path,
        maxAge: Number(config.auth.oauthSettings.state_ttl_seconds),
      });
      setCookie(
        c,
        continuationCookie,
        await sealContinuation(config, nonce, safeAuthReturnPath(query.return_to)),
        {
          ...cookieOptions(config),
          path: oauth.cookie_path,
          maxAge: Number(config.auth.oauthSettings.state_ttl_seconds),
        },
      );
      return { authorize_url, state };
    },
  }),
  defineGetRoute({
    ...base,
    path: '/api/v1/auth/oauth/{provider}/callback',
    params: {
      path: oauthPath,
      query: {
        code: { scalar: { kind: 'str' }, default: '' },
        state: { scalar: { kind: 'str' }, default: '' },
        error: { scalar: { kind: 'str' }, default: '' },
      },
    },
    response: z.null(),
    raw: true,
    status: 302,
    async handle({ c, db, config }, { path, query }) {
      clearAuthOAuthCookie(c, config);
      const provider = knownProvider(path.provider);
      if (!providerConfigured(config, provider) || demoAccessExpired(config))
        return signInRedirect(c, config, 'oauth_signin_disabled');
      if (query.error) return signInRedirect(c, config, 'oauth_signin_failed');
      if (!query.code || !query.state)
        return signInRedirect(c, config, 'oauth_signin_state_invalid');
      await meter(db, c, config);
      try {
        const continuation = await openContinuation(
          config,
          getCookie(c, oauth.cookie_name) ?? '',
          getCookie(c, continuationCookie),
        );
        deleteCookie(c, continuationCookie, { ...cookieOptions(config), path: oauth.cookie_path });
        const token = await completeSignIn(
          db,
          config,
          provider,
          query.code,
          query.state,
          getCookie(c, oauth.cookie_name) ?? '',
          continuation,
        );
        clearOAuthCookies(c, config);
        setSessionCookie(c, config, token);
        return continuation?.returnTo
          ? c.redirect(new URL(continuation.returnTo, config.auth.frontendUrl).toString(), 302)
          : signInRedirect(c, config);
      } catch (error) {
        if (error instanceof SignInError) return signInRedirect(c, config, error.code);
        throw error;
      }
    },
  }),
];
