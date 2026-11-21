import { policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { sendAuthMail } from './mail.ts';
import { inReservedDomainSql } from './reserved-domains.ts';
import { recordSecurityEvent } from './security-events.ts';

const NOTIFIED = 'auth.signup_notified';
const cfg = policy.auth.mailbox;

function notice(user: {
  id: string;
  email: string;
  email_verification_method: string | null;
  created_at: Date;
  email_verified_at: Date;
}) {
  return {
    id: `signup-notice-${user.id}`,
    email: cfg.signup_notice_recipient,
    replyTo: user.email,
    subject: `New CiteLadder signup: ${user.email}`,
    text: [
      `Email: ${user.email}`,
      `Signed up with: ${user.email_verification_method === 'google' ? 'Google' : 'email and password'}`,
      `Registered: ${user.created_at.toISOString()}`,
      `Verified: ${user.email_verified_at.toISOString()}`,
    ].join('\n'),
  };
}

export async function notifyVerifiedSignups(
  db: Database,
  config: ServiceConfig,
  now: Date,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!config.auth.mailKey || !canAdmit()) return 0;
  const since = new Date(now.getTime() - cfg.signup_notice_window_seconds * 1000);
  const pending = await db
    .selectFrom('users')
    .select(['id', 'email', 'email_verification_method', 'created_at', 'email_verified_at'])
    .where('registration_origin', '=', 'public')
    .where('is_active', '=', true)
    .where('email_verified_at', '>', since)
    .where(({ not }) => not(inReservedDomainSql('users.email')))
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('security_events')
            .select('security_events.id')
            .whereRef('security_events.occurred_at', '>=', 'users.email_verified_at')
            .where('security_events.event', '=', NOTIFIED)
            .whereRef('security_events.target_id', '=', 'users.id'),
        ),
      ),
    )
    .orderBy('email_verified_at')
    .limit(cfg.signup_notice_batch)
    .$narrowType<{ email_verified_at: Date }>()
    .execute();
  let sent = 0;
  for (const user of pending) {
    if (!canAdmit()) break;
    // A refused send stays pending for the next tick; the key stops a duplicate.
    const accepted = await sendAuthMail(config, notice(user)); // NOSONAR -- Sequential sends.
    if (!accepted) continue;
    await recordSecurityEvent(db, NOTIFIED, user.id, null, user.id); // NOSONAR -- Marks this send.
    sent += 1;
  }
  if (sent) getLogger('app.auth').info('auth.signup_notices_sent', { count: sent });
  return sent;
}
