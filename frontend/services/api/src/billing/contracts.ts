import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.ts';
import type { Selectable } from 'kysely';
import type {
  BillingAccounts,
  BillingSubscriptions,
  PendingActivations,
} from '../generated/db-schema.ts';

export type Account = Selectable<BillingAccounts>;
export type Subscription = Selectable<BillingSubscriptions>;
export type Pending = Selectable<PendingActivations>;
export const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function conflict(reason: string): never {
  throw new ApiError(409, reason, { details: { reason } });
}
export const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const identitySchema = z.object({
  name: z.string().trim().min(1).max(255),
  address_line1: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(255),
  state_code: z
    .string()
    .regex(/^(?:0[1-9]|[12][0-9]|3[0-8]|97|99)$/u)
    .nullable(),
  postal_code: z.string().trim().min(1).max(32),
  customer_gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/u)
    .nullable(),
  export_eligibility_attested: z.boolean(),
});
export type Identity = z.infer<typeof identitySchema>;
export const taxSchema = z
  .object({
    subtotal_minor: amount,
    discount_minor: amount,
    taxable_minor: amount,
    cgst_minor: amount,
    sgst_minor: amount,
    igst_minor: amount,
    tax_minor: amount,
    total_minor: amount,
    treatment: z.enum(['CGST_SGST', 'IGST', 'EXPORT_ZERO_RATED']),
    tax_rate: z.string(),
    policy_version: z.literal(1),
  })
  .refine(
    (tax) =>
      tax.subtotal_minor - tax.discount_minor === tax.taxable_minor &&
      tax.cgst_minor + tax.sgst_minor + tax.igst_minor === tax.tax_minor &&
      tax.taxable_minor + tax.tax_minor === tax.total_minor,
    'Inconsistent tax evidence',
  );
export const taxSnapshotSchema = z.object({
  customer: identitySchema,
  seller: z.record(z.string(), z.string()),
  tax: taxSchema,
});
