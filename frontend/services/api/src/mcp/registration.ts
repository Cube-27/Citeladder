import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { budget, spendBudget, type Budget } from '../abuse/usage.ts';
import { MCP_AUTHORIZE_SUBJECT, MCP_REGISTER_SUBJECT } from '../config/abuse.ts';
import type { SettingSource } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { grantableScopes, mcpPolicy, type McpConfig } from './config.ts';
import { mintToken, OAuthError } from './oauth.ts';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const metadataSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(mcpPolicy.max_redirect_uris),
  client_name: z.string().max(mcpPolicy.max_client_name_length).optional(),
  grant_types: z.array(z.string()).default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.string()).default(['code']),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .default('client_secret_basic'),
  scope: z.string().optional(),
});

export function isLoopback(uri: URL) {
  return uri.protocol === 'http:' && LOOPBACK.has(uri.hostname);
}
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
    scope: grantableScopes(parsed.data.scope).join(' '),
  };
}

export type RegistrationAdmission = (trx: Database) => Promise<void>;

export function admitRegistration(network: string, settings: SettingSource): RegistrationAdmission {
  return (trx) =>
    admitBudgets(trx, [
      [budget('mcp_register_burst', settings), network],
      [budget('mcp_register_client', settings), network],
      [budget('mcp_register_global', settings), MCP_REGISTER_SUBJECT],
    ]);
}

export function admitAuthorization(
  db: Database,
  {
    clientId,
    source,
    approved,
    settings,
  }: { clientId: string; source: string; approved: boolean; settings: SettingSource },
) {
  return admitBudgets(db, [
    [budget('mcp_authorize_client'), clientId],
    [budget('mcp_authorize_source'), source],
    approved
      ? [budget('mcp_authorize_global'), MCP_AUTHORIZE_SUBJECT]
      : [budget('mcp_authorize_unapproved_network', settings), source],
  ]);
}

export function admitToolCall(db: Database, grantId: string, userId: string) {
  return admitBudgets(db, [
    [budget('mcp_tool_call_grant'), grantId],
    [budget('mcp_tool_call_user'), userId],
  ]);
}

export function admitWriteCall(db: Database, grantId: string) {
  return admitBudgets(db, [[budget('mcp_write_call_grant'), grantId]]);
}

async function admitBudgets(db: Database, budgets: readonly (readonly [Budget, string])[]) {
  for (const [limit, subject] of budgets) await spendBudget(db, limit, subject); // NOSONAR
}

export async function registerClient(
  db: Database,
  mcp: McpConfig,
  input: unknown,
  admit: RegistrationAdmission,
) {
  if (!mcp.enabled) throw new OAuthError('invalid_client_metadata', 'MCP access is not enabled');
  const metadata = validateRegistration(input);
  const clientId = randomUUID();
  const secret = metadata.token_endpoint_auth_method === 'none' ? null : mintToken();
  await db.transaction().execute(async (trx) => {
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
    await admit(trx);
  });
  return {
    ...metadata,
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}
