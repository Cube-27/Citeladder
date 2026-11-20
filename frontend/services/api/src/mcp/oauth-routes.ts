import { randomUUID } from 'node:crypto';
import { Hono, type Context, type Next } from 'hono';
import { trustedClientNetwork } from '../auth/client-identity.ts';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import { ApiError, onError } from '../errors.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { grantableScopes, loadMcpConfig, mcpPolicy, type McpConfig } from './config.ts';
import {
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
import { registerConsentRoutes } from './oauth-consent-routes.ts';

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
        const next = await reader.read(); // NOSONAR -- A stream yields chunks in order; the size cap stops early.
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) break;
        chunks.push(next.value);
      }
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'Request body too large');
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
function authorizationErrorCode(error: unknown) {
  if (error instanceof OAuthError) return error.error;
  return error instanceof ApiError && error.status === 429 ? 'temporarily_unavailable' : null;
}
function oauthError(error: Error, c: Context<AppEnv>) {
  if (error instanceof OAuthError) {
    if (error.error === 'invalid_client') c.header('www-authenticate', 'Basic realm="citeladder"');
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
}
async function credentialFreeHeaders(c: Context<AppEnv>, next: Next) {
  c.header('cache-control', 'no-store');
  c.header('access-control-allow-origin', '*');
  if (c.req.method === 'OPTIONS') {
    c.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    c.header('access-control-allow-headers', 'authorization, content-type, mcp-protocol-version');
    return c.body(null, 204);
  }
  await next();
}
/** What the OAuth route groups share: configuration, database, MCP settings and resource URL. */
type OAuthRoutes = { config: ServiceConfig; db: Database; mcp: McpConfig; resource: string };
function registerMetadataRoutes(
  app: Hono<AppEnv>,
  { mcp, resource }: Pick<OAuthRoutes, 'mcp' | 'resource'>,
) {
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer: mcp.origin,
      authorization_endpoint: `${mcp.origin}/authorize`,
      token_endpoint: `${mcp.origin}/token`,
      registration_endpoint: `${mcp.origin}/mcp/register`,
      revocation_endpoint: `${mcp.origin}/revoke`,
      scopes_supported: mcpPolicy.scopes_supported,
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
      scopes_supported: mcpPolicy.scopes_supported,
      bearer_methods_supported: ['header'],
      resource_name: 'CiteLadder',
      resource_documentation: mcpPolicy.documentation_url,
    });
  app.get('/.well-known/oauth-protected-resource/mcp', protectedMetadata);
}
/** The client an authorization request names, locked for the request's admission. */
async function authorizationClient(trx: Database, q: URLSearchParams) {
  const client = await trx
    .selectFrom('mcp_oauth_clients')
    .select(['client_id', 'client_metadata'])
    .where('client_id', '=', q.get('client_id') ?? '')
    .forUpdate()
    .executeTakeFirst();
  if (!client)
    throw new OAuthError(
      'invalid_client',
      'This assistant’s CiteLadder registration is no longer valid. Remove CiteLadder from your assistant and add it again.',
    );
  return client;
}
/** The scopes an authorization request may be granted, once PKCE, scope and resource check out. */
function authorizationScopes({
  q,
  clientMetadata,
  resource,
}: {
  q: URLSearchParams;
  clientMetadata: unknown;
  resource: string;
}) {
  if (
    q.get('response_type') !== 'code' ||
    q.get('code_challenge_method') !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(q.get('code_challenge') ?? '')
  )
    throw new OAuthError('invalid_request', 'S256 PKCE is required');
  // Write is only offered here; the person decides on the consent page.
  const requested = (q.get('scope') ?? '').split(/\s+/u).filter(Boolean);
  if (requested.length && !requested.includes(mcpPolicy.read_scope))
    throw new OAuthError('invalid_scope', 'Unsupported scope');
  // Never more than the client registered for.
  const registered = grantableScopes(scalarText(record(clientMetadata).scope) || null);
  const scopes = grantableScopes(q.get('scope')).filter((scope) => registered.includes(scope));
  if (q.has('resource') && q.get('resource')?.replace(/\/$/u, '') !== resource)
    throw new OAuthError('invalid_target', 'The requested resource is not this MCP server');
  return scopes;
}
/** Cap a client's pending requests, then admit this one by network and prior approval. */
async function admitAuthorizationRequest(
  trx: Database,
  {
    c,
    config,
    mcp,
    clientId,
    now,
  }: { c: Context<AppEnv>; config: ServiceConfig; mcp: McpConfig; clientId: string; now: Date },
) {
  const outstanding = await trx
    .selectFrom('mcp_authorization_requests')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('client_id', '=', clientId)
    .where('consumed_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirstOrThrow();
  if (Number(outstanding.count) >= mcpPolicy.authorization_outstanding_limit)
    throw new ApiError(429, 'Too many pending authorization requests; retry later', {
      headers: { 'retry-after': String(Math.max(1, mcp.requestTtl)) },
    });
  const approved = await trx
    .selectFrom('mcp_oauth_grants')
    .select('id')
    .where('client_id', '=', clientId)
    .limit(1)
    .executeTakeFirst();
  await admitAuthorization(trx, {
    clientId,
    source: trustedClientNetwork(c, config),
    approved: approved !== undefined,
    settings: config.settings,
  });
}
function registerAuthorizeRoute(app: Hono<AppEnv>, { config, db, mcp, resource }: OAuthRoutes) {
  app.get('/authorize', async (c) => {
    const url = new URL(c.req.url);
    const q = url.searchParams;
    const transaction = mintToken();
    // Once the redirect is proven, errors go back to the client (RFC 6749 §4.1.2.1).
    let callback = null as string | null;
    try {
      if (
        Buffer.byteLength(url.search) > mcpPolicy.authorization_max_query_bytes ||
        Buffer.byteLength(q.get('state') ?? '') > mcpPolicy.authorization_max_state_bytes
      )
        throw new OAuthError('invalid_request', 'Authorization query is too large');
      await db.transaction().execute(async (trx) => {
        const client = await authorizationClient(trx, q);
        const redirect = registeredRedirect(
          strings(record(client.client_metadata).redirect_uris),
          q.get('redirect_uri'),
        );
        if (!redirect) throw new OAuthError('invalid_request', 'Redirect URI is not registered');
        callback = redirect;
        const scopes = authorizationScopes({
          q,
          clientMetadata: client.client_metadata,
          resource,
        });
        const now = new Date();
        await admitAuthorizationRequest(trx, { c, config, mcp, clientId: client.client_id, now });
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
      // Before the redirect is proven the person is told here (RFC 6749 §4.1.2.1).
      // A page, not a 401: a Basic challenge would open the browser's password box.
      if (callback === null && error instanceof OAuthError) return c.text(error.message, 400);
      const code = authorizationErrorCode(error);
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
}
function registerTokenRoutes(app: Hono<AppEnv>, { config, db, mcp, resource }: OAuthRoutes) {
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
}
export function registerOAuthRoutes(
  parentApp: Hono<AppEnv>,
  config: ServiceConfig,
  db: Database,
  mcp = loadMcpConfig(config),
) {
  const app = new Hono<AppEnv>();
  app.onError(oauthError);
  const resource = `${mcp.origin}/mcp`;
  // Protocol endpoints are guarded by the transport owner before dispatch. The
  // credential-free OAuth endpoints answer browser-hosted clients too.
  for (const path of ['/mcp/register', '/authorize', '/token', '/revoke', '/.well-known/*'])
    app.use(path, credentialFreeHeaders);
  const routes = { config, db, mcp, resource };
  registerMetadataRoutes(app, routes);
  app.post('/mcp/register', async (c) => {
    const body = await registrationBody(c.req.raw);
    const admit = admitRegistration(
      trustedClientNetwork(c, config, 'registration'),
      config.settings,
    );
    return c.json(await registerClient(db, mcp, body, admit), 201);
  });
  registerAuthorizeRoute(app, routes);
  registerTokenRoutes(app, routes);
  registerConsentRoutes(app, routes);
  parentApp.route('/', app);
}
