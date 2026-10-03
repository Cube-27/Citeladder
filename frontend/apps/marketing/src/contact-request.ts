import {
  CONTACT_MAX_BODY_BYTES,
  contactSubmissionSchema,
  type ContactSubmission,
} from '@/lib/config/contact';

type SendContact = (submission: ContactSubmission) => Promise<boolean>;
function result(status: number, outcome: string, fields?: Record<string, string>): Response {
  return Response.json(
    { outcome, ...(fields ? { fields } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
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

export async function handleContactRequest(request: Request, send: SendContact): Promise<Response> {
  if (request.method !== 'POST') return result(405, 'validation_error');
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return result(403, 'spam_rejected');
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return result(400, 'validation_error');
  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return result(400, 'validation_error');
  }
  const parsed = contactSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (['name', 'email', 'company', 'message'].includes(field)) fields[field] ??= issue.message;
    }
    return result(400, 'validation_error', fields);
  }
  if (parsed.data.website.trim()) return result(403, 'spam_rejected');
  try {
    return (await send(parsed.data)) ? result(200, 'success') : result(503, 'send_failed');
  } catch {
    console.error('Contact email delivery failed.');
    return result(503, 'send_failed');
  }
}
