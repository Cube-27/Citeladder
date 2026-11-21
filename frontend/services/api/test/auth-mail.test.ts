import { expect, it } from 'vitest';
import { sendAuthMail } from '../src/auth/mail.ts';
import { setLogSink } from '../src/logging.ts';
import { testConfig } from './support.ts';

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

it('reports a refused and an unreachable provider by status or class, never the address', async () => {
  const failing = testConfig({ RESEND_API_KEY: 'test-only-resend', AUTH_MAIL_TIMEOUT_MS: '1000' });
  const records: Record<string, unknown>[] = [];
  const restore = setLogSink((line) => records.push(JSON.parse(line) as Record<string, unknown>));
  const send = () =>
    sendAuthMail(failing, {
      id: 'mail-failing',
      email: 'person@fixtures.citeladder.com',
      subject: 'Verify your CiteLadder email',
      text: 'https://app.citeladder.com/verify-email',
    });
  let sent: boolean[];
  try {
    failing.auth.fetch = async () => new Response('provider body', { status: 422 });
    const refused = await send();
    failing.auth.fetch = async () => {
      throw new TypeError('fetch failed for person@fixtures.citeladder.com');
    };
    sent = [refused, await send()];
  } finally {
    setLogSink(restore);
  }
  expect(sent).toEqual([false, false]);
  const failures = records.filter((entry) => entry.event === 'auth.mail_failed');
  expect(failures).toEqual([
    expect.objectContaining({ status: 422 }),
    expect.objectContaining({ error_class: 'TypeError', error_code: null }),
  ]);
  expect(JSON.stringify(failures)).not.toContain('person@');
  expect(JSON.stringify(failures)).not.toContain('provider body');
});
