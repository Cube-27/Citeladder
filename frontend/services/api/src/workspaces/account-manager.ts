import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { hashPassword, passwordSchema, verifyAccountPassword } from '../auth/password.ts';
import { createIdentity } from '../auth/service.ts';
import { WorkspaceContext } from '../auth/workspace.ts';
import { lockIdentityAdministration, requirePlatformAdmin } from '../auth/operators.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { revokeCreatorKeys } from '../api-keys/revocation.ts';
import { baselineGrantKey, fullAccessSpecs } from '../entitlements/bootstrap.ts';
import { issueBundle, revokeBundle } from '../entitlements/grants.ts';
import { resolveAccountEntitlement } from '../entitlements/resolve.ts';
import { operatorTransaction } from '../db/operator-transaction.ts';
import { bootstrapWorkspace } from '../auth/bootstrap.ts';
import { policy } from '../config.ts';
import { getLogger } from '../logging.ts';
import { issueInvitationInTransaction } from './invitations.ts';
import {
  applyMemberMutation,
  assignableRoleSchema,
  listMembers,
  lockWorkspace,
  mutateMemberInTransaction,
  provisionAccount,
  type AssignableRole,
} from './service.ts';

export type OperatorSession = {
  actorId: string;
  workspaceId: string;
  passwordHash: string;
  sessionVersion: number;
};
export type AccountAction =
  | { kind: 'list' }
  | { kind: 'invite'; email: string; role: string; password?: string }
  | { kind: 'role'; email: string; role: string }
  | { kind: 'password'; email: string; password: string };
const emailSchema = z
  .email()
  .max(255)
  .transform((email) => email.trim().toLowerCase());

async function authorizedOperator(db: Database, session: OperatorSession) {
  await lockIdentityAdministration(db);
  const workspace = await db
    .selectFrom('workspaces')
    .selectAll()
    .where('id', '=', session.workspaceId)
    .where('is_system', '=', false)
    .forUpdate()
    .executeTakeFirst();
  const member = await db
    .selectFrom('workspace_members')
    .select('role')
    .where('workspace_id', '=', session.workspaceId)
    .where('user_id', '=', session.actorId)
    .forUpdate()
    .executeTakeFirst();
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', session.actorId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  if (
    !workspace ||
    !member ||
    !actor?.is_active ||
    !new WorkspaceContext(session.workspaceId, member.role).allows('manage_members') ||
    actor.hashed_password !== session.passwordHash ||
    actor.session_version !== session.sessionVersion
  )
    throw new Error('workspace_admin_required');
  return workspace;
}

export type PlatformSession = Omit<OperatorSession, 'workspaceId'>;
type Access = { allowance: number; until: Date | null };
export type PlatformAction =
  | {
      kind: 'create';
      emails: string[];
      password: string;
      workspaceId?: string;
      role: string;
      access?: Access;
    }
  | { kind: 'role'; workspaceId: string; email: string; role: string }
  | { kind: 'password'; workspaceId: string; email: string; password: string }
  | { kind: 'remove'; workspaceId: string; email: string }
  | { kind: 'access'; workspaceId: string; accountId: string; access: Access }
  | { kind: 'revoke'; workspaceId: string; accountId: string; grantIds: string[] }
  | { kind: 'state'; email: string; active: boolean }
  | { kind: 'delete'; email: string };
export type AccountRequest = { reason: string; key: string; at: Date; apply?: boolean };

/** Platform identity administration is never conferred by a workspace Admin role. */
export async function authenticatePlatformOperator(
  db: Database,
  email: string,
  password: string,
): Promise<PlatformSession> {
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email.trim().toLowerCase())
    .executeTakeFirst();
  if (
    !user?.is_active ||
    !(await verifyAccountPassword(password, user.hashed_password)) ||
    !user.hashed_password
  )
    throw new Error('operator_authentication_failed');
  const session = {
    actorId: user.id,
    passwordHash: user.hashed_password,
    sessionVersion: user.session_version,
  };
  await db.transaction().execute((trx) => authorizePlatform(trx, session));
  return session;
}

async function authorizePlatform(db: Database, session: PlatformSession) {
  const actor = await requirePlatformAdmin(db, session.actorId);
  if (
    actor.hashed_password !== session.passwordHash ||
    actor.session_version !== session.sessionVersion
  )
    throw new Error('operator_session_revoked');
  return actor;
}

/** Safe identity/workspace inventory, available only to a live authenticated platform operator. */
export function platformAccountInventory(db: Database, session: PlatformSession) {
  return db.transaction().execute(async (trx) => {
    await authorizePlatform(trx, session);
    const users = await trx
      .selectFrom('users')
      .select(['id', 'email', 'role', 'is_active'])
      .orderBy('email')
      .execute();
    const workspaces = await trx
      .selectFrom('workspaces')
      .innerJoin('workspace_members', 'workspace_members.workspace_id', 'workspaces.id')
      .innerJoin('users', 'users.id', 'workspace_members.user_id')
      .leftJoin('billing_accounts', 'billing_accounts.workspace_id', 'workspaces.id')
      .select([
        'workspaces.id',
        'workspaces.name',
        'users.email as owner',
        'billing_accounts.id as account_id',
      ])
      .where('workspace_members.role', '=', 'owner')
      .where('workspaces.is_system', '=', false)
      .orderBy('workspaces.created_at')
      .orderBy('workspaces.id')
      .execute();
    return { users, workspaces };
  });
}

export function platformAccountGrants(
  db: Database,
  session: PlatformSession,
  scope: { workspaceId: string; accountId: string },
) {
  return db.transaction().execute(async (trx) => {
    await authorizePlatform(trx, session);
    await trx
      .selectFrom('billing_accounts')
      .select('id')
      .where('id', '=', z.uuid().parse(scope.accountId))
      .where('workspace_id', '=', z.uuid().parse(scope.workspaceId))
      .executeTakeFirstOrThrow();
    return trx
      .selectFrom('account_grants')
      .select(['id', 'key', 'value', 'source_kind', 'valid_until'])
      .where('billing_account_id', '=', scope.accountId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
  });
}

async function grantAccess(
  db: Database,
  session: PlatformSession,
  scope: { workspaceId: string; accountId: string },
  access: Access,
  request: AccountRequest,
) {
  const specs = fullAccessSpecs(access.allowance);
  const from = request.at;
  if (access.until && (!Number.isFinite(access.until.getTime()) || access.until <= from))
    throw new Error('invalid_grant_validity');
  const grants = await issueBundle(db, {
    ...scope,
    key: request.key,
    sourceKind: 'override',
    sourceRef: `override:${session.actorId}`,
    specs,
    revision: policy.entitlements.registry_revision,
    from,
    until: access.until,
    primary: false,
    profile: '',
    priority: 0,
  });
  const effective = await resolveAccountEntitlement(db, scope, new Date());
  return {
    grant_ids: grants.map((grant) => grant.id),
    values: effective.status === 'resolved' ? Object.fromEntries(effective.values) : effective,
  };
}

async function createAccounts(
  db: Database,
  session: PlatformSession,
  action: Extract<PlatformAction, { kind: 'create' }>,
  request: AccountRequest,
  encoded: string,
) {
  const emails = z
    .array(emailSchema)
    .min(1)
    .max(policy.workspaces.max_pending_invitations)
    .parse(action.emails.map((email) => email.trim()));
  if (new Set(emails).size !== emails.length) throw new Error('duplicate_account_email');
  if ((await db.selectFrom('users').select('id').where('email', 'in', emails).execute()).length)
    throw new Error('user_already_exists');
  // Joining an existing workspace: lock it and resolve its account once for the batch.
  let shared: { workspaceId: string; accountId: string; role: AssignableRole } | undefined;
  if (action.workspaceId) {
    const workspaceId = z.uuid().parse(action.workspaceId);
    const role = assignableRoleSchema.parse(action.role);
    await lockWorkspace(db, workspaceId);
    const account = await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow();
    shared = { workspaceId, accountId: account.id, role };
  } else if (action.role !== 'owner') throw new Error('new_workspace_requires_owner');
  const created = [];
  for (const email of emails) {
    const user = await createIdentity(db, email, encoded);
    if (!user) throw new Error('user_already_exists');
    // A person joining a shared workspace owns none until they create their own.
    // An owned workspace gets the operator baseline; extra access is a separate bundle.
    if (!shared) await provisionAccount(db, user);
    const personal = shared ? undefined : await bootstrapWorkspace(db, user.id);
    const target = shared ?? personal;
    if (!target) throw new Error('account_workspace_unresolved');
    if (shared) {
      // Operator-created identities join immediately. Existing identities still use invitations.
      const now = new Date();
      await db
        .insertInto('workspace_members')
        .values({
          id: randomUUID(),
          workspace_id: shared.workspaceId,
          user_id: user.id,
          role: shared.role,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await recordSecurityEvent(
        db,
        'membership.join',
        session.actorId,
        shared.workspaceId,
        user.id,
      );
    }
    await recordSecurityEvent(db, 'account.create', session.actorId, target.workspaceId, user.id);
    const access =
      personal && action.access
        ? await grantAccess(db, session, personal, action.access, {
            ...request,
            key: `${request.key}:${user.id}`,
          })
        : undefined;
    created.push({
      email,
      user_id: user.id,
      workspace_id: target.workspaceId,
      role: action.role,
      personal_workspace_id: personal?.workspaceId ?? null,
      access,
    });
  }
  const access =
    shared && action.access
      ? await grantAccess(db, session, shared, action.access, request)
      : undefined;
  return { created, access };
}

/** Refuse unknown/current FK dependants, including future schema additions. */
async function requireUnused(db: Database, table: string, id: string, allowed: readonly string[]) {
  const references = await sql<{
    schema_name: string;
    table_name: string;
    column_name: string;
  }>`SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
       FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(f.conkey)
      WHERE f.contype='f' AND f.confrelid=${`public.${table}`}::regclass`.execute(db);
  const checks = references.rows.flatMap((reference) => {
    const name = `${reference.schema_name}.${reference.table_name}.${reference.column_name}`;
    if (allowed.includes(name)) return [];
    return [
      sql`SELECT EXISTS(SELECT 1 FROM ${sql.table(`${reference.schema_name}.${reference.table_name}`)}
      WHERE ${sql.ref(reference.column_name)}=${id}) AS present`,
    ];
  });
  if (!checks.length) return;
  const dependants = await sql<{ present: boolean }>`${sql.join(checks, sql` UNION ALL `)}`.execute(
    db,
  );
  if (dependants.rows.some((row) => row.present)) throw new Error('account_has_retained_activity');
}

/** Platform menu changes only customer identities, never an administrator or the operator. */
function requireCustomerIdentity(
  user: { id: string; role: string },
  session: PlatformSession,
  failure: string,
) {
  if (user.id === session.actorId || user.role !== 'user') throw new Error(failure);
}

async function deleteUnusedAccount(db: Database, session: PlatformSession, email: string) {
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirstOrThrow();
  requireCustomerIdentity(user, session, 'account_delete_forbidden');
  if (user.registration_origin !== 'operator') throw new Error('account_delete_forbidden');
  const loadMemberships = () =>
    db
      .selectFrom('workspace_members')
      .select(['workspace_id', 'role'])
      .where('user_id', '=', user.id)
      .orderBy('workspace_id')
      .execute();
  const memberships = await loadMemberships();
  for (const member of memberships)
    await db
      .selectFrom('workspaces')
      .select('id')
      .where('id', '=', member.workspace_id)
      .forUpdate()
      .executeTakeFirstOrThrow();
  const current = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', user.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (current.role !== user.role || current.registration_origin !== user.registration_origin)
    throw new Error('account_identity_changed');
  const liveMemberships = await loadMemberships();
  if (JSON.stringify(liveMemberships) !== JSON.stringify(memberships))
    throw new Error('account_membership_changed');
  await requireUnused(db, 'users', user.id, [
    'public.workspace_members.user_id',
    'public.billing_accounts.owner_user_id',
    'public.auth_challenges.user_id',
    'public.user_identities.user_id',
  ]);
  for (const member of memberships) {
    if (member.role !== 'owner') continue;
    const members = await db
      .selectFrom('workspace_members')
      .select('id')
      .where('workspace_id', '=', member.workspace_id)
      .execute();
    if (members.length !== 1) throw new Error('transfer_ownership_first');
    await requireUnused(db, 'workspaces', member.workspace_id, [
      'public.workspace_members.workspace_id',
      'public.billing_accounts.workspace_id',
      'public.workspace_site_health_runtime.workspace_id',
    ]);
    const account = await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', member.workspace_id)
      .forUpdate()
      .executeTakeFirst();
    if (!account) continue;
    await requireUnused(db, 'billing_accounts', account.id, [
      'public.account_grants.billing_account_id',
    ]);
    const extra = await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .where('idempotency_key', '!=', baselineGrantKey())
      .executeTakeFirst();
    if (extra) throw new Error('account_has_retained_activity');
  }
  // A new account's workspace, billing row and operator baseline (with its
  // derived runtime row) can be removed; any other grant or history blocks this.
  for (const member of memberships) {
    if (member.role === 'owner')
      await db.deleteFrom('workspaces').where('id', '=', member.workspace_id).execute();
    else {
      await revokeCreatorKeys(db, member.workspace_id, user.id, session.actorId);
      await recordSecurityEvent(
        db,
        'membership.remove',
        session.actorId,
        member.workspace_id,
        user.id,
      );
    }
  }
  await db.deleteFrom('users').where('id', '=', user.id).execute();
  await recordSecurityEvent(db, 'account.delete', session.actorId, null, user.id);
  return { deleted: email };
}

/** Preview runs the same transaction and rolls back every identity, membership and grant. */
export async function managePlatformAccounts(
  db: Database,
  session: PlatformSession,
  action: PlatformAction,
  request: AccountRequest,
) {
  z.object({
    reason: z.string().trim().min(1).max(255),
    key: z.string().trim().min(1).max(180),
    at: z.date(),
  }).parse(request);
  const encoded =
    action.kind === 'create' || action.kind === 'password'
      ? await hashPassword(passwordSchema.parse(action.password))
      : null;
  const result = await operatorTransaction(db, request.apply === true, async (trx) => {
    await authorizePlatform(trx, session);
    if (action.kind === 'role' || action.kind === 'password' || action.kind === 'remove') {
      const workspaceId = z.uuid().parse(action.workspaceId);
      await lockWorkspace(trx, workspaceId);
      const member = await trx
        .selectFrom('workspace_members')
        .innerJoin('users', 'users.id', 'workspace_members.user_id')
        .select(['workspace_members.id', 'workspace_members.user_id'])
        .where('workspace_id', '=', workspaceId)
        .where('users.email', '=', emailSchema.parse(action.email))
        .executeTakeFirstOrThrow();
      if (action.kind !== 'password')
        return applyMemberMutation(
          trx,
          workspaceId,
          session.actorId,
          action.kind === 'role'
            ? { memberId: member.id, role: assignableRoleSchema.parse(action.role) }
            : { memberId: member.id, remove: true },
        );
      const user = await trx
        .selectFrom('users')
        .select(['id', 'role', 'hashed_password'])
        .where('id', '=', member.user_id)
        .forNoKeyUpdate()
        .executeTakeFirstOrThrow();
      requireCustomerIdentity(user, session, 'account_password_forbidden');
      if (!user.hashed_password) throw new Error('passwordless_account');
      await trx
        .updateTable('users')
        .set({
          hashed_password: encoded,
          session_version: sql`session_version + 1`,
          updated_at: new Date(),
        })
        .where('id', '=', member.user_id)
        .execute();
      await recordSecurityEvent(
        trx,
        'auth.password_reset',
        session.actorId,
        workspaceId,
        member.user_id,
      );
      return { passwordUpdated: true };
    }
    if (action.kind === 'create') return createAccounts(trx, session, action, request, encoded!);
    if (action.kind === 'access') {
      z.uuid().parse(action.workspaceId);
      z.uuid().parse(action.accountId);
      return grantAccess(trx, session, action, action.access, request);
    }
    if (action.kind === 'revoke') {
      await revokeBundle(trx, {
        workspaceId: z.uuid().parse(action.workspaceId),
        accountId: z.uuid().parse(action.accountId),
        grantIds: z.array(z.uuid()).min(1).parse(action.grantIds),
        key: request.key,
        reason: request.reason,
        actorKind: 'operator',
        actorId: session.actorId,
        at: request.at,
      });
      return { revoked: action.grantIds };
    }
    if (action.kind === 'delete')
      return deleteUnusedAccount(trx, session, emailSchema.parse(action.email));
    if (action.kind === 'state') {
      const user = await trx
        .selectFrom('users')
        .selectAll()
        .where('email', '=', emailSchema.parse(action.email))
        .forUpdate()
        .executeTakeFirstOrThrow();
      requireCustomerIdentity(user, session, 'account_state_forbidden');
      if (user.is_active !== action.active) {
        await trx
          .updateTable('users')
          .set({
            is_active: action.active,
            session_version: sql`session_version + 1`,
            updated_at: new Date(),
          })
          .where('id', '=', user.id)
          .execute();
        await recordSecurityEvent(
          trx,
          action.active ? 'account.enable' : 'account.disable',
          session.actorId,
          null,
          user.id,
        );
      }
      return { email: user.email, active: action.active };
    }
    throw new Error('unknown_account_action');
  });
  getLogger('api.billing.operator').info('account.management', {
    actor_id: session.actorId,
    operation: action.kind,
    reason: request.reason,
    idempotency_key: request.key,
    dry_run: request.apply !== true,
  });
  return result;
}

/** Password verification has no public-login repair or billing side effects. */
export async function authenticateOperator(
  db: Database,
  email: string,
  workspaceId: string,
  password: string,
): Promise<OperatorSession> {
  z.uuid().parse(workspaceId);
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email.trim().toLowerCase())
    .executeTakeFirst();
  if (
    !(await verifyAccountPassword(password, actor?.is_active ? actor.hashed_password : null)) ||
    !actor?.hashed_password
  )
    throw new Error('operator_authentication_failed');
  const session = {
    actorId: actor.id,
    workspaceId,
    passwordHash: actor.hashed_password,
    sessionVersion: actor.session_version,
  };
  await db.transaction().execute((trx) => authorizedOperator(trx, session));
  return session;
}

/** Called only after confirmation. All live authority and target checks occur under locks. */
export async function manageAccount(db: Database, session: OperatorSession, action: AccountAction) {
  const email = action.kind === 'list' ? null : emailSchema.parse(action.email.trim());
  const role =
    action.kind === 'invite' || action.kind === 'role'
      ? assignableRoleSchema.parse(action.role)
      : null;
  const encoded =
    action.kind === 'password' || (action.kind === 'invite' && action.password !== undefined)
      ? await hashPassword(passwordSchema.parse(action.password))
      : null;
  return db.transaction().execute(async (trx) => {
    await authorizedOperator(trx, session);
    if (action.kind === 'list') return listMembers(trx, session.workspaceId, session.actorId);
    if (action.kind === 'invite') {
      const invitation = await issueInvitationInTransaction(
        trx,
        session.workspaceId,
        session.actorId,
        email!,
        role!,
      );
      const existing = await trx
        .selectFrom('users')
        .select('id')
        .where('email', '=', email!)
        .executeTakeFirst();
      if (!existing) {
        if (!encoded) throw new Error('New identity requires a terminal password');
        const user = await createIdentity(trx, email!, encoded);
        if (!user) throw new Error('user_already_exists');
      }
      return invitation;
    }
    const target = await trx
      .selectFrom('workspace_members')
      .innerJoin('users', 'users.id', 'workspace_members.user_id')
      .select(['workspace_members.id as memberId', 'users.id as userId', 'users.hashed_password'])
      .where('workspace_id', '=', session.workspaceId)
      .where('users.email', '=', email!)
      .forUpdate('workspace_members')
      .executeTakeFirst();
    if (!target) throw new Error('user_not_in_workspace');
    if (action.kind === 'role')
      return mutateMemberInTransaction(trx, session.workspaceId, session.actorId, {
        memberId: target.memberId,
        role: role!,
      });
    const user = await trx
      .selectFrom('users')
      .select('hashed_password')
      .where('id', '=', target.userId)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    if (!user.hashed_password) throw new Error('passwordless_account');
    await trx
      .updateTable('users')
      .set({
        hashed_password: encoded,
        session_version: sql`session_version + 1`,
        updated_at: new Date(),
      })
      .where('id', '=', target.userId)
      .execute();
    return { passwordUpdated: true };
  });
}
