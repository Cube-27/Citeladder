import { sql } from 'kysely';
import { z } from 'zod';
import { assertDeployable, loadConfig, policy } from '../config.ts';
import { resolveSettingSpec } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { provisionAccount } from '../workspaces/service.ts';
import { issueDevelopmentAccess } from '../entitlements/bootstrap.ts';
import { issueBundle, lockAccount } from '../entitlements/grants.ts';
import { refreshRuntime } from '../site-health/plan-runtime.ts';
import { ownedWorkspaceAccount } from '../workspaces/owned.ts';
import { createIdentity } from './service.ts';
import { hashPassword, passwordSchema, verifyPassword } from './password.ts';
import { initializeCatalog } from '../billing/admin.ts';
import { billingSettings, razorpaySettings } from '../billing/config.ts';
import { configured } from '../billing/razorpay.ts';

export async function bootstrapDeployment(
  db: Database,
  env: Record<string, string | undefined>,
  catalog = initializeCatalog,
) {
  const config = loadConfig(env);
  if (config.demo.enabled) assertDeployable(config, true);
  const setting = (key: keyof typeof policy.settings) =>
    resolveSettingSpec(policy.settings[key], env);
  const email = z.email().parse(String(setting('dev_login_email')).trim().toLowerCase());
  if (!config.demo.enabled) {
    if (!policy.development_env_names.includes(config.appEnv.trim().toLowerCase()))
      return { skipped: true, catalog: await operatorCatalog(db, env, email, catalog) };
    if (!String(setting('dev_login_password'))) return { skipped: true, catalog: false };
  }
  const password = String(setting('dev_login_password'));
  passwordSchema.parse(password);
  if (config.demo.enabled && !config.demo.expiresAt) throw new Error('demo_expiry_required');
  const encoded = await hashPassword(password);
  const workspaceId = await db.transaction().execute(async (trx) => {
    await subjectXactLock(
      trx,
      config.demo.enabled ? 'identity.bootstrap:demo' : `identity.bootstrap:${email}`,
    );
    const users = config.demo.enabled ? await trx.selectFrom('users').selectAll().execute() : [];
    if (
      config.demo.enabled &&
      (users.length > 1 || users.some((user) => user.email.toLowerCase() !== email))
    )
      throw new Error('unexpected_demo_identity');
    let user = await trx
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    const existed = !!user;
    if (!user) user = await createIdentity(trx, email, encoded);
    if (!user) throw new Error('bootstrap_identity_conflict');
    if (!config.demo.enabled && !existed) {
      user = await trx
        .updateTable('users')
        .set({ role: 'admin' })
        .where('id', '=', user.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    await provisionAccount(trx, user, { provisionAccess: !config.demo.enabled });
    const scope = await ownedWorkspaceAccount(trx, user.id);
    await lockAccount(trx, scope.workspaceId, scope.accountId);
    const current = await trx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    const rotate = config.demo.enabled
      ? existed
      : !(await verifyPassword(password, current.hashed_password));
    const updated = await trx
      .updateTable('users')
      .set({
        is_active: true,
        role: config.demo.enabled ? current.role : 'admin',
        ...(rotate ? { hashed_password: encoded, session_version: sql`session_version + 1` } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (config.demo.enabled) {
      const allowance = Number(setting('demo_monitored_url_limit'));
      const key = `demo-bootstrap:monitored-urls:${allowance}`;
      const prior = await trx
        .selectFrom('account_grants')
        .select('valid_from')
        .where('billing_account_id', '=', scope.accountId)
        .where('idempotency_key', '=', key)
        .executeTakeFirst();
      await issueBundle(trx, {
        ...scope,
        key,
        sourceKind: 'override',
        source: { kind: 'override', actorId: updated.id },
        reason: 'explicit configured demo bootstrap',
        specs: [{ key: 'monitored_urls', value: allowance }],
        revision: policy.entitlements.registry_revision,
        from: prior?.valid_from ?? new Date(),
        until: config.demo.expiresAt,
        primary: false,
        profile: '',
        priority: 0,
      });
    } else {
      const allowance = Number(setting('dev_login_counter_allowance'));
      await issueDevelopmentAccess(trx, {
        ...scope,
        userId: updated.id,
        allowance,
        reason: 'explicit configured development bootstrap',
        keyFamily: `development-bootstrap:${updated.id}:`,
        initialKey: `development-bootstrap:${updated.id}:${allowance}`,
      });
    }
    return scope.workspaceId;
  });
  await refreshRuntime(db, workspaceId);
  if (!config.demo.enabled) await initialize(db, env, email, catalog);
  return { skipped: false, catalog: !config.demo.enabled };
}

async function initialize(
  db: Database,
  env: Record<string, string | undefined>,
  email: string,
  catalog: typeof initializeCatalog,
) {
  const adapter = razorpaySettings(env);
  const mode =
    billingSettings(env).provider === 'razorpay' && configured(adapter) ? adapter.mode : null;
  await catalog(db, email, mode);
}

async function operatorCatalog(
  db: Database,
  env: Record<string, string | undefined>,
  email: string,
  catalog: typeof initializeCatalog,
) {
  const operator = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .where('role', '=', 'admin')
    .where('is_active', '=', true)
    .executeTakeFirst();
  if (!operator) return false;
  await initialize(db, env, email, catalog);
  return true;
}
