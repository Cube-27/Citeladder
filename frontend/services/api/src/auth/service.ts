import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { provisionAccount, type User } from '../workspaces/service.ts';
import { hashPassword, verifyAccountPassword } from './password.ts';
import { recordSecurityEvent } from './security-events.ts';
import { requiresEmailVerification } from './eligibility.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { policy, type ServiceConfig } from '../config.ts';

const logger = getLogger('app.auth');
class CredentialsChanged extends Error {}

export function sessionView(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
  };
}

export function issueSession(config: ServiceConfig, user: User): Promise<string> {
  return new SignJWT({ sub: user.id, ver: user.session_version })
    .setProtectedHeader({ alg: config.session.algorithm })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.session.expireSeconds)
    .sign(new TextEncoder().encode(config.session.secretKey));
}

export async function registerUser(db: Database, email: string, password: string): Promise<void> {
  // Duplicate addresses pay the same hashing cost and receive the same response.
  const encoded = await hashPassword(password);
  const registeredId = await db.transaction().execute(async (trx) => {
    const user = await createIdentity(trx, email, encoded);
    if (user) {
      // Only a new identity spends the shared daily trial budget; exhaustion
      // rolls the identity back and is logged by the limiter.
      await enforceSubjectRequest(trx, 'client', 'global-trial', {
        operation: 'auth.trial.global',
        limit: policy.auth.mailbox.trial_daily_limit,
        windowSeconds: policy.auth.mailbox.daily_window_seconds,
      });
      const pending = await trx
        .updateTable('users')
        .set({ registration_origin: 'public' })
        .where('id', '=', user.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await provisionAccount(trx, pending);
    }
    return user?.id;
  });
  if (registeredId) logger.info('auth.registered', { user_id: registeredId });
}

/** Identity insertion only; caller explicitly chooses workspace/access provisioning. */
export async function createIdentity(db: Database, email: string, passwordHash: string) {
  await subjectXactLock(db, `auth.email:${email.trim().toLowerCase()}`);
  const now = new Date();
  return db
    .insertInto('users')
    .values({
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      hashed_password: passwordHash,
      role: 'user',
      is_active: true,
      registration_origin: 'operator',
      session_version: 0,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => conflict.column('email').doNothing())
    .returningAll()
    .executeTakeFirst();
}

export async function authenticateUser(
  db: Database,
  email: string,
  password: string,
): Promise<User | null> {
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst();
  const verified = await verifyAccountPassword(
    password,
    user?.is_active ? user.hashed_password : null,
  );
  if (!user || !verified) return null;
  if (requiresEmailVerification(user))
    throw new ApiError(403, 'Verify your email before signing in', {
      code: 'email_verification_required',
    });
  let authenticated;
  try {
    authenticated = await db.transaction().execute(async (trx) => {
      // Provisioning takes workspace/account locks before the user row, matching
      // the retained operator's workspace -> membership -> password update order.
      const workspaceId = await provisionAccount(trx, user);
      // The password may have been reset while its expensive verification ran.
      const current = await trx
        .selectFrom('users')
        .selectAll()
        .where('id', '=', user.id)
        .forNoKeyUpdate()
        .executeTakeFirstOrThrow();
      if (
        !current.is_active ||
        requiresEmailVerification(current) ||
        current.hashed_password !== user.hashed_password ||
        current.session_version !== user.session_version
      )
        throw new CredentialsChanged();
      await recordSecurityEvent(trx, 'auth.login', current.id);
      return { user: current, workspaceId };
    });
  } catch (error) {
    if (error instanceof CredentialsChanged) return null;
    throw error;
  }
  const { user: current, workspaceId } = authenticated;
  if (workspaceId)
    logger.info('auth.workspace_autocreated', { user_id: current.id, workspace_id: workspaceId });
  logger.info('auth.login_success', { user_id: current.id });
  return current;
}

export async function logoutUser(db: Database, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable('users')
      .set({ session_version: sql`session_version + 1`, updated_at: new Date() })
      .where('id', '=', userId)
      .executeTakeFirst();
    if (result.numUpdatedRows !== 1n) throw new ApiError(401, 'Session no longer valid');
    await recordSecurityEvent(trx, 'auth.logout', userId);
  });
}
