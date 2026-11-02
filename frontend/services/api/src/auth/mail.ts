import { policy, type ServiceConfig } from '../config.ts';
import { getLogger } from '../logging.ts';
import { inReservedDomain } from './reserved-domains.ts';

const cfg = policy.auth.mailbox;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

/**
 * Every CiteLadder auth and invitation mail goes through here. Caller commits
 * before sending. Acceptance is not inbox delivery. A recipient in a reserved
 * domain is refused without reaching the provider: no mailbox exists there,
 * and such addresses are test fixtures.
 */
export async function sendAuthMail(
  config: ServiceConfig,
  input: {
    id: string;
    email: string;
    subject: string;
    text: string;
    replyTo?: string;
  },
): Promise<boolean> {
  if (!config.auth.mailKey) return false;
  if (inReservedDomain(input.email)) {
    getLogger('app.auth').debug('auth.mail_reserved_recipient');
    return false;
  }
  try {
    const response = await (config.auth.fetch ?? fetch)(cfg.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(config.auth.mailTimeoutMs),
      headers: {
        Authorization: `Bearer ${config.auth.mailKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.id,
      },
      body: JSON.stringify({
        from: cfg.sender,
        reply_to: input.replyTo ?? cfg.reply_to,
        to: [input.email],
        subject: input.subject,
        text: input.text,
        html: `<p>${escapeHtml(input.text).replaceAll('\n', '<br>')}</p>`,
      }),
    });
    await response.body?.cancel();
    if (response.ok) return true;
  } catch {
    /* Never log provider bodies, addresses or bearer URLs. */
  }
  getLogger('app.auth').warning('auth.mail_failed');
  return false;
}
