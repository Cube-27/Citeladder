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

/** Size and authentication precede parsing; receipt commit precedes provider I/O. */
export async function receiveWebhook(
  db: Database,
  config: ServiceConfig,
  c: Context<AppEnv>,
  provider: string,
) {
  if (provider !== 'razorpay' || !configured(config.razorpay))
    throw new ApiError(400, 'webhook_unavailable');
  const reader = c.req.raw.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > config.billing.webhookBytes) {
          await reader.cancel();
          throw new ApiError(413, 'webhook_body_too_large');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = Buffer.concat(chunks);
  const signature = c.req.header('x-razorpay-signature') ?? '';
  const settings = config.razorpay;
  const now = new Date();
  const overlap =
    settings.previousStart &&
    settings.previousEnd &&
    settings.previousStart <= now &&
    now < settings.previousEnd &&
    settings.previousEnd.getTime() - settings.previousStart.getTime() <= 86_400_000 &&
    settings.previousEnd > settings.previousStart;
  if (
    !authenticateSignature(settings.webhookSecret, bytes, signature) &&
    !(overlap && authenticateSignature(settings.previousSecret, bytes, signature))
  )
    throw new ApiError(400, 'webhook_authentication_failed');
  const eventId = c.req.header('x-razorpay-event-id')?.trim();
  if (!eventId || eventId.length > 255) throw new ApiError(400, 'webhook_event_id_required');
  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw new ApiError(400, 'webhook_payload_invalid');
  }
  const paymentEvent = parsed.event === 'payment.captured' || parsed.event === 'payment.failed';
  const entity = policy.billing.contracts.razorpay_event_types.includes(parsed.event)
    ? parsed.payload.subscription?.entity
    : parsed.event === 'refund.processed'
      ? parsed.payload.refund?.entity
      : parsed.event === 'order.paid'
        ? parsed.payload.order?.entity
        : paymentEvent && parsed.payload.payment?.entity.order_id
          ? parsed.payload.payment.entity
          : null;
  const reference = entity ? (paymentEvent ? entity.order_id : entity.id) : '';
  if (entity && !ref.safeParse(reference).success)
    throw new ApiError(400, 'webhook_reference_invalid');
  const summary = {
    reference: String(reference ?? ''),
    reference_hash: hash(String(reference ?? '')),
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
