import {
  authResponseSchema,
  authSecuritySchema,
  policyRevisionSchema,
  policyStatusSchema,
  registrationResponseSchema,
  oauthStartResponseSchema,
  oauthProvidersResponseSchema,
} from '@citeladder/contracts/auth';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { safeAuthReturnPath } from '@citeladder/contracts/auth-continuation';
import {
  accountEntryRequestSchema,
  mailboxChallengeRequestSchema,
  mailboxLinkRequestSchema,
  passwordChangeRequestSchema,
  passwordConfirmationRequestSchema,
} from '@citeladder/contracts/auth-requests';
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
  endBrowserSession,
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
import { trustedClientNetwork } from '../auth/client-identity.ts';
import { assertSignupDomainAllowed } from '../auth/reserved-domains.ts';
import { requireHumanVerification, turnstileTokenSchema } from '../auth/human-verification.ts';
import { budget, budgetReached, countUse, releaseBudget, spendBudget } from '../abuse/usage.ts';
import { LOGIN_FAILURE_GLOBAL_SUBJECT } from '../config/abuse.ts';
import type { Context } from 'hono';
import type { Database } from '../db/database.ts';
import { passwordSchema } from '../auth/password.ts';
import {
  requestChallenge,
  consumeChallenge,
  changePassword,
  verifyBudgetedPassword,
} from '../auth/challenges.ts';
import {
  accountTermsStatus,
  currentPolicyRevision,
  recordAccountTermsDecision,
  requireCurrentRevision,
} from '../workspaces/policies.ts';

const accountEntrySchema = accountEntryRequestSchema.extend({
  password: passwordSchema,
  turnstile_token: turnstileTokenSchema,
});
const passwordConfirmationSchema = passwordConfirmationRequestSchema.extend({
  password: passwordSchema,
});
const base = { family: 'auth', authorize: 'public', params: { path: {}, query: {} } } as const;
const oauthPath = { provider: { scalar: { kind: 'str' }, required: true } } as const;
const oauth = policy.auth.oauth;
const acknowledgment = {
  message: 'If the address is eligible, you can use the email link to continue.',
};
const emailSchema = mailboxLinkRequestSchema.extend({ turnstile_token: turnstileTokenSchema });
const challengeSchema = mailboxChallengeRequestSchema.extend({ password: passwordSchema });
const changePasswordSchema = passwordChangeRequestSchema.extend({
  current_password: passwordSchema,
  password: passwordSchema,
});

async function mailboxMeter(
  db: Database,
  c: Context,
  config: ServiceConfig,
  subject?: string,
  verification?: Parameters<typeof requireHumanVerification>[2],
) {
  await spendBudget(db, budget('mailbox_request_client'), trustedClientNetwork(c, config));
  if (verification) await requireHumanVerification(c, config, verification);
  if (subject) await spendBudget(db, budget('mailbox_request_email'), subject);
}

async function meter(db: Database, c: Context, config: ServiceConfig, register = false) {
  await spendBudget(
    db,
    budget(register ? 'register_client' : 'login_client', config.settings),
    trustedClientNetwork(c, config, register ? 'registration' : 'client'),
  );
}

async function challengeAfterFailures(
  db: Database,
  c: Context,
  config: ServiceConfig,
  { email, token }: { email: string; token: string },
) {
  const thresholds = await Promise.all([
    budgetReached(db, budget('login_email_challenge', config.settings), email),
    budgetReached(
      db,
      budget('login_network_challenge', config.settings),
      trustedClientNetwork(c, config),
    ),
    budgetReached(
      db,
      budget('login_global_challenge', config.settings),
      LOGIN_FAILURE_GLOBAL_SUBJECT,
    ),
  ]);
  if (thresholds.some(Boolean))
    await requireHumanVerification(c, config, { token, action: 'login' });
}

async function countLoginFailure(db: Database, c: Context, config: ServiceConfig) {
  await Promise.all([
    countUse(
      db,
      budget('login_network_challenge', config.settings),
      trustedClientNetwork(c, config),
    ),
    countUse(db, budget('login_global_challenge', config.settings), LOGIN_FAILURE_GLOBAL_SUBJECT),
  ]);
}

function signUpRedirect(
  c: Context,
  config: ServiceConfig,
  email: string | undefined,
  returnTo: string | undefined,
): Response {
  clearAuthOAuthCookie(c, config);
  const url = new URL(`${withoutTrailingSlashes(config.auth.frontendUrl)}${oauth.signup_path}`);
  url.searchParams.set('error', 'oauth_signin_no_account');
  if (email) url.searchParams.set('email', email);
  if (returnTo) url.searchParams.set('return_to', returnTo);
  return c.redirect(url.toString(), 302);
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
    body: passwordConfirmationSchema,
    async handle({ c, db, config }) {
      await mailboxMeter(db, c, config);
      const payload = await readBody(c, passwordConfirmationSchema);
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', c.get('user').id)
        .executeTakeFirstOrThrow();
      if (!(await verifyBudgetedPassword(db, config, user, payload.password)))
        throw new ApiError(400, 'Current password is incorrect');
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
    path: '/api/v1/auth/policies',
    response: policyRevisionSchema,
    handle() {
      return Promise.resolve(currentPolicyRevision());
    },
  }),
  defineGetRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/terms',
    response: policyStatusSchema,
    handle: ({ c, db }) => accountTermsStatus(db, c.get('user').id),
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
        await mailboxMeter(db, c, config, payload.email, {
          token: payload.turnstile_token,
          action: operation,
        });
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
        await consumeChallenge(
          db,
          payload.token,
          payload.password,
          operation === 'verify-email' ? 'verification' : 'password_reset',
        );
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
      await changePassword(db, config, {
        userId: user.id,
        sessionVersion: user.sessionVersion,
        currentPassword: payload.current_password,
        password: payload.password,
      });
      clearSessionCookie(c, config);
      clearOAuthCookies(c, config);
      return { message: 'Password changed. Sign in again.' };
    },
  }),
  definePostRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/password-link',
    response: registrationResponseSchema,
    status: 202,
    async handle({ c, db, config }) {
      const user = await db
        .selectFrom('users')
        .select('email')
        .where('id', '=', c.get('user').id)
        .executeTakeFirstOrThrow();
      await mailboxMeter(db, c, config, user.email);
      await requestChallenge(db, config, user.email, 'password_reset');
      return acknowledgment;
    },
  }),
  definePostRoute({
    ...base,
    path: '/api/v1/auth/register',
    response: registrationResponseSchema,
    status: 202,
    body: accountEntrySchema,
    async handle({ c, db, config }) {
      if (config.demo.enabled || !config.auth.publicSignup)
        throw new ApiError(403, 'Registration is disabled');
      const payload = await readBody(c, accountEntrySchema);
      assertSignupDomainAllowed(config, payload.email);
      requireCurrentRevision(payload.terms_revision);
      await meter(db, c, config, true);
      await mailboxMeter(db, c, config, payload.email, {
        token: payload.turnstile_token,
        action: 'signup',
      });
      await registerUser(db, payload.email, payload.password, payload.terms_revision);
      await requestChallenge(db, config, payload.email, 'verification', payload.return_to);
      return acknowledgment;
    },
  }),
  definePostRoute({
    ...base,
    path: '/api/v1/auth/login',
    response: authResponseSchema,
    body: accountEntrySchema,
    async handle({ c, db, config }) {
      if (demoAccessExpired(config)) throw new ApiError(401, 'Demo access has expired');
      const payload = await readBody(c, accountEntrySchema);
      requireCurrentRevision(payload.terms_revision);
      await meter(db, c, config);
      await challengeAfterFailures(db, c, config, {
        email: payload.email,
        token: payload.turnstile_token,
      });
      await spendBudget(db, budget('login_email_failure', config.settings), payload.email);
      const user = await authenticateUser(db, payload.email, payload.password);
      if (!user) {
        await countLoginFailure(db, c, config);
        throw new ApiError(401, 'Invalid credentials');
      }
      await Promise.all([
        releaseBudget(db, 'login_email_failure', payload.email),
        recordAccountTermsDecision(db, {
          actorId: user.id,
          revision: payload.terms_revision,
          context: 'signin',
        }),
      ]);
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
    handle: ({ c }) => Promise.resolve({ user: sessionView(c.get('user').profile) }),
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
      endBrowserSession(c, config);
      return c.body(null, 204);
    },
  }),
  definePostRoute({
    ...base,
    authorize: 'session',
    path: '/api/v1/auth/logout-and-disconnect',
    response: z.null(),
    raw: true,
    status: 204,
    async handle({ c, db, config }) {
      await logoutUser(db, c.get('user').id, { disconnect: true });
      endBrowserSession(c, config);
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
    params: {
      path: oauthPath,
      query: {
        return_to: { scalar: { kind: 'str' }, default: '' },
        accept_terms: { scalar: { kind: 'str' }, default: '' },
        terms_revision: { scalar: { kind: 'str' }, default: '' },
        signup: { scalar: { kind: 'str' }, default: '' },
        turnstile_token: { scalar: { kind: 'str' }, default: '' },
      },
    },
    response: oauthStartResponseSchema,
    async handle({ c, db, config }, { path, query }) {
      await mailboxMeter(db, c, config);
      if (query.accept_terms !== 'true' || !query.terms_revision)
        throw new ApiError(422, 'Google sign-in needs the Terms decision and its revision.');
      requireCurrentRevision(query.terms_revision);
      if (query.signup === 'true')
        await requireHumanVerification(c, config, {
          token: query.turnstile_token,
          action: 'signup',
        });
      const { authorize_url, state, nonce } = await startSignIn(
        config,
        knownProvider(path.provider),
        { termsRevision: query.terms_revision, signup: query.signup === 'true' },
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
      let continuation: Awaited<ReturnType<typeof openContinuation>> = undefined;
      try {
        continuation = await openContinuation(
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
        if (error instanceof SignInError && error.code === 'oauth_signin_no_account')
          return signUpRedirect(c, config, error.email, continuation?.returnTo);
        if (error instanceof SignInError) return signInRedirect(c, config, error.code);
        throw error;
      }
    },
  }),
];
