import { randomUUID } from 'node:crypto';
import type { ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { budget, spendBudget } from '../abuse/usage.ts';
import { ApiError } from '../errors.ts';
import { GLOBAL_MAIL_SUBJECT } from '../config/abuse.ts';
import { sendAuthMail } from '../auth/mail.ts';

export async function deliverInvitation<
  T extends { invitation: { email: string; expires_at: string }; token: string },
>(db: Database, config: ServiceConfig, issued: T) {
  try {
    await spendBudget(db, budget('mail_cooldown'), issued.invitation.email);
    await spendBudget(db, budget('mail_recipient_daily'), issued.invitation.email);
    await spendBudget(db, budget('mail_global_daily'), GLOBAL_MAIL_SUBJECT);
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
