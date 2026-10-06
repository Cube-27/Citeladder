import { policy, type ServiceConfig } from '../config.ts';
import { getLogger } from '../logging.ts';

const cfg = policy.auth.mailbox;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

/** Caller commits before sending. Acceptance is not inbox delivery. */
export async function sendAuthMail(
  config: ServiceConfig,
  input: {
    id: string;
    email: string;
    subject: string;
    text: string;
  },
): Promise<boolean> {
  if (!config.auth.mailKey) return false;
  try {
    const response = await (config.auth.fetch ?? fetch)(cfg.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(cfg.timeout_ms),
      headers: {
        Authorization: `Bearer ${config.auth.mailKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.id,
      },
      body: JSON.stringify({
        from: cfg.sender,
        reply_to: cfg.reply_to,
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
