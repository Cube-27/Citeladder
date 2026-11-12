/**
 * Request bodies of the commercial billing routes. A request names a catalog
 * key, a quantity, a credential mode and bounded billing evidence, never an
 * amount. These own the wire shape; the API `.extend`s the billing evidence
 * with its stored-identity format checks, and the browser types its arguments
 * as `z.input` of them.
 */
import { z } from 'zod';

import { credentialModeSchema } from './billing.ts';

const selfServePlanKey = () => z.enum(['tier_1', 'tier_2', 'tier_3']);
const nullableText = () => z.string().trim().nullable().default(null);

/** Start a base-plan checkout, with the customer evidence that decides GST or export. */
export const subscriptionCheckoutRequestSchema = z.strictObject({
  catalog_key: selfServePlanKey(),
  credential_mode: credentialModeSchema,
  country_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/u),
  billing_name: z.string().trim().min(1).max(160),
  billing_address_line1: z.string().trim().min(1).max(240),
  billing_city: z.string().trim().min(1).max(100),
  billing_postal_code: z.string().trim().toUpperCase().min(1).max(24),
  // Indian billing only; elsewhere null.
  billing_state_code: nullableText(),
  customer_gstin: nullableText(),
  export_eligibility_attested: z.boolean().default(false),
});
export type SubscriptionCheckoutRequest = z.input<typeof subscriptionCheckoutRequestSchema>;

/** An add-on or top-up order by catalog key and quantity. */
export const packPurchaseRequestSchema = z.strictObject({
  catalog_key: z.string().trim().min(1).max(64),
  quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).min(1),
});
export type PackPurchaseRequest = z.input<typeof packPurchaseRequestSchema>;

/** A base-plan change; the server decides the direction and prices an upgrade. */
export const planChangeRequestSchema = z.strictObject({ catalog_key: selfServePlanKey() });
export type PlanChangeRequest = z.input<typeof planChangeRequestSchema>;

/** Claiming the no-card early-access offer, with both explicit consents. */
export const noCardClaimRequestSchema = z.strictObject({
  campaign_id: z.uuid(),
  terms_consent: z.boolean(),
  data_sharing_consent: z.boolean(),
  operator_code: z.string().min(16).max(255).nullable().default(null),
});

/**
 * A provider's browser callback, in the NEUTRAL wrapper the API accepts. The
 * field names inside are the vendor's own; the shared controller never reads
 * them, and the originating adapter allowlists exactly the ones it accepts
 * before checking any signature.
 */
export const checkoutVerifyRequestSchema = z.strictObject({
  fields: z
    .record(z.string().regex(/^\w{1,64}$/u), z.string().max(512))
    .refine((fields) => Object.keys(fields).length <= 8),
});
export type CheckoutVerifyRequest = z.input<typeof checkoutVerifyRequestSchema>;
