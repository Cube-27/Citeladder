/** Explicit operator provisioning. Public signup has its own free-baseline path. */
import { z } from 'zod';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { provisionAccount } from '../workspaces/service.ts';
import { issueDevelopmentAccess } from '../entitlements/bootstrap.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { createIdentity } from './service.ts';
import { hashPassword, passwordSchema, verifyPassword } from './password.ts';

export function requireLocalDevelopment(config: ServiceConfig) {
  const target = new URL(config.databaseUrl.replace('postgresql+asyncpg:', 'postgresql:'));
  if (
    !policy.development_env_names.includes(config.appEnv.trim().toLowerCase()) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  )
    throw new Error('local_development_required');
}

const developmentLoginInput = z.strictObject({
  email: z.email().trim().toLowerCase(),
  password: passwordSchema,
  allowance: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

/** Exactly one owned tenant; never choose an arbitrary joined workspace. */
export async function bootstrapWorkspace(db: Database, userId: string) {
  const owned = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select('workspaces.id')
    .where('workspace_members.user_id', '=', userId)
    .where('workspace_members.role', '=', 'owner')
    .where('workspaces.is_system', '=', false)
    .execute();
  if (owned.length !== 1) throw new Error('bootstrap_workspace_ambiguous');
  const workspaceId = owned[0]!.id;
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  return { workspaceId, accountId: account.id };
}

export async function provisionDevelopmentLogin(db: Database, config: ServiceConfig, raw: unknown) {
  requireLocalDevelopment(config);
  const input = developmentLoginInput.parse(raw);
  const encoded = await hashPassword(input.password);
  return db.transaction().execute(async (trx) => {
    await subjectXactLock(trx, `identity.bootstrap:${input.email}`);
    let user = await trx
      .selectFrom('users')
      .selectAll()
      .where('email', '=', input.email)
      .executeTakeFirst();
    if (user) {
      if (
        !user.is_active ||
        user.role !== 'admin' ||
        !(await verifyPassword(input.password, user.hashed_password))
      )
        throw new Error('unexpected_development_identity');
    } else {
      user = await createIdentity(trx, input.email, encoded);
      if (!user) throw new Error('unexpected_development_identity');
      user = await trx
        .updateTable('users')
        .set({ role: 'admin', updated_at: new Date() })
        .where('id', '=', user.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    await provisionAccount(trx, user, { provisionAccess: false });
    const scope = await bootstrapWorkspace(trx, user.id);
    await lockAccount(trx, scope.workspaceId, scope.accountId);
    // Recheck under the user row lock after workspace/account provisioning.
    const current = await trx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    if (
      !current.is_active ||
      current.role !== 'admin' ||
      current.hashed_password !== user.hashed_password
    )
      throw new Error('unexpected_development_identity');
    await issueDevelopmentAccess(trx, {
      ...scope,
      userId: user.id,
      allowance: input.allowance,
      reason: 'local development full-access account',
      keyFamily: `dev-full-access:${user.id}`,
      initialKey: `dev-full-access:${user.id}`,
    });
    return { email: user.email, workspace_id: scope.workspaceId, user_id: user.id };
  });
}
