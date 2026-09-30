import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { strings } from '../db/json.ts';
import { READ_ROLES } from './data.ts';
import { accountAllowed, loadMcpConfig, type McpConfig } from './config.ts';
import type { McpPrincipal } from './types.ts';

export class OAuthError extends Error {
  readonly error: string;
  constructor(error: string, description: string) {
    super(description);
    this.error = error;
  }
}
export const mintToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const tokenHash = (config: ServiceConfig, value: string) =>
  createHmac('sha256', config.session.secretKey).update(value).digest('hex');
export function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const consentCsrf = (config: ServiceConfig, session: string, transaction: string) =>
  tokenHash(config, `mcp-consent:${session}:${transaction}`);
const deadline = (seconds: number) => new Date(Date.now() + seconds * 1000);
export async function authenticateMcp(
  db: Database,
  config: ServiceConfig,
  request: Request,
  mcp = loadMcpConfig(config),
): Promise<McpPrincipal | null> {
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!bearer) return null;
  const digest = tokenHash(config, bearer);
  const row = await db
    .selectFrom('mcp_oauth_grants as g')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .select([
      'g.id',
      'g.user_id',
      'g.workspace_ids',
      'g.resource',
      'g.scopes',
      'u.email',
      'u.is_active',
    ])
    .where('g.access_token_hash', '=', digest)
    .where('g.revoked_at', 'is', null)
    .where('g.access_expires_at', '>', new Date())
    .executeTakeFirst();
  if (
    !row ||
    !row.is_active ||
    !accountAllowed(config, mcp, row.email) ||
    row.resource !== `${mcp.origin}/mcp` ||
    !strings(row.scopes).includes(policy.mcp.constants.read_scope)
  )
    return null;
  const workspaceIds = strings(row.workspace_ids);
  return workspaceIds.length
    ? { userId: row.user_id, grantId: row.id, workspaceIds, tokenHash: digest }
    : null;
}
export async function consentableWorkspaces(db: Database, userId: string) {
  return db
    .selectFrom('workspaces as w')
    .innerJoin('workspace_members as m', 'm.workspace_id', 'w.id')
    .select(['w.id', 'w.name'])
    .where('m.user_id', '=', userId)
    .where('m.role', 'in', READ_ROLES)
    .where('w.is_system', '=', false)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('policy_acceptances as p')
          .select('p.id')
          .whereRef('p.workspace_id', '=', 'w.id')
          .where('p.actor_id', '=', userId)
          .where('p.terms_revision', '=', policy.mcp.terms_revision),
      ),
    )
    .orderBy('w.name')
    .orderBy('w.id')
    .execute();
}
export async function completeConsent(
  db: Database,
  config: ServiceConfig,
  mcp: McpConfig,
  transaction: string,
  userId: string,
  selected: string[] | null,
): Promise<string> {
  return db.transaction().execute(async (trx) => {
    const request = await trx
      .selectFrom('mcp_authorization_requests')
      .selectAll()
      .where('transaction_hash', '=', tokenHash(config, transaction))
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .forUpdate()
      .executeTakeFirst();
    if (!request)
      throw new OAuthError('access_denied', 'Authorization request is invalid or expired');
    const destination = new URL(request.redirect_uri);
    if (request.state) destination.searchParams.set('state', request.state);
    if (selected === null) destination.searchParams.set('error', 'access_denied');
    else {
      const user = await trx
        .selectFrom('users')
        .select(['email', 'is_active'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!user?.is_active || !accountAllowed(config, mcp, user.email))
        throw new OAuthError('access_denied', 'This account is not enabled for MCP access');
      const unique = [...new Set(selected)].sort();
      const allowed = new Set((await consentableWorkspaces(trx, userId)).map((w) => w.id));
      if (!unique.length || unique.some((id) => !allowed.has(id)))
        throw new OAuthError('access_denied', 'Select at least one currently accessible workspace');
      const code = mintToken();
      await trx
        .insertInto('mcp_authorization_codes')
        .values({
          id: randomUUID(),
          workspace_ids: JSON.stringify(unique),
          code_hash: tokenHash(config, code),
          client_id: request.client_id,
          user_id: userId,
          scopes: JSON.stringify(request.scopes),
          code_challenge: request.code_challenge,
          redirect_uri: request.redirect_uri,
          redirect_uri_provided_explicitly: request.redirect_uri_provided_explicitly,
          resource: request.resource,
          expires_at: deadline(mcp.codeTtl),
          consumed_at: null,
          created_at: new Date(),
        })
        .execute();
      for (const id of unique) await recordSecurityEvent(trx, 'mcp.consent', userId, id);
      destination.searchParams.set('code', code);
    }
    await trx
      .updateTable('mcp_authorization_requests')
      .set({ consumed_at: new Date() })
      .where('id', '=', request.id)
      .execute();
    return destination.href;
  });
}
export async function exchangeToken(
  db: Database,
  config: ServiceConfig,
  mcp: McpConfig,
  clientId: string,
  form: URLSearchParams,
) {
  return db.transaction().execute(async (trx) => {
    const access = mintToken();
    const refresh = mintToken(48);
    const now = new Date();
    let scopes: string[];
    if (form.get('grant_type') === 'authorization_code') {
      const row = await trx
        .selectFrom('mcp_authorization_codes')
        .selectAll()
        .where('code_hash', '=', tokenHash(config, form.get('code') ?? ''))
        .where('client_id', '=', clientId)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', now)
        .forUpdate()
        .executeTakeFirst();
      const verifier = form.get('code_verifier') ?? '';
      if (
        !row ||
        !/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier) ||
        !equalSecret(
          createHash('sha256').update(verifier).digest('base64url'),
          row.code_challenge,
        ) ||
        (row.redirect_uri_provided_explicitly && form.get('redirect_uri') !== row.redirect_uri) ||
        (form.has('redirect_uri') && form.get('redirect_uri') !== row.redirect_uri) ||
        !strings(row.workspace_ids).length
      )
        throw new OAuthError('invalid_grant', 'Code is invalid');
      const user = await trx
        .selectFrom('users')
        .select(['email', 'is_active'])
        .where('id', '=', row.user_id)
        .executeTakeFirst();
      if (
        !user?.is_active ||
        !accountAllowed(config, mcp, user.email) ||
        row.resource !== `${mcp.origin}/mcp` ||
        !strings(row.scopes).includes(policy.mcp.constants.read_scope)
      )
        throw new OAuthError('invalid_grant', 'Code is invalid');
      scopes = strings(row.scopes);
      await trx
        .updateTable('mcp_authorization_codes')
        .set({ consumed_at: now })
        .where('id', '=', row.id)
        .execute();
      await trx
        .insertInto('mcp_oauth_grants')
        .values({
          id: randomUUID(),
          client_id: clientId,
          user_id: row.user_id,
          workspace_ids: JSON.stringify(row.workspace_ids),
          scopes: JSON.stringify(scopes),
          resource: row.resource,
          access_token_hash: tokenHash(config, access),
          refresh_token_hash: tokenHash(config, refresh),
          access_expires_at: deadline(mcp.accessTtl),
          refresh_expires_at: deadline(mcp.refreshTtl),
          revoked_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
    } else if (form.get('grant_type') === 'refresh_token') {
      const row = await trx
        .selectFrom('mcp_oauth_grants')
        .selectAll()
        .where('refresh_token_hash', '=', tokenHash(config, form.get('refresh_token') ?? ''))
        .where('client_id', '=', clientId)
        .where('revoked_at', 'is', null)
        .where('refresh_expires_at', '>', now)
        .forUpdate()
        .executeTakeFirst();
      if (!row || !strings(row.workspace_ids).length)
        throw new OAuthError('invalid_grant', 'Refresh token is invalid');
      const user = await trx
        .selectFrom('users')
        .select(['email', 'is_active'])
        .where('id', '=', row.user_id)
        .executeTakeFirst();
      if (
        !user?.is_active ||
        !accountAllowed(config, mcp, user.email) ||
        row.resource !== `${mcp.origin}/mcp`
      )
        throw new OAuthError('invalid_grant', 'Refresh token is invalid');
      const granted = strings(row.scopes);
      const requested = form.get('scope')?.split(/\s+/u).filter(Boolean) ?? [];
      // An absent or blank scope keeps the grant; narrowing is allowed, expansion is not.
      scopes = requested.length ? requested : granted;
      if (scopes.some((scope) => !granted.includes(scope)))
        throw new OAuthError('invalid_scope', 'Refresh cannot expand the original grant');
      await trx
        .updateTable('mcp_oauth_grants')
        .set({
          access_token_hash: tokenHash(config, access),
          refresh_token_hash: tokenHash(config, refresh),
          scopes: JSON.stringify(scopes),
          access_expires_at: deadline(mcp.accessTtl),
          refresh_expires_at: deadline(mcp.refreshTtl),
          updated_at: now,
        })
        .where('id', '=', row.id)
        .execute();
    } else throw new OAuthError('unsupported_grant_type', 'Grant type is not supported');
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: mcp.accessTtl,
      scope: scopes.join(' '),
    };
  });
}
export async function revokeToken(
  db: Database,
  config: ServiceConfig,
  clientId: string,
  token: string,
) {
  await db.transaction().execute(async (trx) => {
    const digest = tokenHash(config, token);
    const row = await trx
      .selectFrom('mcp_oauth_grants')
      .select(['id', 'user_id'])
      .where('client_id', '=', clientId)
      .where('revoked_at', 'is', null)
      .where(({ or, eb }) =>
        or([eb('access_token_hash', '=', digest), eb('refresh_token_hash', '=', digest)]),
      )
      .forUpdate()
      .executeTakeFirst();
    if (!row) return;
    await trx
      .updateTable('mcp_oauth_grants')
      .set({ revoked_at: new Date() })
      .where('id', '=', row.id)
      .execute();
    await recordSecurityEvent(trx, 'mcp.revoke', row.user_id, null, row.id);
  });
}
