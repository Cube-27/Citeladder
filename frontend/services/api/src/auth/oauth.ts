import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { sql } from 'kysely';
import { z } from 'zod';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { provisionAccount, type User } from '../workspaces/service.ts';
import { issueSession } from './service.ts';
import { recordSecurityEvent } from './security-events.ts';

const cfg = policy.auth.oauth;
const logger = getLogger('app.auth');
export type OAuthProvider = keyof typeof cfg.labels;
export class SignInError extends Error {
  readonly code:
    | 'oauth_signin_state_invalid'
    | 'oauth_signin_failed'
    | 'oauth_signin_email_unverified'
    | 'oauth_signin_disabled';
  constructor(code: SignInError['code']) {
    super(code);
    this.code = code;
  }
}

export function knownProvider(value: string): OAuthProvider {
  if (!Object.hasOwn(cfg.labels, value))
    throw new ApiError(404, 'Unknown OAuth provider', {
      code: 'oauth_provider_unknown',
      details: { provider: value },
    });
  return value as OAuthProvider;
}

function credentials(config: ServiceConfig, provider: OAuthProvider) {
  const settings = config.auth.oauthSettings;
  let id = String(settings[`${provider}_client_id`] ?? '');
  let secret = String(settings[`${provider}_client_secret`] ?? '');
  if (provider === 'google' && !(id && secret)) {
    id = String(settings.integration_client_id ?? '');
    secret = String(settings.integration_client_secret ?? '');
  }
  return { id, secret };
}

export function providerConfigured(config: ServiceConfig, provider: OAuthProvider): boolean {
  const { id, secret } = credentials(config, provider);
  return config.auth.oauthSettings[`${provider}_enabled`] === true && Boolean(id && secret);
}

function redirectUri(config: ServiceConfig, provider: OAuthProvider): string {
  return (
    String(config.auth.oauthSettings[`${provider}_redirect_uri`] || '') ||
    `${config.auth.frontendUrl.replace(/\/+$/u, '')}${cfg.callback_path.replace('{provider}', provider)}`
  );
}

export async function startSignIn(config: ServiceConfig, provider: OAuthProvider) {
  if (!providerConfigured(config, provider))
    throw new ApiError(503, 'OAuth provider is not configured', {
      code: 'oauth_provider_not_configured',
      details: { provider },
    });
  const nonce = randomBytes(32).toString('base64url');
  const ttl = Number(config.auth.oauthSettings.state_ttl_seconds);
  const state = await new SignJWT({
    sub: 'oauth-state',
    provider,
    nonce: randomBytes(16).toString('base64url'),
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
export type SignInIdentity = z.infer<typeof identitySchema>;

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

async function resolveAccount(
  db: Database,
  config: ServiceConfig,
  provider: OAuthProvider,
  identity: SignInIdentity,
) {
  // Stable subject and normalized address serialize linking. Sort before locks.
  for (const value of [
    `oauth:${provider}:${identity.sub}`,
    `auth.email:${identity.email}`,
  ].sort()) {
    const key = createHash('sha256').update(value).digest().readBigInt64BE(0);
    await sql`SELECT pg_advisory_xact_lock(${key})`.execute(db);
  }
  const linked = await db
    .selectFrom('user_identities')
    .selectAll()
    .where('provider', '=', provider)
    .where('subject', '=', identity.sub)
    .executeTakeFirst();
  let user: User;
  let event: 'auth.oauth_registered' | 'auth.oauth_linked' | null = null;
  if (linked) {
    user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', linked.user_id)
      .executeTakeFirstOrThrow();
  } else {
    if (!identity.email_verified) throw new SignInError('oauth_signin_email_unverified');
    const existing = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', identity.email)
      .executeTakeFirst();
    if (existing) {
      user = existing;
      event = 'auth.oauth_linked';
    } else {
      if (config.demo.enabled) throw new SignInError('oauth_signin_disabled');
      const now = new Date();
      const inserted = await db
        .insertInto('users')
        .values({
          id: randomUUID(),
          email: identity.email,
          hashed_password: null,
          role: 'user',
          is_active: true,
          session_version: 0,
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) => conflict.column('email').doNothing())
        .returningAll()
        .executeTakeFirst();
      user =
        inserted ??
        (await db
          .selectFrom('users')
          .selectAll()
          .where('email', '=', identity.email)
          .executeTakeFirstOrThrow());
      event = inserted ? 'auth.oauth_registered' : 'auth.oauth_linked';
    }
    const other = await db
      .selectFrom('user_identities')
      .select('subject')
      .where('provider', '=', provider)
      .where('user_id', '=', user.id)
      .executeTakeFirst();
    if (other && other.subject !== identity.sub)
      throw new SignInError('oauth_signin_state_invalid');
    if (!other)
      await db
        .insertInto('user_identities')
        .values({
          id: randomUUID(),
          user_id: user.id,
          provider,
          subject: identity.sub,
          email: identity.email,
          email_verified: identity.email_verified,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
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
  return { user: current, event };
}

export async function completeSignIn(
  db: Database,
  config: ServiceConfig,
  provider: OAuthProvider,
  code: string,
  state: string,
  nonce: string,
) {
  await verifyState(config, provider, state, nonce);
  const identity = await identify(config, provider, code);
  const resolved = await db.transaction().execute(async (trx) => {
    const account = await resolveAccount(trx, config, provider, identity);
    await recordSecurityEvent(trx, 'auth.google_login', account.user.id);
    return account;
  });
  const fields = { user_id: resolved.user.id, provider };
  if (resolved.event) logger.info(resolved.event, fields);
  logger.info('auth.oauth_login_success', fields);
  return issueSession(config, resolved.user);
}
