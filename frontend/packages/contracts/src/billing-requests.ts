import { z } from 'zod';

import { credentialModeSchema, selfServePlanKeySchema } from './billing.ts';

const nullableText = () => z.string().trim().nullable().default(null);

export const subscriptionCheckoutRequestSchema = z.strictObject({
  catalog_key: selfServePlanKeySchema,
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
  billing_state_code: nullableText(),
  customer_gstin: nullableText(),
  export_eligibility_attested: z.boolean().default(false),
});
export type SubscriptionCheckoutRequest = z.input<typeof subscriptionCheckoutRequestSchema>;

export const packPurchaseRequestSchema = z.strictObject({
  catalog_key: z.string().trim().min(1).max(64),
  quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).min(1),
});
export type PackPurchaseRequest = z.input<typeof packPurchaseRequestSchema>;

export const planChangeRequestSchema = z.strictObject({ catalog_key: selfServePlanKeySchema });
export type PlanChangeRequest = z.input<typeof planChangeRequestSchema>;

export const noCardClaimRequestSchema = z.strictObject({
  campaign_id: z.uuid(),
  terms_consent: z.boolean(),
  data_sharing_consent: z.boolean(),
  operator_code: z.string().min(16).max(255).nullable().default(null),
});

export const checkoutVerifyRequestSchema = z.strictObject({
  fields: z
    .record(z.string().regex(/^\w{1,64}$/u), z.string().max(512))
    .refine((fields) => Object.keys(fields).length <= 8),
});
export type CheckoutVerifyRequest = z.input<typeof checkoutVerifyRequestSchema>;
