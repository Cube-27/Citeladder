import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { sessionUser } from '../auth/session.ts';
import { trustedClientIdentity } from '../auth/client-identity.ts';
import {
  configEnvironment,
  demoAccessExpired,
  type ServiceConfig,
} from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError, onError } from '../errors.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { loadMcpConfig, mcpPolicy, type McpConfig } from './config.ts';
import {
  completeConsent,
  consentableWorkspaces,
  consentCsrf,
  equalSecret,
  exchangeToken,
  jsonStrings,
  mintToken,
  OAuthError,
  revokeToken,
  tokenHash,
} from './oauth.ts';
import { admitRegistration, registerClient, RegistrationLimit } from './registration.ts';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
async function authenticatedClient(
  db: Database,
  mcp: McpConfig,
  c: Context<AppEnv>,
  form: URLSearchParams,
) {
  const basic = /^Basic\s+(.+)$/iu.exec(c.req.header('authorization') ?? '');
  let clientId = form.get('client_id') ?? '';
  let secret = form.get('client_secret') ?? '';
  let method = secret ? 'client_secret_post' : 'none';
  if (basic) {
    let decoded: string;
    try {
      decoded = Buffer.from(basic[1] ?? '', 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon < 0) throw new Error();
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
  const metadata = row?.client_metadata as Record<string, unknown> | undefined;
  if (!row || (metadata?.token_endpoint_auth_method ?? 'client_secret_post') !== method)
    throw new OAuthError('invalid_client', 'Invalid client authentication');
  if (row.client_secret_encrypted) {
    try {
      if (
        !equalSecret(
          createSecretCipher(mcp.encryptionKey).decrypt(row.client_secret_encrypted),
          secret,
        )
      )
        throw new Error();
    } catch {
      throw new OAuthError('invalid_client', 'Invalid client authentication');
    }
  }
  return { row, metadata: metadata ?? {} };
}
export function registerOAuthRoutes(
  parentApp: Hono<AppEnv>,
  config: ServiceConfig,
  db: Database,
  mcp = loadMcpConfig(config),
) {
  const app = new Hono<AppEnv>();
  app.onError((error, c) => {
    if (error instanceof OAuthError)
      return c.json(
        { error: error.error, error_description: error.message },
        error.error === 'invalid_client' ? 401 : 400,
      );
    if (error instanceof RegistrationLimit) {
      c.header('retry-after', String(error.retryAfter));
      return c.json({ error: 'temporarily_unavailable', error_description: error.message }, 429);
    }
    return onError(error, c);
  });
  const resource = `${mcp.origin}/mcp`;
  // Protocol endpoints are guarded by the transport owner before dispatch.
  for (const path of ['/mcp/register', '/authorize', '/token', '/revoke'])
    app.use(path, async (c, next) => {
      c.header('cache-control', 'no-store');
      c.header('access-control-allow-origin', '*');
      try {
        await next();
      } catch (error) {
        if (error instanceof OAuthError)
          return c.json(
            { error: error.error, error_description: error.message },
            error.error === 'invalid_client' ? 401 : 400,
          );
        if (error instanceof RegistrationLimit) {
          c.header('retry-after', String(error.retryAfter));
          return c.json(
            { error: 'temporarily_unavailable', error_description: error.message },
            429,
          );
        }
        throw error;
      }
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
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
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
  app.options('/mcp/register', (c) => {
    c.header('access-control-allow-origin', '*');
    c.header('access-control-allow-methods', 'POST, OPTIONS');
    c.header('access-control-allow-headers', 'content-type');
    return c.body(null, 204);
  });
  app.post('/mcp/register', async (c) => {
    const identity = trustedClientIdentity(c, config);
    await admitRegistration(db, identity, configEnvironment(config));
    return c.json(await registerClient(db, mcp, await registrationBody(c.req.raw)), 201);
  });
  app.get('/authorize', async (c) => {
    const q = new URL(c.req.url).searchParams;
    const transaction = mintToken();
    await db.transaction().execute(async (trx) => {
      const client = await trx
        .selectFrom('mcp_oauth_clients')
        .select(['client_id', 'client_metadata'])
        .where('client_id', '=', q.get('client_id') ?? '')
        .forKeyShare()
        .executeTakeFirst();
      if (!client) throw new OAuthError('invalid_client', 'Client is not registered');
      const redirects = jsonStrings(
        (client.client_metadata as Record<string, unknown>).redirect_uris,
      );
      const redirect = q.get('redirect_uri') ?? (redirects.length === 1 ? redirects[0] : undefined);
      if (!redirect || !redirects.includes(redirect))
        throw new OAuthError('invalid_request', 'Redirect URI is not registered');
      if (
        q.get('response_type') !== 'code' ||
        q.get('code_challenge_method') !== 'S256' ||
        !/^[A-Za-z0-9_-]{43}$/u.test(q.get('code_challenge') ?? '')
      )
        throw new OAuthError('invalid_request', 'S256 PKCE is required');
      const scopes = (q.get('scope') ?? mcpPolicy.read_scope).split(/\s+/u).filter(Boolean);
      if (!scopes.length || scopes.some((scope) => scope !== mcpPolicy.read_scope))
        throw new OAuthError('invalid_scope', 'Unsupported scope');
      if (q.has('resource') && q.get('resource')?.replace(/\/$/u, '') !== resource)
        throw new OAuthError('invalid_target', 'The requested resource is not this MCP server');
      const now = new Date();
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
    return c.redirect(
      `${mcp.browserOrigin}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
      302,
    );
  });
  for (const path of ['/token', '/revoke'])
    app.post(path, async (c) => {
      const form = new URLSearchParams(await c.req.text());
      const { row } = await authenticatedClient(db, mcp, c, form);
      if (path === '/revoke') {
        await revokeToken(db, config, row.client_id, form.get('token') ?? '');
        return c.json({});
      }
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
  app.get('/mcp/oauth/consent', async (c) => {
    const transaction = c.req.query('transaction') ?? '';
    if (!transaction || transaction.length > 256)
      return c.text('Invalid MCP authorization request.', 400);
    const row = await db
      .selectFrom('mcp_authorization_requests as r')
      .innerJoin('mcp_oauth_clients as cl', 'cl.client_id', 'r.client_id')
      .select(['r.redirect_uri', 'r.scopes', 'cl.client_metadata'])
      .where('r.transaction_hash', '=', tokenHash(config, transaction))
      .where('r.consumed_at', 'is', null)
      .where('r.expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) return c.text('Authorization request is invalid or expired', 403);
    const metadata = row.client_metadata as Record<string, unknown>;
    const choices = (await consentableWorkspaces(db, c.get('user').id))
      .map(
        (w) =>
          `<p><label><input type="checkbox" name="workspace_id" value="${escapeHtml(w.id)}"> ${escapeHtml(w.name)}</label></p>`,
      )
      .join('');
    c.header('x-frame-options', 'DENY');
    c.header(
      'content-security-policy',
      `${mcpPolicy.consent_csp}; form-action 'self' ${new URL(row.redirect_uri).origin}`,
    );
    const csrf = consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction);
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Authorize MCP access</title></head><body><main><h1>Authorize MCP access</h1><p><strong>${escapeHtml(String(metadata.client_name ?? 'MCP client'))}</strong> <span>Unverified application</span></p><p>This name was supplied by the application and has not been verified by CiteLadder. Approve only if you started this connection and recognize <strong>${escapeHtml(new URL(row.redirect_uri).host)}</strong>.</p><p>Read-only access to the workspaces you select. Joining another workspace does not grant this connection access. Losing membership removes access.</p><p>Sends you back to <code>${escapeHtml(row.redirect_uri)}</code></p><form method="post" action="/mcp/oauth/consent"><input type="hidden" name="transaction" value="${escapeHtml(transaction)}"><input type="hidden" name="csrf_token" value="${csrf}"><fieldset><legend>Workspaces to authorize</legend>${choices}</fieldset><button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Deny access</button></form></main></body></html>`,
    );
  });
  app.post('/mcp/oauth/consent', async (c) => {
    const form = new URLSearchParams(await c.req.text());
    const transaction = form.get('transaction') ?? '';
    if (!transaction || transaction.length > 256)
      return c.text('Invalid MCP authorization request.', 400);
    if (
      !equalSecret(
        consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction),
        form.get('csrf_token') ?? '',
      )
    )
      return c.text('Invalid consent token.', 403);
    const decision = form.get('decision');
    if (decision !== 'approve' && decision !== 'deny')
      return c.text('Explicit consent decision required.', 403);
    try {
      return c.redirect(
        await completeConsent(
          db,
          config,
          mcp,
          transaction,
          c.get('user').id,
          decision === 'deny' ? null : form.getAll('workspace_id'),
        ),
        303,
      );
    } catch (error) {
      if (error instanceof OAuthError) return c.text(error.message, 403);
      throw error;
    }
  });
  parentApp.route('/', app);
}
