import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { requiresEmailVerification } from '../auth/eligibility.ts';
import { workspaceAccess, type WorkspaceAccess } from '../entitlements/access.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { strings } from '../db/json.ts';
import { compareText } from '../text-order.ts';
import { recordPolicyAcceptance } from '../workspaces/policies.ts';
import { roleAllows, rolesWith } from '../auth/workspace.ts';
import { accountAllowed, holdsWrite, loadMcpConfig, mcpPolicy, type McpConfig } from './config.ts';
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
  const stale = Date.now() - mcpPolicy.last_used_resolution_seconds * 1000;
  if (!row.last_used_at || row.last_used_at.getTime() < stale)
    await db
      .updateTable('mcp_oauth_grants')
      .set({ last_used_at: new Date() })
      .where('id', '=', row.id)
      .execute();
  return {
    userId: row.user_id,
    grantId: row.id,
    workspaceIds,
    tokenHash: digest,
    canWrite: holdsWrite(strings(row.scopes)),
  };
}
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
export async function revokeGrantsAfterCredentialReset(
  trx: Database,
  userId: string,
  actorId: string,
) {
  await trx
    .updateTable('mcp_authorization_codes')
    .set({ consumed_at: new Date() })
    .where('user_id', '=', userId)
    .where('consumed_at', 'is', null)
    .execute();
  const revoked = await trx
    .updateTable('mcp_oauth_grants')
    .set({ revoked_at: new Date(), updated_at: new Date() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .execute();
  await Promise.all(
    revoked.map((grant) => recordSecurityEvent(trx, 'mcp.revoke', actorId, null, grant.id)),
  );
}
export type ConsentWorkspace = Readonly<{
  id: string;
  name: string;
  hasProject: boolean;
  canChange: boolean;
  state: 'ready' | 'terms' | 'inactive' | 'unresolved';
}>;
export type ConsentSession = Readonly<{ userId: string; sessionVersion: number }>;

async function assertUserMayConsent(
  trx: Database,
  session: ConsentSession,
  config: ServiceConfig,
  mcp: McpConfig,
) {
  const user = await trx
    .selectFrom('users')
    .select(['email', 'is_active', 'registration_origin', 'email_verified_at', 'session_version'])
    .where('id', '=', session.userId)
    .forShare()
    .executeTakeFirst();
  if (user?.session_version !== session.sessionVersion)
    throw new OAuthError('access_denied', 'Your session changed; sign in again to approve');
  if (
    !user.is_active ||
    requiresEmailVerification(user) ||
    !accountAllowed(config, mcp, user.email)
  )
    throw new OAuthError('access_denied', 'This account is not enabled for MCP access');
}
function validateConsentSelection(
  unique: string[],
  shareable: { id: string; state: string }[],
  decision: { acceptedTermsRevision: string | null },
) {
  if (!unique.length) throw new ConsentSelectionError('Select at least one workspace.');
  const states = new Map(shareable.map((w) => [w.id, w.state]));
  if (unique.some((id) => !['ready', 'terms'].includes(states.get(id) ?? '')))
    throw new ConsentSelectionError('Select only workspaces that can be shared right now.');
  const needTerms = unique.filter((id) => states.get(id) === 'terms');
  if (
    decision.acceptedTermsRevision !== null &&
    decision.acceptedTermsRevision !== policy.auth.terms_revision
  )
    throw new ConsentSelectionError(
      'The Terms of Service changed since this page loaded. Review them again before approving.',
    );
  if (needTerms.length && decision.acceptedTermsRevision === null)
    throw new ConsentSelectionError('Accept the Terms of Service to share these workspaces.');
  return needTerms;
}
export async function consentWorkspaces(db: Database, userId: string): Promise<ConsentWorkspace[]> {
  const rows = await db
    .selectFrom('workspaces as w')
    .innerJoin('workspace_members as m', 'm.workspace_id', 'w.id')
    .select(({ exists, selectFrom }) => [
      'w.id',
      'w.name',
      'm.role',
      exists(
        selectFrom('policy_acceptances as p')
          .select('p.id')
          .whereRef('p.workspace_id', '=', 'w.id')
          .where('p.actor_id', '=', userId)
          .where('p.terms_revision', '=', policy.auth.terms_revision),
      ).as('accepted'),
      exists(
        selectFrom('projects as pr').select('pr.id').whereRef('pr.workspace_id', '=', 'w.id'),
      ).as('has_project'),
    ])
    .where('m.user_id', '=', userId)
    .where('m.role', 'in', rolesWith('read'))
    .where('w.is_system', '=', false)
    .orderBy('w.name')
    .orderBy('w.id')
    .execute();
  const access = await Promise.all(rows.map((row) => workspaceAccess(db, row.id)));
  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    hasProject: Boolean(row.has_project),
    canChange: roleAllows(row.role, 'write'),
    state: consentState(access[index]!.status, Boolean(row.accepted)),
  }));
}

function consentState(access: WorkspaceAccess, accepted: boolean): ConsentWorkspace['state'] {
  switch (access) {
    case 'access_unresolved':
      return 'unresolved';
    case 'trial_expired':
    case 'subscription_lapsed':
      return 'inactive';
    case 'active':
    case 'trial_active':
      return accepted ? 'ready' : 'terms';
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}

export class ConsentSelectionError extends Error {}
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
  session: ConsentSession,
  decision: {
    selected: string[];
    acceptedTermsRevision: string | null;
    allowChanges: boolean;
  } | null,
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
      await assertUserMayConsent(trx, session, config, mcp);
      const { userId } = session;
      const unique = [...new Set(decision.selected)].sort(compareText);
      const shareable = await consentWorkspaces(trx, userId);
      const needTerms = validateConsentSelection(unique, shareable, decision);
      for (const workspaceId of needTerms)
        await /* NOSONAR -- One transaction: acceptances record in order. */ recordPolicyAcceptance(
          trx,
          {
            workspaceId,
            actorId: userId,
            revision: policy.auth.terms_revision,
            context: 'mcp_consent',
          },
        );
      const changes =
        decision.allowChanges &&
        shareable.some((w) => w.canChange && unique.includes(w.id)) &&
        holdsWrite(strings(request.scopes));
      const scopes = strings(request.scopes).filter(
        (scope) => changes || scope !== mcpPolicy.write_scope,
      );
      const code = mintToken();
      await trx
        .insertInto('mcp_authorization_codes')
        .values({
          id: randomUUID(),
          workspace_ids: JSON.stringify(unique),
          code_hash: tokenHash(config, code),
          client_id: request.client_id,
          user_id: userId,
          scopes: JSON.stringify(scopes),
          code_challenge: request.code_challenge,
          redirect_uri: request.redirect_uri,
          redirect_uri_provided_explicitly: request.redirect_uri_provided_explicitly,
          resource: request.resource,
          expires_at: deadline(mcp.codeTtl),
          consumed_at: null,
          created_at: new Date(),
        })
        .execute();
      for (const id of unique) await recordSecurityEvent(trx, 'mcp.consent', userId, id); // NOSONAR -- One transaction: events record in order.
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
class Replayed extends Error {}
type TokenGrant = {
  config: ServiceConfig;
  mcp: McpConfig;
  clientId: string;
  form: URLSearchParams;
  access: string;
  refresh: string;
  now: Date;
};
async function authorizationCodeGrant(
  trx: Database,
  { config, mcp, clientId, form, access, refresh, now }: TokenGrant,
): Promise<string[] | Replayed> {
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
    !equalSecret(createHash('sha256').update(verifier).digest('base64url'), row.code_challenge) ||
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
  const scopes = strings(row.scopes);
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
  return scopes;
}
async function refreshTokenGrant(
  trx: Database,
  { config, mcp, clientId, form, access, refresh, now }: TokenGrant,
): Promise<string[] | Replayed> {
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
  const scopes = requested.length ? requested : granted;
  if (scopes.some((scope) => !granted.includes(scope)))
    throw new OAuthError('invalid_scope', 'Refresh cannot expand the original grant');
  if (!scopes.includes(mcpPolicy.read_scope))
    throw new OAuthError('invalid_scope', 'Every token keeps the read scope');
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
  return scopes;
}
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
    const grant: TokenGrant = { config, mcp, clientId, form, access, refresh, now };
    let granted: string[] | Replayed;
    if (form.get('grant_type') === 'authorization_code')
      granted = await authorizationCodeGrant(trx, grant);
    else if (form.get('grant_type') === 'refresh_token')
      granted = await refreshTokenGrant(trx, grant);
    else throw new OAuthError('unsupported_grant_type', 'Grant type is not supported');
    if (granted instanceof Replayed) return granted;
    const scopes = granted;
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
