import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { policy } from '../config.ts';
import { amount } from './contracts.ts';
import { ApiError } from '../errors.ts';

const grants = z
  .array(
    z.object({ key: z.string(), value: amount }).refine((grant) => {
      const definition =
        policy.entitlements.capabilities[
          grant.key as keyof typeof policy.entitlements.capabilities
        ];
      if (!definition?.issuable) return false;
      if (definition.type === 'flag') return grant.value <= 1;
      return definition.type !== 'level' || grant.value < definition.levels;
    }),
  )
  .refine((rows) => new Set(rows.map((row) => row.key)).size === rows.length);
const price = z.object({
  currency: z.enum(['USD', 'INR']),
  amount_minor: amount,
  tax_behavior: z.enum(['inclusive', 'exclusive']),
  provider_price_ref: z.string().default(''),
});
const regional = price.extend({
  tax_minor: amount,
  provider_mode: z.enum(['test', 'live']),
  provider_plan_name: z.string(),
  interval: z.literal(1).default(1),
  period: z.literal('monthly').default('monthly'),
  fx_inr_per_usd: z.string(),
  tax_rate: z.string(),
  metadata: z.string(),
  tax_verified: z.boolean().default(false),
});
const plan = z.object({
  key: z.enum(['tier_1', 'tier_2', 'tier_3', 'enterprise']),
  name: z.string(),
  description: z.string(),
  cadence: z.enum(['monthly', 'custom']),
  self_serve: z.boolean(),
  contact_only: z.boolean(),
  byok_price: price.nullable(),
  funded_price: price.nullable(),
  regional_byok_prices: z.record(z.string(), regional).default({}),
  grants,
});
const item = z
  .object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    available: z.boolean(),
    eligible_plan_keys: z.array(z.string()),
    quantity_min: amount.min(1),
    quantity_max: amount.min(1),
    expiry_days: amount.min(1),
    modes: z.record(
      z.enum(['byok', 'funded']),
      z.object({
        usd_minor: amount,
        regional_prices: z.record(
          z.enum(['india', 'international']),
          price.extend({ fx_inr_per_usd: z.string().default('') }),
        ),
        grants,
      }),
    ),
  })
  .refine((row) => row.quantity_min <= row.quantity_max);
const campaign = z.object({
  key: z.literal('no_card_tier_1_intro'),
  state: z.enum(['draft', 'enabled', 'ended']),
  enabled: z.boolean(),
  claim_available: z.boolean(),
  duration_days: z.literal(7),
  plan_key: z.literal('tier_1'),
  cohort_started_at: z.string().nullable().default(null),
  ends_at: z.string().nullable().default(null),
  eligibility_policy: z.enum(['new_account', 'oauth_verified_work_email']).default('new_account'),
  operator_code_allowed: z.boolean().default(true),
});
export const catalogSchema = z
  .object({
    schema_version: z.literal(1),
    plans: z.array(plan),
    addons: z.array(item).default([]),
    topups: z.array(item).default([]),
    campaign,
    contact_sales_url: z.string(),
    platform_routes: z.array(z.record(z.string(), z.string())),
    ai_credit_policy: z.unknown().optional(),
    support_contact: z
      .object({ email: z.string(), phone: z.string().default(''), contact_url: z.string() })
      .nullable()
      .default(null),
  })
  .refine((row) => row.plans.length === 4 && new Set(row.plans.map((plan) => plan.key)).size === 4);
export type CatalogPlan = z.infer<typeof plan>;
export type CatalogItem = z.infer<typeof item>;

export async function catalog(db: Database, revision?: string) {
  let query = db.selectFrom('billing_catalog_revisions').selectAll();
  query = revision
    ? query.where('revision', '=', revision)
    : query.where('publication_state', '=', 'published');
  const row = await query.executeTakeFirst();
  if (!row) throw new ApiError(503, 'catalog_unavailable');
  return {
    revision: row.revision,
    payload: catalogSchema.parse(jsonObject(row.payload, 'billing_catalog_revisions.payload')),
  };
}

export function capabilityValue(key: string, value: number): boolean | number | string {
  const definition =
    policy.entitlements.capabilities[key as keyof typeof policy.entitlements.capabilities];
  if (!definition) throw new TypeError('Unknown stored capability');
  if (definition.type === 'flag') return value === 1;
  if (definition.type === 'level') {
    const label = definition.ordered_values[value];
    if (label === undefined) throw new TypeError('Invalid stored level');
    return label;
  }
  return value;
}
