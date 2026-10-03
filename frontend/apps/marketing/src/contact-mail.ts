import { Resend } from 'resend';
import {
  CONTACT_EMAIL,
  CONTACT_SENDER,
  CONTACT_SEND_TIMEOUT_MS,
  type ContactSubmission,
} from '@/lib/config/contact';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

export function contactEmail(submission: ContactSubmission) {
  const fields = [
    ['Name', submission.name],
    ['Email', submission.email],
    ['Company', submission.company || 'Not provided'],
    ['Message', submission.message],
    ['Submitted from', 'citeladder.com/contact'],
  ];
  return {
    from: CONTACT_SENDER,
    to: CONTACT_EMAIL,
    replyTo: submission.email,
    subject: `CiteLadder enquiry — ${submission.name}`,
    text: `New CiteLadder enquiry\n\n${fields.map(([label, value]) => `${label}:\n${value}`).join('\n\n')}`,
    html: `<h1>New CiteLadder enquiry</h1>${fields.map(([label, value]) => `<p><strong>${label}:</strong><br>${escapeHtml(value!).replace(/\n/g, '<br>')}</p>`).join('')}`,
  };
}

export async function sendContactEmail(
  submission: ContactSubmission,
  apiKey: string,
): Promise<boolean> {
  const email = contactEmail(submission);
  // Resend deduplicates retries of an identical enquiry within its 24-hour window.
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
    console.error('Contact email delivery failed.');
    return false;
  }
  return true;
}
