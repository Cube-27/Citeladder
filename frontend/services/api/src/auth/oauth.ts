import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { z } from 'zod';
import { policy, type ServiceConfig } from '../config.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { provisionAccount, type User } from '../workspaces/service.ts';
import { issueSession } from './service.ts';
import { recordSecurityEvent } from './security-events.ts';
import { requiresEmailVerification } from './eligibility.ts';
import { requestChallenge } from './challenges.ts';
import type { LinkProof } from './continuation.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';

const cfg = policy.auth.oauth;
const logger = getLogger('app.auth');
export type OAuthProvider = keyof typeof cfg.labels;
export class SignInError extends Error {
  readonly code:
    | 'oauth_signin_state_invalid'
    | 'oauth_signin_failed'
    | 'oauth_signin_email_unverified'
    | 'oauth_signin_link_required'
    | 'oauth_signin_disabled';
  constructor(code: SignInError['code']) {
    super(code);
    this.code = code;
  }
}

/** A coded provider error naming the provider. */
function providerError(
  status: 404 | 503,
  code: 'oauth_provider_unknown' | 'oauth_provider_not_configured',
  message: string,
  provider: string,
): ApiError {
  return new ApiError(status, message, { code, details: { provider } });
}

export function knownProvider(value: string): OAuthProvider {
  if (!Object.hasOwn(cfg.labels, value))
    throw providerError(404, 'oauth_provider_unknown', 'Unknown OAuth provider', value);
  return value as OAuthProvider;
}

function credentials(config: ServiceConfig, provider: OAuthProvider) {
  const settings = config.auth.oauthSettings;
  return {
    id: String(settings[`${provider}_client_id`] ?? ''),
    secret: String(settings[`${provider}_client_secret`] ?? ''),
  };
}

export function providerConfigured(config: ServiceConfig, provider: OAuthProvider): boolean {
  const { id, secret } = credentials(config, provider);
  return config.auth.oauthSettings[`${provider}_enabled`] === true && Boolean(id && secret);
}

/** `url` without trailing slashes; a linear scan, not a backtracking regex. */
export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

function redirectUri(config: ServiceConfig, provider: OAuthProvider): string {
  return (
    String(config.auth.oauthSettings[`${provider}_redirect_uri`] || '') ||
    `${withoutTrailingSlashes(config.auth.frontendUrl)}${cfg.callback_path.replace('{provider}', provider)}`
  );
}

function requireProviderConfigured(config: ServiceConfig, provider: OAuthProvider): void {
  if (!providerConfigured(config, provider))
    throw providerError(
      503,
      'oauth_provider_not_configured',
      'OAuth provider is not configured',
      provider,
    );
}

export async function startSignIn(config: ServiceConfig, provider: OAuthProvider) {
  requireProviderConfigured(config, provider);
  const nonce = randomBytes(32).toString('base64url');
  const ttl = Number(config.auth.oauthSettings.state_ttl_seconds);
  const state = await new SignJWT({
    sub: 'oauth-state',
    provider,
    session_nonce: nonce,
  })
    .setProtectedHeader({ alg: config.session.algorithm })
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(new TextEncoder().encode(config.session.secretKey));
  const url = new URL(cfg.authorize_urls[provider]);
  url.search = new URLSearchParams({
    client_id: credentials(config, provider).id,
    redirect_uri: redirectUri(config, provider),
    response_type: 'code',
    scope: cfg.scopes[provider],
    state,
  }).toString();
  return { authorize_url: url.toString(), state, nonce };
}

async function verifyState(
  config: ServiceConfig,
  provider: OAuthProvider,
  state: string,
  nonce: string,
): Promise<void> {
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(config.session.secretKey), {
      algorithms: [config.session.algorithm],
      requiredClaims: ['exp'],
    });
    const received = Buffer.from(
      typeof payload.session_nonce === 'string' ? payload.session_nonce : '',
    );
    const expected = Buffer.from(nonce);
    if (
      !nonce ||
      payload.sub !== 'oauth-state' ||
      payload.provider !== provider ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new SignInError('oauth_signin_state_invalid');
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) throw new SignInError('oauth_signin_state_invalid');
    throw error;
  }
}

const identitySchema = z.object({
  hd: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/)
    .optional(),
  sub: z.string().trim().min(1).max(255),
  email: z
    .email()
    .trim()
    .max(255)
    .transform((email) => email.toLowerCase()),
  email_verified: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(
      (value) =>
        value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true'),
    ),
});
type SignInIdentity = z.infer<typeof identitySchema>;

async function providerJson(
  config: ServiceConfig,
  endpoint: string,
  init: RequestInit,
): Promise<unknown> {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !cfg.approved_hosts.includes(url.hostname)
  )
    throw new SignInError('oauth_signin_failed');
  try {
    const response = await (config.auth.fetch ?? fetch)(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(cfg.timeout_seconds * 1000),
    });
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new SignInError('oauth_signin_failed');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > cfg.response_max_bytes) throw new SignInError('oauth_signin_failed');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    // Provider bodies and URLs may carry credentials; failures are text-free.
    throw new SignInError('oauth_signin_failed');
  }
}

async function identify(
  config: ServiceConfig,
  provider: OAuthProvider,
  code: string,
): Promise<SignInIdentity> {
  if (provider !== 'google') throw new SignInError('oauth_signin_disabled');
  const { id, secret } = credentials(config, provider);
  const tokens = z.object({ access_token: z.string().min(1) }).safeParse(
    await providerJson(config, cfg.token_urls[provider], {
      method: 'POST',
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(config, provider),
      }),
    }),
  );
  if (!tokens.success) throw new SignInError('oauth_signin_failed');
  const identity = identitySchema.safeParse(
    await providerJson(config, cfg.userinfo_urls.google, {
      headers: { Authorization: `Bearer ${tokens.data.access_token}` },
    }),
  );
  if (!identity.success) throw new SignInError('oauth_signin_failed');
  return identity.data;
}

type SignInEvent = 'auth.oauth_registered' | 'auth.oauth_linked';

/** The verified address's account, created passwordless when absent. */
async function accountForEmail(
  db: Database,
  config: ServiceConfig,
  identity: SignInIdentity,
  proof?: LinkProof,
): Promise<{ user: User; event: SignInEvent }> {
  const byEmail = db.selectFrom('users').selectAll().where('email', '=', identity.email);
  const existing = await byEmail.executeTakeFirst();
  const authoritative =
    identity.email_verified && (identity.email.endsWith('@gmail.com') || Boolean(identity.hd));
  if (existing) {
    if (
      existing.is_active &&
      proof?.userId === existing.id &&
      proof.version === existing.session_version &&
      !requiresEmailVerification(existing)
    )
      return { user: existing, event: 'auth.oauth_linked' };
    if (!existing.is_active) throw new SignInError('oauth_signin_failed');
    if (!identity.email_verified) throw new SignInError('oauth_signin_email_unverified');
    if (!requiresEmailVerification(existing)) throw new SignInError('oauth_signin_link_required');
    if (!authoritative) throw new SignInError('oauth_signin_email_unverified');
    // Preserve the workspace/account -> user lock order used by operator repair.
    await provisionAccount(db, existing);
    const claimed = await db
      .updateTable('users')
      .set({
        hashed_password: null,
        email_verified_at: new Date(),
        email_verification_method: 'google',
        session_version: sql`session_version + 1`,
        updated_at: new Date(),
      })
      .where('id', '=', existing.id)
      .where('session_version', '=', existing.session_version)
      .where('email_verified_at', 'is', null)
      .where('is_active', '=', true)
      .returningAll()
      .executeTakeFirst();
    if (!claimed) throw new SignInError('oauth_signin_state_invalid');
    await db
      .updateTable('auth_challenges')
      .set({ consumed_at: new Date() })
      .where('user_id', '=', existing.id)
      .where('consumed_at', 'is', null)
      .execute();
    return { user: claimed, event: 'auth.oauth_linked' };
  }
  if (config.demo.enabled || !config.auth.publicSignup)
    throw new SignInError('oauth_signin_disabled');
  await enforceSubjectRequest(db, 'client', 'global-trial', {
    operation: 'auth.trial.global',
    limit: policy.auth.mailbox.trial_daily_limit,
    windowSeconds: policy.auth.mailbox.daily_window_seconds,
  });
  const now = new Date();
  const inserted = await db
    .insertInto('users')
    .values({
      id: randomUUID(),
      email: identity.email,
      hashed_password: null,
      role: 'user',
      is_active: true,
      registration_origin: 'public',
      email_verified_at: authoritative ? now : null,
      email_verification_method: authoritative ? 'google' : null,
      session_version: 0,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column('email').doNothing())
    .returningAll()
    .executeTakeFirst();
  if (inserted) return { user: inserted, event: 'auth.oauth_registered' };
  throw new SignInError('oauth_signin_state_invalid');
}

/** Link the provider subject, refusing a second subject for the same user. */
async function linkIdentity(
  db: Database,
  provider: OAuthProvider,
  identity: SignInIdentity,
  userId: string,
): Promise<void> {
  const other = await db
    .selectFrom('user_identities')
    .select('subject')
    .where('provider', '=', provider)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (other) {
    if (other.subject !== identity.sub) throw new SignInError('oauth_signin_state_invalid');
    return;
  }
  const now = new Date();
  await db
    .insertInto('user_identities')
    .values({
      id: randomUUID(),
      user_id: userId,
      provider,
      subject: identity.sub,
      email: identity.email,
      email_verified: identity.email_verified,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

async function resolveAccount(
  db: Database,
  config: ServiceConfig,
  provider: OAuthProvider,
  identity: SignInIdentity,
  proof?: LinkProof,
) {
  // Stable subject and normalized address serialize linking; every path takes
  // "auth.email:" before "oauth:" so the two locks never invert.
  await subjectXactLock(db, `auth.email:${identity.email}`);
  await subjectXactLock(db, `oauth:${provider}:${identity.sub}`);
  const linked = await db
    .selectFrom('user_identities')
    .selectAll()
    .where('provider', '=', provider)
    .where('subject', '=', identity.sub)
    .executeTakeFirst();
  let user: User;
  let event: SignInEvent | null = null;
  if (linked) {
    const owner = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', linked.user_id)
      .executeTakeFirst();
    if (!owner) throw new SignInError('oauth_signin_state_invalid');
    user = owner;
  } else {
    ({ user, event } = await accountForEmail(db, config, identity, proof));
    await linkIdentity(db, provider, identity, user.id);
  }
  if (!user.is_active) throw new SignInError('oauth_signin_state_invalid');
  await db
    .updateTable('user_identities')
    .set({ email: identity.email, email_verified: identity.email_verified, updated_at: new Date() })
    .where('provider', '=', provider)
    .where('subject', '=', identity.sub)
    .where('user_id', '=', user.id)
    .execute();
  await provisionAccount(db, user);
  const current = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', user.id)
    .forNoKeyUpdate()
    .executeTakeFirstOrThrow();
  if (!current.is_active) throw new SignInError('oauth_signin_state_invalid');
  if (proof && (current.id !== proof.userId || current.session_version !== proof.version))
    throw new SignInError('oauth_signin_state_invalid');
  return { user: current, event };
}

export async function completeSignIn(
  db: Database,
  config: ServiceConfig,
  provider: OAuthProvider,
  code: string,
  state: string,
  nonce: string,
  continuation?: { returnTo?: string; proof?: LinkProof },
) {
  await verifyState(config, provider, state, nonce);
  const identity = await identify(config, provider, code);
  const resolved = await db.transaction().execute(async (trx) => {
    const account = await resolveAccount(trx, config, provider, identity, continuation?.proof);
    // Only a sign-in that issues a session is a login; an unverified mailbox is sent recovery mail.
    if (!requiresEmailVerification(account.user))
      await recordSecurityEvent(trx, 'auth.google_login', account.user.id);
    return account;
  });
  const fields = { user_id: resolved.user.id, provider };
  if (requiresEmailVerification(resolved.user)) {
    await requestChallenge(
      db,
      config,
      resolved.user.email,
      'password_reset',
      continuation?.returnTo,
    );
    throw new SignInError('oauth_signin_email_unverified');
  }
  if (resolved.event) logger.info(resolved.event, fields);
  logger.info('auth.oauth_login_success', fields);
  return issueSession(config, resolved.user);
}
