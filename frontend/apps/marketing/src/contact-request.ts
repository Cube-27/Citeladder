import type { ZodError } from 'zod';
import {
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TURNSTILE_ACTION,
  contactRequestSchema,
  type ContactSubmission,
} from '@/lib/config/contact';
import { verifyTurnstile } from './turnstile';

type SendContact = (submission: ContactSubmission) => Promise<boolean>;
type ContactLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type ContactRateLimits = {
  ip?: ContactLimiter;
  burst?: ContactLimiter;
};
export type ContactChallenge = {
  /** Turnstile secret; without it the intake fails closed. */
  secret: string | undefined;
  hostnames: readonly string[];
};
function result(status: number, outcome: string, fields?: Record<string, string>): Response {
  return Response.json(
    { outcome, ...(fields ? { fields } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validationError(error: ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (['name', 'email', 'company', 'message'].includes(field)) fields[field] ??= issue.message;
  }
  return result(400, 'validation_error', fields);
}

async function readPayload(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CONTACT_MAX_BODY_BYTES) throw new Error('Body too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function handleContactRequest(
  request: Request,
  send: SendContact,
  limits: ContactRateLimits,
  challenge: ContactChallenge,
): Promise<Response> {
  if (request.method !== 'POST') return result(405, 'validation_error');
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return result(403, 'spam_rejected');
  if (
    request.headers.get('content-type')?.split(';')[0]!.trim().toLowerCase() !== 'application/json'
  )
    return result(400, 'validation_error');
  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return result(400, 'validation_error');
  }
  const parsed = contactRequestSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);
  const { turnstile_token: token, ...submission } = parsed.data;
  if (submission.website.trim()) return result(403, 'spam_rejected');
  try {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return result(403, 'spam_rejected');
    if (!limits.ip || !limits.burst) return result(503, 'send_failed');
    if (!challenge.secret) {
      console.error('Contact verification is not configured.');
      return result(503, 'send_failed');
    }
    if (
      !(await limits.ip.limit({ key: ip })).success ||
      !(await limits.burst.limit({ key: '/api/v1/contact' })).success
    )
      return result(429, 'rate_limited');
    const verified = await verifyTurnstile({
      secret: challenge.secret,
      token,
      ip,
      action: CONTACT_TURNSTILE_ACTION,
      hostnames: challenge.hostnames,
    });
    if (!verified) return result(403, 'verification_failed');
    return (await send(submission)) ? result(200, 'success') : result(503, 'send_failed');
  } catch {
    console.error('Contact email delivery failed.');
    return result(503, 'send_failed');
  }
}
