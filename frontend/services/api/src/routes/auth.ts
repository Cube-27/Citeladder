import {
  authResponseSchema,
  registrationResponseSchema,
  oauthStartResponseSchema,
  oauthProvidersResponseSchema,
} from '@citeladder/contracts/auth';
import { getCookie, setCookie } from 'hono/cookie';
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
  providerError,
  requireProviderConfigured,
  startSignIn,
  completeSignIn,
  SignInError,
} from '../auth/oauth.ts';
import { trustedClientIdentity } from '../auth/client-identity.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import type { Context } from 'hono';
import type { Database } from '../db/database.ts';

const credentialsSchema = z.object({
  email: z.email().trim().max(255),
  password: z.string().min(8).max(128),
});
const base = { family: 'auth', authorize: 'public', params: { path: {}, query: {} } } as const;
const oauthPath = { provider: { scalar: { kind: 'str' }, required: true } } as const;
const oauth = policy.auth.oauth;

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

function signInRedirect(c: Context, config: ServiceConfig, error?: string): Response {
  clearAuthOAuthCookie(c, config);
  const url = new URL(
    `${config.auth.frontendUrl.replace(/\/+$/u, '')}${error ? oauth.error_path : oauth.landing_path}`,
  );
  if (error) url.searchParams.set('error', error);
  return c.redirect(url.toString(), 302);
}

export const authRoutes = [
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
      await registerUser(db, payload.email, payload.password);
      return { message: 'If the address is eligible, the account is ready. Sign in to continue.' };
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
      const user = await authenticateUser(db, payload.email, payload.password);
      if (!user) {
        await enforceSubjectRequest(db, 'email', payload.email, {
          operation: 'auth.login.email_failure',
          limit: config.auth.limits.login_email_limit,
          windowSeconds: config.auth.limits.login_window_seconds,
        });
        throw new ApiError(401, 'Invalid credentials');
      }
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
    async handle({ config }) {
      return {
        providers: Object.entries(oauth.labels).map(([provider, label]) => ({
          provider,
          label,
          configured: providerConfigured(config, knownProvider(provider)),
        })),
      };
    },
  }),
  defineGetRoute({
    ...base,
    path: '/api/v1/auth/oauth/{provider}/start',
    params: { path: oauthPath, query: {} },
    response: oauthStartResponseSchema,
    async handle({ c, config }, { path }) {
      const { authorize_url, state, nonce } = await startSignIn(
        config,
        knownProvider(path.provider),
      );
      setCookie(c, oauth.cookie_name, nonce, {
        ...cookieOptions(config),
        path: oauth.cookie_path,
        maxAge: Number(config.auth.oauthSettings.state_ttl_seconds),
      });
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
      if (
        !providerConfigured(config, provider) ||
        !oauth.implemented.includes(provider) ||
        demoAccessExpired(config)
      )
        return signInRedirect(c, config, 'oauth_signin_disabled');
      if (query.error) return signInRedirect(c, config, 'oauth_signin_failed');
      if (!query.code || !query.state)
        return signInRedirect(c, config, 'oauth_signin_state_invalid');
      await meter(db, c, config);
      try {
        const token = await completeSignIn(
          db,
          config,
          provider,
          query.code,
          query.state,
          getCookie(c, oauth.cookie_name) ?? '',
        );
        clearOAuthCookies(c, config);
        setSessionCookie(c, config, token);
        return signInRedirect(c, config);
      } catch (error) {
        if (error instanceof SignInError) return signInRedirect(c, config, error.code);
        throw error;
      }
    },
  }),
  definePostRoute({
    ...base,
    path: '/api/v1/auth/oauth/{provider}/callback',
    params: { path: oauthPath, query: {} },
    response: z.null(),
    async handle({ c, config }, { path }): Promise<never> {
      clearAuthOAuthCookie(c, config);
      const provider = knownProvider(path.provider);
      requireProviderConfigured(config, provider);
      throw providerError(
        501,
        'oauth_callback_not_implemented',
        'OAuth callback is not implemented',
        provider,
      );
    },
  }),
];
