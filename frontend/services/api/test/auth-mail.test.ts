import { expect, it } from 'vitest';
import { sendAuthMail } from '../src/auth/mail.ts';
import { testConfig } from './support.ts';

// A fake key and a recording transport: no request leaves the process.
const config = testConfig({ RESEND_API_KEY: 'test-only-resend', AUTH_MAIL_TIMEOUT_MS: '1000' });
const recipients: string[] = [];
config.auth.fetch = async (_url, init) => {
  recipients.push(...(JSON.parse(String(init?.body)) as { to: string[] }).to);
  return new Response('{}', { status: 200 });
};

it('refuses auth mail to a reserved-domain recipient without reaching the provider', async () => {
  const outcomes: Record<string, boolean> = {};
  for (const email of [
    'person@example.test',
    'person@mail.example.invalid',
    'person@app.localhost',
    'person@example.com',
    'person@Team.Example.ORG',
    'person@example.net.',
    'person@fixtures.citeladder.com',
    'person@notexample.com',
  ])
    outcomes[email] = await sendAuthMail(config, {
      id: `mail-${email}`,
      email,
      subject: 'Verify your CiteLadder email',
      text: 'https://app.citeladder.com/verify-email',
    });

  expect(outcomes).toEqual({
    'person@example.test': false,
    'person@mail.example.invalid': false,
    'person@app.localhost': false,
    'person@example.com': false,
    'person@Team.Example.ORG': false,
    'person@example.net.': false,
    'person@fixtures.citeladder.com': true,
    'person@notexample.com': true,
  });
  expect(recipients).toEqual(['person@fixtures.citeladder.com', 'person@notexample.com']);
});
