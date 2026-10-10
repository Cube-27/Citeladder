import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { sql } from 'kysely';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { enforceSubjectRequest, releaseSubjectBudget } from '../abuse/usage.ts';
import { ApiError } from '../errors.ts';
import { hashPassword, verifyAccountPassword } from './password.ts';
import { recordSecurityEvent } from './security-events.ts';
import { sendAuthMail } from './mail.ts';
import { requiresEmailVerification } from './eligibility.ts';
import { safeAuthReturnPath } from '@citeladder/contracts/auth-continuation';

type Purpose = 'verification' | 'password_reset';
const cfg = policy.auth.mailbox;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () =>
  new ApiError(400, 'This link is invalid or expired. Request a new link.', {
    code: 'auth_challenge_invalid',
  });

/** Whether a mail budget admits this request; an exhausted one sends nothing, silently. */
async function withinBudget(spend: () => Promise<void>): Promise<boolean> {
  try {
    await spend();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return false;
    throw error;
  }
}

/** Uniform budgets run for absent and present addresses before lookup/provider work. */
export async function requestChallenge(
  db: Database,
  config: ServiceConfig,
  email: string,
  purpose: Purpose,
  returnTo?: string,
) {
  const normalized = email.trim().toLowerCase();
  const admitted = await withinBudget(async () => {
    await enforceSubjectRequest(db, 'email', normalized, {
      operation: 'auth.mail.cooldown',
      limit: 1,
      windowSeconds: cfg.cooldown_seconds,
    });
    await enforceSubjectRequest(db, 'email', normalized, {
      operation: 'auth.mail.daily',
      limit: cfg.recipient_daily_limit,
      windowSeconds: cfg.daily_window_seconds,
    });
  });
  if (!admitted) return;
  const issued = await db.transaction().execute(async (trx) => {
    await subjectXactLock(trx, `auth.email:${normalized}`);
    const user = await trx
      .selectFrom('users')
      .selectAll()
      .where('email', '=', normalized)
      .forUpdate()
      .executeTakeFirst();
    if (!user?.is_active || (purpose === 'verification' && !requiresEmailVerification(user)))
      return null;
    const current = await trx
      .selectFrom('auth_challenges')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('purpose', '=', purpose)
      .executeTakeFirst();
    const now = new Date();
    if (current && now.getTime() - current.created_at.getTime() < cfg.cooldown_seconds * 1000)
      return null;
    // The shared daily mail budget is spent only by mail that will be sent, so
    // requests for unknown or ineligible addresses cannot exhaust it.
    const sendable = await withinBudget(() =>
      enforceSubjectRequest(trx, 'client', 'global-mail', {
        operation: 'auth.mail.global',
        limit: cfg.global_daily_limit,
        windowSeconds: cfg.daily_window_seconds,
      }),
    );
    if (!sendable) return null;
    const token = randomBytes(32).toString('base64url');
    const row = {
      id: randomUUID(),
      user_id: user.id,
      email: user.email,
      purpose,
      token_digest: digest(token),
      created_at: now,
      consumed_at: null,
      expires_at: new Date(
        now.getTime() +
          1000 *
            (purpose === 'verification' ? cfg.verification_ttl_seconds : cfg.reset_ttl_seconds),
      ),
    };
    await trx
      .insertInto('auth_challenges')
      .values(row)
      .onConflict((conflict) => conflict.constraint('uq_auth_challenge_purpose').doUpdateSet(row))
      .execute();
    await recordSecurityEvent(trx, 'auth.challenge_issued', user.id);
    return { ...row, token };
  });
  // Equalize the bounded provider budget for eligible and ineligible recipients.
  // Keep delivery in the request: no plaintext queue or post-response CPU assumption.
  await Promise.all([
    deliverChallenge(config, issued, purpose, returnTo),
    delay(config.auth.mailKey ? config.auth.mailTimeoutMs : 0),
  ]);
}

async function deliverChallenge(
  config: ServiceConfig,
  issued: { id: string; email: string; token: string } | null,
  purpose: Purpose,
  returnTo?: string,
) {
  if (!issued) return;
  const url = new URL(
    purpose === 'verification' ? '/verify-email' : '/reset-password',
    config.auth.frontendUrl,
  );
  const continuation = safeAuthReturnPath(returnTo);
  url.hash = new URLSearchParams({
    token: issued.token,
    ...(continuation ? { return_to: continuation } : {}),
  }).toString();
  await sendAuthMail(config, {
    id: issued.id,
    email: issued.email,
    subject:
      purpose === 'verification'
        ? 'Verify your CiteLadder email'
        : 'Reset your CiteLadder password',
    text: `${purpose === 'verification' ? 'Confirm your email using your signup password. Your trial starts when you set up your workspace.' : 'Choose a new password to secure your account.'}\n${url.toString()}\nIf you did not request this, you can ignore this message.`,
  });
}

/** The per-address failed sign-in counter that a password reset clears. */
export const LOGIN_FAILURE_OPERATION = 'auth.login.email_failure';

export async function consumeChallenge(
  db: Database,
  token: string,
  password: string,
  purpose: Purpose,
) {
  const challenge = await db
    .selectFrom('auth_challenges')
    .selectAll()
    .where('token_digest', '=', digest(token))
    .where('purpose', '=', purpose)
    .executeTakeFirst();
  const user = challenge
    ? await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', challenge.user_id)
        .executeTakeFirst()
    : undefined;
  const passwordOk =
    purpose === 'password_reset' || (await verifyAccountPassword(password, user?.hashed_password));
  if (
    !challenge ||
    !user ||
    challenge.consumed_at ||
    challenge.expires_at <= new Date() ||
    !passwordOk
  )
    throw invalid();
  const replacement = purpose === 'password_reset' ? await hashPassword(password) : undefined;
  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const live = await trx
      .selectFrom('auth_challenges')
      .selectAll()
      .where('id', '=', challenge.id)
      .forUpdate()
      .executeTakeFirst();
    const now = new Date();
    if (
      !current.is_active ||
      current.email !== challenge.email ||
      !live ||
      live.consumed_at ||
      live.expires_at <= now ||
      live.token_digest !== digest(token) ||
      current.session_version !== user.session_version ||
      current.hashed_password !== user.hashed_password
    )
      throw invalid();
    // Recovery cannot activate a provider subject attached before mailbox proof.
    if (replacement && requiresEmailVerification(current))
      await trx.deleteFrom('user_identities').where('user_id', '=', current.id).execute();
    await trx
      .updateTable('users')
      .set({
        ...(replacement ? { hashed_password: replacement } : {}),
        ...(!current.email_verified_at
          ? { email_verified_at: now, email_verification_method: purpose }
          : {}),
        session_version: sql`session_version + 1`,
        updated_at: now,
      })
      .where('id', '=', user.id)
      .execute();
    await trx
      .updateTable('auth_challenges')
      .set({ consumed_at: now })
      .where('user_id', '=', user.id)
      .where('consumed_at', 'is', null)
      .execute();
    await recordSecurityEvent(
      trx,
      purpose === 'verification' ? 'auth.email_verified' : 'auth.password_reset',
      user.id,
    );
    // A completed reset proves mailbox ownership, so earlier failures stop counting.
    if (replacement)
      await releaseSubjectBudget(trx, 'email', current.email, LOGIN_FAILURE_OPERATION);
  });
}

export async function changePassword(
  db: Database,
  userId: string,
  sessionVersion: number,
  oldPassword: string,
  password: string,
) {
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (!(await verifyAccountPassword(oldPassword, user.hashed_password)))
    throw new ApiError(400, 'Current password is incorrect');
  const encoded = await hashPassword(password);
  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      !current.is_active ||
      current.session_version !== sessionVersion ||
      current.hashed_password !== user.hashed_password
    )
      throw new ApiError(401, 'Session no longer valid');
    const now = new Date();
    await trx
      .updateTable('users')
      .set({ hashed_password: encoded, session_version: sql`session_version + 1`, updated_at: now })
      .where('id', '=', userId)
      .execute();
    await trx
      .updateTable('auth_challenges')
      .set({ consumed_at: now })
      .where('user_id', '=', userId)
      .where('consumed_at', 'is', null)
      .execute();
    await recordSecurityEvent(trx, 'auth.password_changed', userId);
  });
}
