import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { policy } from '../src/config.ts';
import { registerUser } from '../src/auth/service.ts';
import { notifyVerifiedSignups } from '../src/auth/signup-notifications.ts';
import { testConfig, testDatabase } from './support.ts';

const config = testConfig({ RESEND_API_KEY: 'test-only-resend', AUTH_MAIL_TIMEOUT_MS: '1000' });
const db = testDatabase(config);
const users: string[] = [];
type Sent = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
};
const sent: Sent[] = [];
let failing = false;
config.auth.fetch = async (_url, init) => {
  if (failing) return new Response('{}', { status: 500 });
  sent.push(JSON.parse(String(init?.body)));
  return new Response('{}', { status: 200 });
};
const now = new Date('2026-10-15T10:00:00Z');

async function signup(verifiedAt: Date | null) {
  const email = `${randomUUID()}@example.test`;
  await registerUser(db, email, 'test-password-secure', policy.auth.terms_revision);
  const user = await db
    .updateTable('users')
    .set({ email_verified_at: verifiedAt })
    .where('email', '=', email)
    .returning(['id', 'email'])
    .executeTakeFirstOrThrow();
  users.push(user.id);
  return user;
}
/** Other files' signups share the database; tick until a pass sends nothing. */
async function tickUntilIdle() {
  while ((await notifyVerifiedSignups(db, config, now)) > 0);
}
const noticesFor = (email: string) => sent.filter((mail) => mail.reply_to === email);

afterAll(async () => {
  for (const id of users) {
    await db.deleteFrom('security_events').where('actor_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();
  }
  await db.destroy();
});

it('tells the owner once about a recent verified signup, never an unverified or old one', async () => {
  const verified = await signup(new Date('2026-10-15T09:30:00Z'));
  const unverified = await signup(null);
  const old = await signup(new Date('2026-10-01T09:30:00Z'));

  await tickUntilIdle();
  await tickUntilIdle();

  expect(noticesFor(verified.email)).toEqual([
    {
      from: 'notifications@citeladder.com',
      to: [policy.auth.mailbox.signup_notice_recipient],
      reply_to: verified.email,
      subject: `New CiteLadder signup: ${verified.email}`,
      text: expect.stringContaining('Signed up with: email and password'),
      html: expect.any(String),
    },
  ]);
  expect(noticesFor(verified.email)[0]!.text).toContain('Verified: 2026-10-15T09:30:00.000Z');
  expect(noticesFor(unverified.email)).toEqual([]);
  expect(noticesFor(old.email)).toEqual([]);
});

it('retries a notice the provider refused on the next tick', async () => {
  const user = await signup(new Date('2026-10-15T09:45:00Z'));

  failing = true;
  await notifyVerifiedSignups(db, config, now);
  failing = false;
  expect(noticesFor(user.email)).toEqual([]);

  await tickUntilIdle();
  expect(noticesFor(user.email).map((mail) => mail.subject)).toEqual([
    `New CiteLadder signup: ${user.email}`,
  ]);
});
