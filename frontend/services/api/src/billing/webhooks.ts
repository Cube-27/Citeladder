import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { ApiError } from '../errors.ts';
import { policy } from '../config.ts';
import { authenticateSignature, configured } from './razorpay.ts';

const envelope = z.object({
  event: z.string().max(100),
  payload: z.record(z.string(), z.object({ entity: z.record(z.string(), z.unknown()) })),
});
export const webhookSummary = z.object({
  reference: z.string().max(255),
  reference_hash: z.string(),
  status: z.string(),
});
const ref = z
  .string()
  .regex(/^(?:sub|order|rfnd)_[A-Za-z0-9]+$/u)
  .max(255);
const hash = (body: string | Uint8Array) => createHash('sha256').update(body).digest('hex');

/** Reads the raw body, refusing it as soon as it exceeds `limit` bytes. */
async function boundedBody(c: Context<AppEnv>, limit: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  // Leaving the loop early cancels the stream.
  for await (const chunk of c.req.raw.body ?? []) {
    length += chunk.length;
    if (length > limit) throw new ApiError(413, 'webhook_body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The current secret, or the previous one inside a bounded rotation overlap. */
function authentic(settings: ServiceConfig['razorpay'], bytes: Buffer, signature: string) {
  const now = new Date();
  const overlap =
    settings.previousStart &&
    settings.previousEnd &&
    settings.previousStart <= now &&
    now < settings.previousEnd &&
    settings.previousEnd.getTime() - settings.previousStart.getTime() <= 86_400_000 &&
    settings.previousEnd > settings.previousStart;
  return (
    authenticateSignature(settings.webhookSecret, bytes, signature) ||
    Boolean(overlap && authenticateSignature(settings.previousSecret, bytes, signature))
  );
}

const PAYLOAD_KEYS: Record<string, string> = {
  'refund.processed': 'refund',
  'order.paid': 'order',
  'payment.captured': 'payment',
  'payment.failed': 'payment',
};

/** The supported event's entity and provider reference; unsupported events have none. */
function eventEntity(parsed: z.infer<typeof envelope>) {
  const subscriptionEvent = policy.billing.contracts.razorpay_event_types.includes(parsed.event);
  let payloadKey = subscriptionEvent ? 'subscription' : PAYLOAD_KEYS[parsed.event];
  // A subscription charge carries its invoice; the subscription events settle it.
  if (payloadKey === 'payment' && parsed.payload.payment?.entity.invoice_id) payloadKey = undefined;
  if (!payloadKey) return { entity: null, reference: '' };
  const entity = parsed.payload[payloadKey]?.entity;
  // A supported event without its entity is malformed, not ignorable.
  if (!entity) throw new ApiError(400, 'webhook_payload_invalid');
  const reference = payloadKey === 'payment' ? entity.order_id : entity.id;
  if (!ref.safeParse(reference).success) throw new ApiError(400, 'webhook_reference_invalid');
  return { entity, reference: String(reference) };
}

/** Size and authentication precede parsing; receipt commit precedes provider I/O. */
export async function receiveWebhook(
  db: Database,
  config: ServiceConfig,
  c: Context<AppEnv>,
  provider: string,
) {
  if (provider !== 'razorpay' || !configured(config.razorpay))
    throw new ApiError(400, 'webhook_unavailable');
  const bytes = await boundedBody(c, config.billing.webhookBytes);
  const settings = config.razorpay;
  const now = new Date();
  if (!authentic(settings, bytes, c.req.header('x-razorpay-signature') ?? ''))
    throw new ApiError(400, 'webhook_authentication_failed');
  const eventId = c.req.header('x-razorpay-event-id')?.trim();
  if (!eventId || eventId.length > 255) throw new ApiError(400, 'webhook_event_id_required');
  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw new ApiError(400, 'webhook_payload_invalid');
  }
  const { entity, reference } = eventEntity(parsed);
  const summary = {
    reference,
    reference_hash: hash(reference),
    status: typeof entity?.status === 'string' ? entity.status : '',
  };
  const digest = hash(bytes);
  const inserted = await db
    .insertInto('billing_webhook_events')
    .values({
      id: randomUUID(),
      provider,
      provider_mode: settings.mode,
      external_event_id: eventId,
      event_type: parsed.event,
      payload_sha256: digest,
      safe_summary: JSON.stringify(summary),
      received_at: now,
      processed_at: entity ? null : now,
      processing_state: entity ? 'pending' : 'completed',
      result_code: entity ? '' : 'ignored',
      error_code: '',
      attempt_count: 0,
      next_attempt_at: now,
      lease_token: null,
      lease_expires_at: null,
    })
    .onConflict((k) => k.columns(['provider', 'provider_mode', 'external_event_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!inserted) {
    const prior = await db
      .selectFrom('billing_webhook_events')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_mode', '=', settings.mode)
      .where('external_event_id', '=', eventId)
      .executeTakeFirstOrThrow();
    if (prior.payload_sha256 !== digest) {
      await db
        .updateTable('billing_webhook_events')
        .set({ processing_state: 'quarantined', error_code: 'event_id_digest_conflict' })
        .where('id', '=', prior.id)
        .execute();
      throw new ApiError(400, 'event_id_digest_conflict');
    }
  }
}
