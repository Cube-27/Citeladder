// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { contactEmail, sendContactEmail } from './contact-mail';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
afterEach(() => vi.clearAllMocks());
const submission = {
  name: '<Ada>',
  email: 'ada@example.com',
  company: '',
  message: 'A <script>bad</script> & "quoted"\nSecond line',
  website: '',
};

describe('contact mail', () => {
  it('sends only to the CiteLadder inbox with visitor Reply-To and escaped HTML plus plain text', async () => {
    send.mockResolvedValue({ data: { id: 'mail-id' }, error: null });
    expect(await sendContactEmail(submission, 'test-only-key')).toBe(true);
    const mail = send.mock.calls[0]![0];
    expect(mail).toMatchObject({
      from: 'CiteLadder Website <notifications@citeladder.com>',
      to: 'contact@citeladder.com',
      replyTo: 'ada@example.com',
      subject: 'CiteLadder enquiry — <Ada>',
    });
    expect(mail.html).toContain(
      '&lt;script&gt;bad&lt;/script&gt; &amp; &quot;quoted&quot;<br>Second line',
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain(submission.message);
    expect(mail.text).toContain('Company:\nNot provided');
    expect(contactEmail(submission).text).toContain('citeladder.com/contact');
    const retryKey = send.mock.calls[0]![1].idempotencyKey;
    await sendContactEmail(submission, 'test-only-key');
    expect(send.mock.calls[1]![1].idempotencyKey).toBe(retryKey);
    await sendContactEmail({ ...submission, message: 'Another enquiry' }, 'test-only-key');
    expect(send.mock.calls[2]![1].idempotencyKey).not.toBe(retryKey);
  });

  it('treats provider rejection and missing acknowledgement as failure without logging provider data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const response of [
        { data: null, error: { message: 'private message' } },
        { data: null, error: null },
      ]) {
        send.mockResolvedValue(response);
        expect(await sendContactEmail(submission, 'test-only-key')).toBe(false);
      }
      expect(log.mock.calls.flat()).toEqual([
        'Contact email delivery failed.',
        'Contact email delivery failed.',
      ]);
    } finally {
      log.mockRestore();
    }
  });
});
