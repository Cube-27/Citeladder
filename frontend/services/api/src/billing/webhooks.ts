import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { ApiError } from '../errors.ts';
import { policy } from '../config.ts';
import { getLogger } from '../logging.ts';
import { authenticateSignature, configured } from './razorpay.ts';

const logger = getLogger('api.billing');

/**
 * One ERROR record per webhook event that just entered quarantine: a
 * quarantined event needs an operator, and the monitoring alert matches this
 * event name (`infra/gcp/monitoring.tf`).
 */
export function reportQuarantined(rows: readonly { id: string; error_code: string }[]): void {
  for (const row of rows)
    logger.error('billing.webhook_quarantined', {
      webhook_event_id: row.id,
      error_code: row.error_code,
    });
}

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

async function boundedBody(c: Context<AppEnv>, limit: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  // Leaving the loop early cancels the stream.
  for await (const chunk of c.req.raw.body ?? []) {
    length += chunk.length;
    if (length > limit)
      throw new ApiError(413, 'The webhook body is too large.', { code: 'webhook_body_too_large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

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

const invalidPayload = () =>
  new ApiError(400, 'The webhook payload is not valid.', { code: 'webhook_payload_invalid' });

const PAYLOAD_KEYS: Record<string, string> = {
  'refund.processed': 'refund',
  'order.paid': 'order',
  'payment.captured': 'payment',
  'payment.failed': 'payment',
};

function eventEntity(parsed: z.infer<typeof envelope>) {
  const subscriptionEvent = policy.billing.contracts.razorpay_event_types.includes(parsed.event);
  let payloadKey = subscriptionEvent ? 'subscription' : PAYLOAD_KEYS[parsed.event];
  // A subscription charge carries its invoice; the subscription events settle it.
  // A payment with neither (a payment link or QR code) is not a checkout of ours,
  // and refusing it would make the provider disable the endpoint.
  const charge = parsed.payload.payment?.entity;
  if (payloadKey === 'payment' && (charge?.invoice_id || (charge && !charge.order_id)))
    payloadKey = undefined;
  if (!payloadKey) return { entity: null, reference: '' };
  const entity = parsed.payload[payloadKey]?.entity;
  if (!entity) throw invalidPayload();
  const reference = payloadKey === 'payment' ? entity.order_id : entity.id;
  if (!ref.safeParse(reference).success)
    throw new ApiError(400, 'The webhook does not carry a valid provider reference.', {
      code: 'webhook_reference_invalid',
    });
  return { entity, reference: String(reference) };
}

export async function receiveWebhook(
  db: Database,
  config: ServiceConfig,
  c: Context<AppEnv>,
  provider: string,
) {
  if (provider !== 'razorpay' || !configured(config.razorpay))
    throw new ApiError(400, 'Webhooks are not available for this provider.', {
      code: 'webhook_unavailable',
    });
  const bytes = await boundedBody(c, config.billing.webhookBytes);
  const settings = config.razorpay;
  const now = new Date();
  if (!authentic(settings, bytes, c.req.header('x-razorpay-signature') ?? ''))
    throw new ApiError(400, 'The webhook signature is not valid.', {
      code: 'webhook_authentication_failed',
    });
  const eventId = c.req.header('x-razorpay-event-id')?.trim();
  if (!eventId || eventId.length > 255)
    throw new ApiError(400, 'The webhook needs an event id of at most 255 characters.', {
      code: 'webhook_event_id_required',
    });
  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw invalidPayload();
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
      const quarantined = await db
        .updateTable('billing_webhook_events')
        .set({ processing_state: 'quarantined', error_code: 'event_id_digest_conflict' })
        .where('id', '=', prior.id)
        .where('processing_state', '=', 'pending')
        .returning(['id', 'error_code'])
        .execute();
      reportQuarantined(quarantined);
      throw new ApiError(400, 'This webhook event id was already received with another body.', {
        code: 'event_id_digest_conflict',
      });
    }
  }
}
