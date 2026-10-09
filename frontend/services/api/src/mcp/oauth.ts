import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { requiresEmailVerification } from '../auth/eligibility.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { strings } from '../db/json.ts';
import { compareText } from '../text-order.ts';
import { recordPolicyAcceptance } from '../workspaces/policies.ts';
import { READ_ROLES } from './data.ts';
import { accountAllowed, loadMcpConfig, mcpPolicy, type McpConfig } from './config.ts';
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
  const bearer = /^Bearer +(\S+)$/iu.exec(request.headers.get('authorization') ?? '')?.[1];
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
      'g.last_used_at',
      'u.email',
      'u.is_active',
      'u.registration_origin',
      'u.email_verified_at',
    ])
    .where('g.access_token_hash', '=', digest)
    .where('g.revoked_at', 'is', null)
    .where('g.access_expires_at', '>', new Date())
    .executeTakeFirst();
  if (
    !row?.is_active ||
    requiresEmailVerification(row) ||
    !accountAllowed(config, mcp, row.email) ||
    row.resource !== `${mcp.origin}/mcp` ||
    !strings(row.scopes).includes(mcpPolicy.read_scope)
  )
    return null;
  const workspaceIds = strings(row.workspace_ids);
  if (!workspaceIds.length) return null;
  // Last use at minutes resolution: a write only when the recorded use is stale.
  const stale = Date.now() - mcpPolicy.last_used_resolution_seconds * 1000;
  if (!row.last_used_at || row.last_used_at.getTime() < stale)
    await db
      .updateTable('mcp_oauth_grants')
      .set({ last_used_at: new Date() })
      .where('id', '=', row.id)
      .execute();
  return { userId: row.user_id, grantId: row.id, workspaceIds, tokenHash: digest };
}
/** A refresh window slides, but never past the grant's absolute lifetime. */
function refreshDeadline(mcp: McpConfig, grantedAt: Date) {
  return new Date(
    Math.min(
      Date.now() + mcp.refreshTtl * 1000,
      grantedAt.getTime() + mcpPolicy.grant_max_lifetime_seconds * 1000,
    ),
  );
}
async function revokeGrant(
  trx: Database,
  grant: { id: string; user_id: string },
  event: 'mcp.revoke' | 'mcp.token_reuse',
) {
  await trx
    .updateTable('mcp_oauth_grants')
    .set({ revoked_at: new Date(), updated_at: new Date() })
    .where('id', '=', grant.id)
    .where('revoked_at', 'is', null)
    .execute();
  await recordSecurityEvent(trx, event, grant.user_id, null, grant.id);
}
/**
 * Why a workspace can or cannot be approved right now. `terms` is resolvable on
 * the consent page itself; `inactive` needs its trial or subscription fixed.
 */
export type ConsentWorkspace = Readonly<{
  id: string;
  name: string;
  hasProject: boolean;
  state: 'ready' | 'terms' | 'inactive';
}>;

/** Every workspace the account could share, each with what approving it needs. */
export async function consentWorkspaces(db: Database, userId: string): Promise<ConsentWorkspace[]> {
  const rows = await db
    .selectFrom('workspaces as w')
    .innerJoin('workspace_members as m', 'm.workspace_id', 'w.id')
    .select(({ exists, selectFrom }) => [
      'w.id',
      'w.name',
      exists(
        selectFrom('policy_acceptances as p')
          .select('p.id')
          .whereRef('p.workspace_id', '=', 'w.id')
          .where('p.actor_id', '=', userId)
          .where('p.terms_revision', '=', policy.mcp.terms_revision),
      ).as('accepted'),
      exists(
        selectFrom('projects as pr').select('pr.id').whereRef('pr.workspace_id', '=', 'w.id'),
      ).as('has_project'),
    ])
    .where('m.user_id', '=', userId)
    .where('m.role', 'in', READ_ROLES)
    .where('w.is_system', '=', false)
    .orderBy('w.name')
    .orderBy('w.id')
    .execute();
  const access = await Promise.all(rows.map((row) => workspaceAccess(db, row.id)));
  return rows.map((row, index) => {
    let state: ConsentWorkspace['state'] = 'ready';
    if (!['active', 'trial_active'].includes(access[index]!.status)) state = 'inactive';
    else if (!row.accepted) state = 'terms';
    return { id: row.id, name: row.name, hasProject: Boolean(row.has_project), state };
  });
}

/** A refused approval the person can correct on the same consent page. */
export class ConsentSelectionError extends Error {}
/** The transaction was used, expired or never existed; only the client can restart it. */
export class ConsentExpiredError extends OAuthError {
  constructor() {
    super('access_denied', 'Authorization request is invalid or expired');
  }
}

export function completeConsent(
  db: Database,
  config: ServiceConfig,
  mcp: McpConfig,
  transaction: string,
  userId: string,
  decision: { selected: string[]; acceptTerms: boolean } | null,
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
    if (!request) throw new ConsentExpiredError();
    const destination = new URL(request.redirect_uri);
    if (request.state) destination.searchParams.set('state', request.state);
    // RFC 9207: the client can confirm which server answered.
    destination.searchParams.set('iss', mcp.origin);
    if (decision === null) destination.searchParams.set('error', 'access_denied');
    else {
      const user = await trx
        .selectFrom('users')
        .select(['email', 'is_active', 'registration_origin', 'email_verified_at'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (
        !user?.is_active ||
        requiresEmailVerification(user) ||
        !accountAllowed(config, mcp, user.email)
      )
        throw new OAuthError('access_denied', 'This account is not enabled for MCP access');
      const unique = [...new Set(decision.selected)].sort(compareText);
      if (!unique.length) throw new ConsentSelectionError('Select at least one workspace.');
      const states = new Map((await consentWorkspaces(trx, userId)).map((w) => [w.id, w.state]));
      if (unique.some((id) => states.get(id) === undefined || states.get(id) === 'inactive'))
        throw new ConsentSelectionError('Select only workspaces that can be shared right now.');
      const needTerms = unique.filter((id) => states.get(id) === 'terms');
      if (needTerms.length && !decision.acceptTerms)
        throw new ConsentSelectionError('Accept the Terms of Service to share these workspaces.');
      for (const workspaceId of needTerms)
        await recordPolicyAcceptance(trx, {
          workspaceId,
          actorId: userId,
          revision: policy.mcp.terms_revision,
          context: 'mcp_consent',
        });
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
/** A replayed credential: its grant is revoked in a committed transaction first. */
class Replayed extends Error {}
export async function exchangeToken(
  db: Database,
  config: ServiceConfig,
  mcp: McpConfig,
  clientId: string,
  form: URLSearchParams,
) {
  const result = await db.transaction().execute(async (trx) => {
    const access = mintToken();
    const refresh = mintToken(48);
    const now = new Date();
    let scopes: string[];
    if (form.get('grant_type') === 'authorization_code') {
      const codeHash = tokenHash(config, form.get('code') ?? '');
      const row = await trx
        .selectFrom('mcp_authorization_codes')
        .selectAll()
        .where('code_hash', '=', codeHash)
        .where('client_id', '=', clientId)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', now)
        .forUpdate()
        .executeTakeFirst();
      if (!row) {
        // A consumed code presented again revokes what it minted (RFC 6749 §4.1.2).
        const minted = await trx
          .selectFrom('mcp_oauth_grants as g')
          .innerJoin('mcp_authorization_codes as code', 'code.id', 'g.authorization_code_id')
          .select(['g.id', 'g.user_id'])
          .where('code.code_hash', '=', codeHash)
          .where('code.client_id', '=', clientId)
          .where('code.consumed_at', 'is not', null)
          .where('g.revoked_at', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (minted) {
          await revokeGrant(trx, minted, 'mcp.token_reuse');
          return new Replayed();
        }
      }
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
        .select(['email', 'is_active', 'registration_origin', 'email_verified_at'])
        .where('id', '=', row.user_id)
        .executeTakeFirst();
      if (
        !user?.is_active ||
        requiresEmailVerification(user) ||
        !accountAllowed(config, mcp, user.email) ||
        row.resource !== `${mcp.origin}/mcp` ||
        !strings(row.scopes).includes(mcpPolicy.read_scope)
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
          refresh_expires_at: refreshDeadline(mcp, now),
          revoked_at: null,
          authorization_code_id: row.id,
          created_at: now,
          updated_at: now,
        })
        .execute();
    } else if (form.get('grant_type') === 'refresh_token') {
      const presented = tokenHash(config, form.get('refresh_token') ?? '');
      const row = await trx
        .selectFrom('mcp_oauth_grants')
        .selectAll()
        .where('refresh_token_hash', '=', presented)
        .where('client_id', '=', clientId)
        .where('revoked_at', 'is', null)
        .where('refresh_expires_at', '>', now)
        .forUpdate()
        .executeTakeFirst();
      if (!row) {
        // A superseded token: a concurrent refresh inside the grace window is
        // refused alone; a later replay means the token leaked, so the grant goes.
        const superseded = await trx
          .selectFrom('mcp_oauth_grants')
          .select(['id', 'user_id', 'refresh_rotated_at'])
          .where('previous_refresh_token_hash', '=', presented)
          .where('client_id', '=', clientId)
          .where('revoked_at', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        const grace = mcpPolicy.refresh_reuse_grace_seconds * 1000;
        if (
          superseded?.refresh_rotated_at &&
          now.getTime() - superseded.refresh_rotated_at.getTime() > grace
        ) {
          await revokeGrant(trx, superseded, 'mcp.token_reuse');
          return new Replayed();
        }
      }
      if (!row || !strings(row.workspace_ids).length)
        throw new OAuthError('invalid_grant', 'Refresh token is invalid');
      const user = await trx
        .selectFrom('users')
        .select(['email', 'is_active', 'registration_origin', 'email_verified_at'])
        .where('id', '=', row.user_id)
        .executeTakeFirst();
      if (
        !user?.is_active ||
        requiresEmailVerification(user) ||
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
          previous_refresh_token_hash: row.refresh_token_hash,
          refresh_rotated_at: now,
          scopes: JSON.stringify(scopes),
          access_expires_at: deadline(mcp.accessTtl),
          refresh_expires_at: refreshDeadline(mcp, row.created_at),
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
  if (result instanceof Replayed)
    throw new OAuthError('invalid_grant', 'This credential was already used');
  return result;
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
    if (row) await revokeGrant(trx, row, 'mcp.revoke');
  });
}
