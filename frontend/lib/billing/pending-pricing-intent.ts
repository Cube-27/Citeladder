import {
  PENDING_PRICING_INTENT_KEY,
  PENDING_PRICING_INTENT_MAX_AGE_MS,
  PRICING_RETURN_PATH,
} from '@/lib/config/billing';
import { z } from 'zod';

export const billingCustomerDetailsSchema = z.object({
  billing_name: z.string(),
  billing_address_line1: z.string(),
  billing_city: z.string(),
  billing_state_code: z.string(),
  billing_postal_code: z.string(),
  customer_gstin: z.string(),
  export_eligibility_attested: z.boolean(),
});

export const pendingIntentKindSchema = z.enum(['checkout', 'addon', 'topup']);

const pendingPricingIntentSchema = z.object({
  version: z.literal(1),
  kind: pendingIntentKindSchema,
  catalog_key: z.string().min(1),
  quantity: z.number().int().min(1),
  byok: z.boolean(),
  country_code: z.string().nullable(),
  billing_details: billingCustomerDetailsSchema.nullable(),
  idempotency_key: z.string().min(1),
  return_path: z.literal(PRICING_RETURN_PATH),
  // zod 4 numbers reject Infinity and NaN.
  created_at_ms: z.number(),
});
export type PendingPricingIntentV1 = z.infer<typeof pendingPricingIntentSchema>;

function hasValidTimestamp(createdAt: number, now: number): boolean {
  return now - createdAt <= PENDING_PRICING_INTENT_MAX_AGE_MS && createdAt <= now + 60_000;
}

export function parsePendingIntent(
  raw: unknown,
  now: number = Date.now(),
): PendingPricingIntentV1 | null {
  const parsed = pendingPricingIntentSchema.safeParse(raw);
  return parsed.success && hasValidTimestamp(parsed.data.created_at_ms, now) ? parsed.data : null;
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function writePendingIntent(intent: PendingPricingIntentV1): void {
  try {
    storage()?.setItem(PENDING_PRICING_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // A blocked store only means this tab cannot resume automatically.
  }
}

export function readPendingIntent(now: number = Date.now()): PendingPricingIntentV1 | null {
  try {
    const raw = storage()?.getItem(PENDING_PRICING_INTENT_KEY);
    return raw === null || raw === undefined ? null : parsePendingIntent(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

export function clearPendingIntent(): void {
  try {
    storage()?.removeItem(PENDING_PRICING_INTENT_KEY);
  } catch {}
}

export function hasPendingIntent(now: number = Date.now()): boolean {
  return readPendingIntent(now) !== null;
}
