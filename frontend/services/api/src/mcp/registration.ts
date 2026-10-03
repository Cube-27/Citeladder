import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { mcpPolicy, type McpConfig } from './config.ts';
import { mintToken, OAuthError } from './oauth.ts';

const metadataSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(mcpPolicy.max_redirect_uris),
  client_name: z.string().max(mcpPolicy.max_client_name_length).optional(),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.literal('code')).default(['code']),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .default('client_secret_post'),
  scope: z.literal(mcpPolicy.read_scope).default(mcpPolicy.read_scope),
});
function validateRegistration(input: unknown) {
  const parsed = metadataSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.response_types.length !== 1 ||
    !parsed.data.grant_types.includes('authorization_code')
  )
    throw new OAuthError('invalid_client_metadata', 'Unsupported client metadata');
  for (const raw of parsed.data.redirect_uris) {
    let uri: URL;
    try {
      uri = new URL(raw);
    } catch {
      throw new OAuthError('invalid_redirect_uri', 'Invalid redirect URI');
    }
    if (
      raw.length > mcpPolicy.max_redirect_uri_length ||
      uri.username ||
      uri.password ||
      uri.hash ||
      uri.host.includes('*') ||
      !uri.hostname ||
      (uri.protocol !== 'https:' &&
        !(uri.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)))
    )
      throw new OAuthError(
        'invalid_redirect_uri',
        'Redirect URIs must use HTTPS or loopback HTTP without credentials or fragments',
      );
  }
  return parsed.data;
}
export class RegistrationLimit extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('Too many client registrations; retry later');
    this.retryAfter = retryAfter;
  }
}
export async function admitRegistration(
  db: Database,
  client: string,
  env: Record<string, string | undefined> = process.env,
) {
  const value = (name: keyof typeof policy.abuse) =>
    Number(resolveSettingSpec(policy.abuse[name], env));
  const budgets = [
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
  ] as const;
  await db.transaction().execute((trx) => admitBudgets(trx, budgets));
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

async function admitBudgets(
  trx: Database,
  budgets: readonly (readonly [string, string, string, number, number])[],
) {
  const now = new Date();
  for (const [kind, subject, operation, limit, window] of budgets) {
    const epoch = Math.floor(now.getTime() / 1000);
    const start = epoch - (epoch % window);
    const expires = new Date((start + window) * 1000);
    const charged = await trx
      .insertInto('usage_windows')
      .values({
        id: randomUUID(),
        subject_kind: kind,
        subject_hash: createHash('sha256').update(subject.trim().toLowerCase()).digest('hex'),
        operation,
        count: 1,
        window_started_at: new Date(start * 1000),
        expires_at: expires,
        created_at: now,
        updated_at: now,
      })
      .onConflict((c) =>
        c
          .constraint('uq_usage_window_subject_operation_start')
          .doUpdateSet({ count: sql`usage_windows.count + 1`, updated_at: now })
          .where(sql<boolean>`usage_windows.count + 1 <= ${limit}`),
      )
      .returning('count')
      .executeTakeFirst();
    if (!charged)
      throw new RegistrationLimit(
        Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / 1000)),
      );
  }
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
