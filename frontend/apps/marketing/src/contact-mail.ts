import { Resend } from 'resend';
import {
  CONTACT_EMAIL,
  CONTACT_SENDER,
  CONTACT_SEND_TIMEOUT_MS,
  type ContactSubmission,
} from '@/lib/config/contact';
import { logWorkerError } from '@/lib/server/worker-request-log';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

export function contactEmail(submission: ContactSubmission) {
  const fields: readonly (readonly [string, string])[] = [
    ['Name', submission.name],
    ['Email', submission.email],
    ['Company', submission.company || 'Not provided'],
    ['Message', submission.message],
    ['Submitted from', 'citeladder.com/contact'],
  ];
  const textFields = fields.map(([label, value]) => `${label}:\n${value}`).join('\n\n');
  const htmlFields = fields
    .map(
      ([label, value]) =>
        `<p><strong>${label}:</strong><br>${escapeHtml(value).replaceAll('\n', '<br>')}</p>`,
    )
    .join('');
  return {
    from: CONTACT_SENDER,
    to: CONTACT_EMAIL,
    replyTo: submission.email,
    subject: `CiteLadder enquiry from ${submission.name}`,
    text: `New CiteLadder enquiry\n\n${textFields}`,
    html: `<h1>New CiteLadder enquiry</h1>${htmlFields}`,
  };
}

export async function sendContactEmail(
  submission: ContactSubmission,
  apiKey: string,
): Promise<boolean> {
  const email = contactEmail(submission);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(email)),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const { data, error } = await new Resend(apiKey).emails.send(email, {
    idempotencyKey: `contact/${key}`,
    signal: AbortSignal.timeout(CONTACT_SEND_TIMEOUT_MS),
  });
  if (error || !data?.id) {
    logWorkerError('contact_email_delivery_failed');
    return false;
  }
  return true;
}
