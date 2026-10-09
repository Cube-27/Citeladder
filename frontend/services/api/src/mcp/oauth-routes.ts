import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { sessionUser } from '../auth/session.ts';
import { trustedClientIdentity } from '../auth/client-identity.ts';
import { configEnvironment, demoAccessExpired, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import { ApiError, onError } from '../errors.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { loadMcpConfig, mcpPolicy, type McpConfig } from './config.ts';
import { consentMessage, consentPage } from './consent-page.ts';
import {
  completeConsent,
  ConsentExpiredError,
  ConsentSelectionError,
  consentWorkspaces,
  consentCsrf,
  equalSecret,
  exchangeToken,
  mintToken,
  OAuthError,
  revokeToken,
  tokenHash,
} from './oauth.ts';
import {
  admitAuthorization,
  admitRegistration,
  isLoopback,
  registerClient,
} from './registration.ts';

async function registrationBody(request: Request): Promise<unknown> {
  const limit = mcpPolicy.registration_max_body_bytes;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limit))
    throw new ApiError(413, 'Request body too large');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new ApiError(413, 'Request body too large');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new OAuthError('invalid_client_metadata', 'Registration body must be UTF-8 JSON');
  }
}
/**
 * The registered redirect a request names, or the only one when it names none.
 * A loopback redirect matches on any port (RFC 8252 §7.3): native apps bind a
 * free port per sign-in. The URI actually requested is the one bound.
 */
function registeredRedirect(registered: string[], requested: string | null) {
  if (requested === null) {
    const [only, ...others] = registered;
    return only !== undefined && !others.length ? only : null;
  }
  if (registered.includes(requested)) return requested;
  const asked = URL.parse(requested);
  if (!asked || !isLoopback(asked)) return null;
  const portless = (uri: URL) => `${uri.protocol}//${uri.hostname}${uri.pathname}${uri.search}`;
  return registered.some((value) => {
    const uri = URL.parse(value);
    return !!uri && isLoopback(uri) && portless(uri) === portless(asked);
  })
    ? requested
    : null;
}
async function authenticatedClient(
  db: Database,
  mcp: McpConfig,
  c: Context<AppEnv>,
  form: URLSearchParams,
) {
  const basic = /^Basic +(\S+)$/iu.exec(c.req.header('authorization') ?? '');
  let clientId = form.get('client_id') ?? '';
  let secret = form.get('client_secret') ?? '';
  let method = secret ? 'client_secret_post' : 'none';
  if (basic) {
    let decoded: string;
    try {
      decoded = Buffer.from(basic[1] ?? '', 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon < 0) throw new Error('missing credential separator');
      clientId = decodeURIComponent(decoded.slice(0, colon));
      secret = decodeURIComponent(decoded.slice(colon + 1));
    } catch {
      throw new OAuthError('invalid_client', 'Invalid client authentication');
    }
    method = 'client_secret_basic';
  }
  const row = await db
    .selectFrom('mcp_oauth_clients')
    .selectAll()
    .where('client_id', '=', clientId)
    .executeTakeFirst();
  const metadata = record(row?.client_metadata);
  // A secret is a secret in the body or the header; a public client sends none.
  const registered = metadata.token_endpoint_auth_method === 'none' ? 'none' : 'secret';
  if (!row || registered !== (method === 'none' ? 'none' : 'secret'))
    throw new OAuthError('invalid_client', 'Invalid client authentication');
  if (row.client_secret_encrypted) {
    try {
      if (
        !equalSecret(
          createSecretCipher(mcp.encryptionKey).decrypt(row.client_secret_encrypted),
          secret,
        )
      )
        throw new Error('client secret mismatch');
    } catch {
      throw new OAuthError('invalid_client', 'Invalid client authentication');
    }
  }
  return { row, metadata };
}
export function registerOAuthRoutes(
  parentApp: Hono<AppEnv>,
  config: ServiceConfig,
  db: Database,
  mcp = loadMcpConfig(config),
) {
  const app = new Hono<AppEnv>();
  app.onError((error, c) => {
    if (error instanceof OAuthError) {
      if (error.error === 'invalid_client')
        c.header('www-authenticate', 'Basic realm="citeladder"');
      return c.json(
        { error: error.error, error_description: error.message },
        error.error === 'invalid_client' ? 401 : 400,
      );
    }
    if (error instanceof ApiError && error.status === 429) {
      for (const [name, value] of Object.entries(error.headers ?? {})) c.header(name, value);
      return c.json({ error: 'temporarily_unavailable', error_description: error.message }, 429);
    }
    return onError(error, c);
  });
  const resource = `${mcp.origin}/mcp`;
  // Protocol endpoints are guarded by the transport owner before dispatch. The
  // credential-free OAuth endpoints answer browser-hosted clients too.
  for (const path of ['/mcp/register', '/authorize', '/token', '/revoke', '/.well-known/*'])
    app.use(path, async (c, next) => {
      c.header('cache-control', 'no-store');
      c.header('access-control-allow-origin', '*');
      if (c.req.method === 'OPTIONS') {
        c.header('access-control-allow-methods', 'GET, POST, OPTIONS');
        c.header(
          'access-control-allow-headers',
          'authorization, content-type, mcp-protocol-version',
        );
        return c.body(null, 204);
      }
      await next();
    });
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer: mcp.origin,
      authorization_endpoint: `${mcp.origin}/authorize`,
      token_endpoint: `${mcp.origin}/token`,
      registration_endpoint: `${mcp.origin}/mcp/register`,
      revocation_endpoint: `${mcp.origin}/revoke`,
      scopes_supported: [mcpPolicy.read_scope],
      response_types_supported: ['code'],
      grant_types_supported: mcpPolicy.supported_grant_types,
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    }),
  );
  const protectedMetadata = (c: Context<AppEnv>) =>
    c.json({
      resource,
      authorization_servers: [mcp.origin],
      scopes_supported: [mcpPolicy.read_scope],
      bearer_methods_supported: ['header'],
      resource_name: 'CiteLadder',
      resource_documentation: mcpPolicy.documentation_url,
    });
  app.get('/.well-known/oauth-protected-resource/mcp', protectedMetadata);
  app.post('/mcp/register', async (c) => {
    const identity = trustedClientIdentity(c, config);
    await admitRegistration(db, identity, configEnvironment(config));
    return c.json(await registerClient(db, mcp, await registrationBody(c.req.raw)), 201);
  });
  app.get('/authorize', async (c) => {
    const url = new URL(c.req.url);
    const q = url.searchParams;
    if (
      Buffer.byteLength(url.search) > mcpPolicy.authorization_max_query_bytes ||
      Buffer.byteLength(q.get('state') ?? '') > mcpPolicy.authorization_max_state_bytes
    )
      throw new OAuthError('invalid_request', 'Authorization query is too large');
    const transaction = mintToken();
    // Once the redirect is proven, errors go back to the client (RFC 6749 §4.1.2.1).
    let callback = null as string | null;
    try {
      await db.transaction().execute(async (trx) => {
        const client = await trx
          .selectFrom('mcp_oauth_clients')
          .select(['client_id', 'client_metadata'])
          .where('client_id', '=', q.get('client_id') ?? '')
          .forUpdate()
          .executeTakeFirst();
        if (!client) throw new OAuthError('invalid_client', 'Client is not registered');
        const redirect = registeredRedirect(
          strings(record(client.client_metadata).redirect_uris),
          q.get('redirect_uri'),
        );
        if (!redirect) throw new OAuthError('invalid_request', 'Redirect URI is not registered');
        callback = redirect;
        if (
          q.get('response_type') !== 'code' ||
          q.get('code_challenge_method') !== 'S256' ||
          !/^[A-Za-z0-9_-]{43}$/u.test(q.get('code_challenge') ?? '')
        )
          throw new OAuthError('invalid_request', 'S256 PKCE is required');
        // Unknown extras such as offline_access are narrowed away (RFC 6749 §3.3).
        const requested = (q.get('scope') ?? mcpPolicy.read_scope).split(/\s+/u).filter(Boolean);
        if (requested.length && !requested.includes(mcpPolicy.read_scope))
          throw new OAuthError('invalid_scope', 'Unsupported scope');
        const scopes = [mcpPolicy.read_scope];
        if (q.has('resource') && q.get('resource')?.replace(/\/$/u, '') !== resource)
          throw new OAuthError('invalid_target', 'The requested resource is not this MCP server');
        const now = new Date();
        const outstanding = await trx
          .selectFrom('mcp_authorization_requests')
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .where('client_id', '=', client.client_id)
          .where('consumed_at', 'is', null)
          .where('expires_at', '>', now)
          .executeTakeFirstOrThrow();
        if (Number(outstanding.count) >= mcpPolicy.authorization_outstanding_limit)
          throw new ApiError(429, 'Too many pending authorization requests; retry later', {
            headers: { 'retry-after': String(Math.max(1, mcp.requestTtl)) },
          });
        await admitAuthorization(trx, client.client_id, trustedClientIdentity(c, config));
        await trx
          .insertInto('mcp_authorization_requests')
          .values({
            id: randomUUID(),
            transaction_hash: tokenHash(config, transaction),
            client_id: client.client_id,
            state: q.get('state') ?? '',
            scopes: JSON.stringify(scopes),
            code_challenge: q.get('code_challenge') ?? '',
            redirect_uri: redirect,
            redirect_uri_provided_explicitly: q.has('redirect_uri'),
            resource,
            expires_at: new Date(now.getTime() + mcp.requestTtl * 1000),
            consumed_at: null,
            created_at: now,
          })
          .execute();
      });
    } catch (error) {
      const code =
        error instanceof OAuthError
          ? error.error
          : error instanceof ApiError && error.status === 429
            ? 'temporarily_unavailable'
            : null;
      if (callback === null || code === null) throw error;
      const target = new URL(callback);
      target.searchParams.set('error', code);
      target.searchParams.set('error_description', (error as Error).message);
      if (q.get('state')) target.searchParams.set('state', q.get('state')!);
      target.searchParams.set('iss', mcp.origin);
      return c.redirect(target.href, 302);
    }
    return c.redirect(
      `${mcp.browserOrigin}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
      302,
    );
  });
  for (const path of ['/token', '/revoke'])
    app.post(path, async (c) => {
      const form = new URLSearchParams(await c.req.text());
      const { row, metadata } = await authenticatedClient(db, mcp, c, form);
      if (path === '/revoke') {
        const token = form.get('token');
        if (!token) throw new OAuthError('invalid_request', 'token is required');
        await revokeToken(db, config, row.client_id, token);
        return c.json({});
      }
      if (!strings(metadata.grant_types).includes(form.get('grant_type') ?? ''))
        throw new OAuthError('unsupported_grant_type', 'Grant type is not allowed for this client');
      if (form.has('resource') && form.get('resource')?.replace(/\/$/u, '') !== resource)
        throw new OAuthError('invalid_target', 'The requested resource is not this MCP server');
      return c.json(await exchangeToken(db, config, mcp, row.client_id, form));
    });
  app.use('/mcp/oauth/consent', async (c, next) => {
    if (demoAccessExpired(config)) return c.text('Demo access has expired.', 401);
    try {
      await sessionUser(config, db)(c, async () => {});
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const transaction =
        c.req.method === 'POST'
          ? (new URLSearchParams(await c.req.text()).get('transaction') ?? '')
          : (c.req.query('transaction') ?? '');
      return c.redirect(
        `${mcp.browserOrigin}/login?return_to=${encodeURIComponent(`/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`)}`,
        302,
      );
    }
    c.header('cache-control', 'no-store');
    await next();
  });
  const restart = {
    title: 'This approval link has expired',
    message:
      'Approval links last a few minutes and work once. Go back to your assistant and connect CiteLadder again.',
  };
  /** Render the approval form for a live transaction, or explain why it is gone. */
  async function renderConsent(c: Context<AppEnv>, transaction: string, error: string | null) {
    const row = await db
      .selectFrom('mcp_authorization_requests as r')
      .innerJoin('mcp_oauth_clients as cl', 'cl.client_id', 'r.client_id')
      .select(['r.redirect_uri', 'cl.client_metadata'])
      .where('r.transaction_hash', '=', tokenHash(config, transaction))
      .where('r.consumed_at', 'is', null)
      .where('r.expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) return c.html(consentMessage(restart), 403);
    const userId = c.get('user').id;
    const account = await db
      .selectFrom('users')
      .select('email')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    const redirect = new URL(row.redirect_uri);
    c.header('x-frame-options', 'DENY');
    c.header(
      'content-security-policy',
      `${mcpPolicy.consent_csp}; form-action 'self' ${redirect.origin}`,
    );
    // hono/html escapes every interpolated value; client metadata is untrusted.
    return c.html(
      consentPage({
        clientName: scalarText(record(row.client_metadata).client_name) || 'MCP client',
        redirectHost: redirect.host,
        redirectUri: row.redirect_uri,
        email: account.email,
        transaction,
        csrf: consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction),
        workspaces: await consentWorkspaces(db, userId),
        error,
        appOrigin: mcp.browserOrigin,
        websiteOrigin: mcp.origin,
      }),
      error ? 400 : 200,
    );
  }
  const invalidTransaction = (value: string) => !value || value.length > 256;
  app.get('/mcp/oauth/consent', async (c) => {
    const transaction = c.req.query('transaction') ?? '';
    if (invalidTransaction(transaction)) return c.html(consentMessage(restart), 400);
    return renderConsent(c, transaction, null);
  });
  app.post('/mcp/oauth/consent', async (c) => {
    const form = new URLSearchParams(await c.req.text());
    const transaction = form.get('transaction') ?? '';
    if (invalidTransaction(transaction)) return c.html(consentMessage(restart), 400);
    const back = {
      href: `${mcp.browserOrigin}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
      label: 'Back to the approval page',
    };
    if (
      !equalSecret(
        consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction),
        form.get('csrf_token') ?? '',
      )
    )
      return c.html(
        consentMessage({
          title: 'Your session changed',
          message: 'Open the approval page again to continue as the account you are signed in to.',
          action: back,
        }),
        403,
      );
    const decision = form.get('decision');
    if (decision !== 'approve' && decision !== 'deny')
      return c.html(
        consentMessage({
          title: 'Choose Approve or Deny',
          message: 'The connection needs an explicit decision.',
          action: back,
        }),
        403,
      );
    try {
      return c.redirect(
        await completeConsent(
          db,
          config,
          mcp,
          transaction,
          c.get('user').id,
          decision === 'deny'
            ? null
            : {
                selected: form.getAll('workspace_id'),
                acceptTerms: form.get('accept_terms') === 'yes',
              },
        ),
        303,
      );
    } catch (error) {
      if (error instanceof ConsentSelectionError)
        return renderConsent(c, transaction, error.message);
      if (error instanceof OAuthError)
        return c.html(
          error instanceof ConsentExpiredError
            ? consentMessage(restart)
            : consentMessage({ title: 'Access cannot be approved', message: error.message }),
          403,
        );
      throw error;
    }
  });
  parentApp.route('/', app);
}
