import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { mcpPolicy, type McpConfig } from './config.ts';
import { mintToken, OAuthError } from './oauth.ts';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
// Unsupported extras (an extra grant, `offline_access`) are narrowed away, not refused.
const metadataSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(mcpPolicy.max_redirect_uris),
  client_name: z.string().max(mcpPolicy.max_client_name_length).optional(),
  grant_types: z.array(z.string()).default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.string()).default(['code']),
  // RFC 7591 §2: an omitted method is client_secret_basic.
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .default('client_secret_basic'),
  scope: z.string().optional(),
});

export function isLoopback(uri: URL) {
  return uri.protocol === 'http:' && LOOPBACK.includes(uri.hostname);
}
/** HTTPS, loopback HTTP, or a native app's private-use scheme. */
function acceptedRedirect(raw: string, uri: URL) {
  const scheme = uri.protocol.slice(0, -1);
  if (raw.length > mcpPolicy.max_redirect_uri_length || uri.username || uri.password || uri.hash)
    return false;
  if (uri.protocol === 'https:') return !!uri.hostname && !uri.host.includes('*');
  if (uri.protocol === 'http:') return isLoopback(uri);
  return (
    /^[a-z][a-z0-9+.-]*$/u.test(scheme) &&
    !mcpPolicy.refused_redirect_schemes.includes(scheme) &&
    (scheme.includes('.') || mcpPolicy.native_redirect_schemes.includes(scheme))
  );
}
function validateRegistration(input: unknown) {
  const parsed = metadataSchema.safeParse(input);
  if (
    !parsed.success ||
    !parsed.data.response_types.includes('code') ||
    !parsed.data.grant_types.includes('authorization_code')
  )
    throw new OAuthError('invalid_client_metadata', 'Unsupported client metadata');
  for (const raw of parsed.data.redirect_uris) {
    const uri = URL.parse(raw);
    if (!uri || !acceptedRedirect(raw, uri))
      throw new OAuthError(
        'invalid_redirect_uri',
        'Redirect URIs must be HTTPS, loopback HTTP or a native app scheme, without credentials or fragments',
      );
  }
  return {
    ...parsed.data,
    grant_types: mcpPolicy.supported_grant_types.filter((grant) =>
      parsed.data.grant_types.includes(grant),
    ),
    response_types: ['code'],
    scope: mcpPolicy.read_scope,
  };
}

export function admitRegistration(
  db: Database,
  client: string,
  env: Record<string, string | undefined> = process.env,
) {
  const value = (name: keyof typeof policy.abuse) =>
    Number(resolveSettingSpec(policy.abuse[name], env));
  return admitBudgets(db, [
    [
      'client',
      client,
      'mcp.register.burst',
      value('mcp_register_burst_limit'),
      value('mcp_register_burst_window_seconds'),
    ],
    [
      'client',
      client,
      'mcp.register.client',
      value('mcp_register_client_limit'),
      value('mcp_register_client_window_seconds'),
    ],
    [
      'global',
      'mcp.register',
      'mcp.register.global',
      value('mcp_register_global_limit'),
      value('mcp_register_global_window_seconds'),
    ],
  ]);
}

export function admitAuthorization(db: Database, clientId: string, source: string) {
  const window = mcpPolicy.authorization_window_seconds;
  return admitBudgets(db, [
    ['client', clientId, 'mcp.authorize.client', mcpPolicy.authorization_client_limit, window],
    ['client', source, 'mcp.authorize.source', mcpPolicy.authorization_source_limit, window],
    [
      'global',
      'mcp.authorize',
      'mcp.authorize.global',
      mcpPolicy.authorization_global_limit,
      window,
    ],
  ]);
}

/** One budget per grant and per account; a client over its own budget spends no other. */
export function admitToolCall(db: Database, grantId: string, userId: string) {
  const window = mcpPolicy.tool_call_window_seconds;
  return admitBudgets(db, [
    ['mcp_grant', grantId, 'mcp.tool_call.grant', mcpPolicy.tool_call_grant_limit, window],
    ['user', userId, 'mcp.tool_call.user', mcpPolicy.tool_call_user_limit, window],
  ]);
}

async function admitBudgets(
  db: Database,
  budgets: readonly (readonly [
    Parameters<typeof enforceSubjectRequest>[1],
    string,
    string,
    number,
    number,
  ])[],
) {
  for (const [kind, subject, operation, limit, windowSeconds] of budgets)
    await enforceSubjectRequest(db, kind, subject, { operation, limit, windowSeconds });
}

export async function registerClient(db: Database, mcp: McpConfig, input: unknown) {
  if (!mcp.enabled) throw new OAuthError('invalid_client_metadata', 'MCP access is not enabled');
  const metadata = validateRegistration(input);
  const clientId = randomUUID();
  const secret = metadata.token_endpoint_auth_method === 'none' ? null : mintToken();
  await db.transaction().execute(async (trx) => {
    // Lock candidates before deletion; FK checks serialize racing new flows.
    const criteria = sql<boolean>`NOT EXISTS (SELECT 1 FROM mcp_oauth_grants g WHERE g.client_id = mcp_oauth_clients.client_id) AND NOT EXISTS (SELECT 1 FROM mcp_authorization_requests r WHERE r.client_id = mcp_oauth_clients.client_id AND r.expires_at > now()) AND NOT EXISTS (SELECT 1 FROM mcp_authorization_codes c WHERE c.client_id = mcp_oauth_clients.client_id AND c.expires_at > now())`;
    const candidates = await trx
      .selectFrom('mcp_oauth_clients')
      .select('id')
      .where('created_at', '<', new Date(Date.now() - mcp.unusedClientTtl * 1000))
      .where(criteria)
      .orderBy('created_at')
      .limit(mcpPolicy.unused_client_prune_batch)
      .forUpdate()
      .skipLocked()
      .execute();
    if (candidates.length)
      await trx
        .deleteFrom('mcp_oauth_clients')
        .where(
          'id',
          'in',
          candidates.map((c) => c.id),
        )
        .where(criteria)
        .execute();
    await trx
      .insertInto('mcp_oauth_clients')
      .values({
        id: randomUUID(),
        client_id: clientId,
        client_secret_encrypted: secret
          ? createSecretCipher(mcp.encryptionKey).encrypt(secret)
          : '',
        client_metadata: JSON.stringify(metadata),
        created_at: new Date(),
      })
      .execute();
  });
  return {
    ...metadata,
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}
