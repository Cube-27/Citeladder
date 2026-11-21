import { policy, type ServiceConfig } from '../config.ts';
import { failureFacts, getLogger } from '../logging.ts';
import { inReservedDomain } from './reserved-domains.ts';

const cfg = policy.auth.mailbox;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

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
  const startedAt = performance.now();
  // Class, code and status only: never provider bodies, addresses or bearer URLs.
  let failure: Record<string, string | number | null> = {};
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
    failure = { status: response.status };
  } catch (error) {
    failure = failureFacts(error);
  }
  getLogger('app.auth').warning('auth.mail_failed', {
    ...failure,
    elapsed_ms: Math.round(performance.now() - startedAt),
  });
  return false;
}
