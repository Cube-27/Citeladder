import { randomUUID } from 'node:crypto';
import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { ApiError } from '../errors.ts';
import { sendAuthMail } from '../auth/mail.ts';

/** Issuance has already committed; a failed send retains the copy-link fallback. */
export async function deliverInvitation<
  T extends { invitation: { email: string; expires_at: string }; token: string },
>(db: Database, config: ServiceConfig, issued: T) {
  const cfg = policy.auth.mailbox;
  try {
    await enforceSubjectRequest(db, 'email', issued.invitation.email, {
      operation: 'auth.mail.cooldown',
      limit: 1,
      windowSeconds: cfg.cooldown_seconds,
    });
    await enforceSubjectRequest(db, 'email', issued.invitation.email, {
      operation: 'auth.mail.daily',
      limit: cfg.recipient_daily_limit,
      windowSeconds: cfg.daily_window_seconds,
    });
    await enforceSubjectRequest(db, 'client', 'global-mail', {
      operation: 'auth.mail.global',
      limit: cfg.global_daily_limit,
      windowSeconds: cfg.daily_window_seconds,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429)
      return { ...issued, delivery: 'failed' as const };
    throw error;
  }
  const url = new URL('/invitations/accept', config.auth.frontendUrl);
  url.searchParams.set('token', issued.token);
  const accepted = await sendAuthMail(config, {
    id: randomUUID(),
    email: issued.invitation.email,
    subject: 'Your CiteLadder workspace invitation',
    text: `Sign in with this email address to accept your invitation. This link expires at ${issued.invitation.expires_at}.\n${url.toString()}`,
  });
  return { ...issued, delivery: accepted ? ('accepted' as const) : ('failed' as const) };
}
