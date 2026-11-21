import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

export const planCatalogKeySchema = z.enum(['tier_1', 'tier_2', 'tier_3', 'enterprise']);
export type PlanCatalogKey = z.infer<typeof planCatalogKeySchema>;
export const selfServePlanKeySchema = planCatalogKeySchema.exclude(['enterprise']);
export type SelfServePlanKey = z.infer<typeof selfServePlanKeySchema>;
export const credentialModeSchema = z.enum(['byok', 'funded']);
export type CredentialMode = z.infer<typeof credentialModeSchema>;
export const billingRegionSchema = z.enum(['india', 'international']);
export type BillingRegion = z.infer<typeof billingRegionSchema>;
export const currencySchema = z.enum(['USD', 'INR']);
export type Currency = z.infer<typeof currencySchema>;
export const providerModeSchema = z.enum(['test', 'live']);
export type ProviderMode = z.infer<typeof providerModeSchema>;
export const taxTreatmentSchema = z.enum(['CGST_SGST', 'IGST', 'EXPORT_ZERO_RATED']);
export type TaxTreatment = z.infer<typeof taxTreatmentSchema>;
export const taxBehaviorSchema = z.enum(['inclusive', 'exclusive']);
export const subscriptionStatusSchema = z.enum([
  'pending',
  'trialing',
  'active',
  'past_due',
  'cancel_scheduled',
  'cancelled',
  'unpaid',
  'expired',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
const catalogAvailabilitySchema = z.enum(['available', 'unavailable']);
const grantSourceKindSchema = z.enum(['plan', 'addon', 'topup', 'trial', 'override']);
const entitlementStatusSchema = z.enum(['resolved', 'entitlement_unresolved']);
const capabilityTypeSchema = z.enum([
  'flag',
  'counter.occupancy',
  'counter.consumable',
  'counter.rate',
  'level',
]);
const counterCapabilityTypeSchema = z.enum([
  'counter.occupancy',
  'counter.consumable',
  'counter.rate',
]);
const limitStateSchema = z.enum(['finite', 'unlimited', 'unknown']);
const activationKindSchema = z.enum(['base', 'addon', 'topup', 'upgrade']);
const activationStatusSchema = z.enum(['pending', 'activated', 'failed', 'abandoned']);

export const moneySchema = responseObject({
  currency: currencySchema,
  amount_minor: z.number().int().nonnegative(),
});

export const resolvedQuoteSchema = responseObject({
  quote_id: z.string(),
  catalog_revision: z.string(),
  catalog_key: z.string(),
  credential_mode: credentialModeSchema,
  country_code: z.string(),
  region: billingRegionSchema,
  base_price: moneySchema,
  subtotal_price: moneySchema,
  discount: moneySchema,
  taxable_value: moneySchema,
  tax: moneySchema,
  tax_treatment: taxTreatmentSchema,
  tax_rate: z.string(),
  cgst: moneySchema,
  sgst: moneySchema,
  igst: moneySchema,
  tax_policy_version: z.number().int().nonnegative(),
  total_price: moneySchema,
  expires_at: z.string(),
});

const capabilityValueSchema = responseObject({
  key: z.string(),
  capability_type: capabilityTypeSchema,
  value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
  issuable: z.boolean(),
});

const catalogProviderRouteSchema = responseObject({
  logical_engine: z.string(),
  transport_provider: z.string(),
  model: z.string(),
});

const catalogProviderSchema = responseObject({
  key: z.string(),
  label: z.string(),
  availability: catalogAvailabilitySchema,
  unavailable_reason: z.string().nullable(),
  adapter_shipped: z.boolean(),
  grant_key: z.string(),
  issuable: z.boolean(),
  routes: z.array(catalogProviderRouteSchema),
});

const catalogPlanSchema = responseObject({
  key: planCatalogKeySchema,
  name: z.string(),
  description: z.string(),
  cadence: z.enum(['monthly', 'custom']),
  self_serve: z.boolean(),
  contact_only: z.boolean(),
  contact_url: z.string().nullable(),
  base_price: moneySchema.nullable(),
  funded_total_price: moneySchema.nullable(),
  checkout_available: z.boolean(),
  funded_checkout_available: z.boolean(),
  unavailable_reason: z.string().nullable(),
  capabilities: z.array(capabilityValueSchema),
  trial_availability: catalogAvailabilitySchema,
  trial_unavailable_reason: z.string().nullable(),
  trial_days: z.number().int().nullable(),
});

const catalogItemSchema = responseObject({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  unit_price: moneySchema.nullable(),
  quantity_min: z.number().int(),
  quantity_max: z.number().int(),
  availability: catalogAvailabilitySchema,
  unavailable_reason: z.string().nullable(),
  grants_per_unit: z.array(responseObject({ key: z.string(), value: z.number().int() })),
  eligible_plan_keys: z.array(planCatalogKeySchema),
  expiry_days: z.number().int(),
});

const catalogAddonSchema = catalogItemSchema;

const catalogTopupSchema = catalogItemSchema;

const catalogSupportContactSchema = responseObject({
  email: z.string(),
  phone: z.string().nullable(),
  contact_url: z.string(),
});

export const workspaceEntitlementSchema = responseObject({
  workspace_id: uuid(),
  status: entitlementStatusSchema,
  registry_revision: z.string(),
  entitlement_lifecycle_version: z.number().int().nonnegative(),
  valid_until: z.string().nullable(),
  credential_mode: credentialModeSchema,
  capabilities: z.array(
    responseObject({
      key: z.string(),
      type: capabilityTypeSchema,
      value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
      valid_until: z.string().nullable(),
      provenance: z.literal('effective_grant'),
    }),
  ),
  occupancy: z.array(
    responseObject({
      key: z.string(),
      allowance: z.number().int(),
      consumed: z.number().int(),
      remaining: z.number().int(),
    }),
  ),
  site_health: responseObject({
    sample_url_limit: z.number().int().nonnegative(),
    count_disclosure: z.boolean(),
  }),
});

export const noCardOfferSchema = responseObject({
  campaign_id: uuid(),
  status: z.enum(['available', 'unavailable', 'already_claimed', 'ineligible']),
  tier_key: z.literal('tier_1'),
  duration_days: z.number().int().positive(),
  eligibility_policy: z.enum(['new_account', 'oauth_verified_work_email']),
  operator_code_allowed: z.boolean(),
  unavailable_reason: z.string().nullable(),
});

export const noCardClaimSchema = responseObject({
  campaign_id: uuid(),
  grant_id: uuid(),
  tier_key: z.literal('tier_1'),
  starts_at: z.string(),
  expires_at: z.string(),
  charged: z.literal(false),
  renews: z.literal(false),
});

export const introductoryEndSchema = responseObject({
  status: z.literal('ended'),
  ended_at: z.string(),
});

export const billingCatalogSchema = responseObject({
  catalog_revision: z.string(),
  country_code: z.string().nullable(),
  region: billingRegionSchema,
  currency: currencySchema,
  currency_minor_units: z.number().int(),
  plans: z.array(catalogPlanSchema),
  addons: z.array(catalogAddonSchema),
  topups: z.array(catalogTopupSchema),
  providers: z.array(catalogProviderSchema),
  support_contact: catalogSupportContactSchema.nullable(),
});

const grantProvenanceSchema = responseObject({
  grant_id: uuid(),
  source_kind: grantSourceKindSchema,
  key: z.string(),
  value: z.number().int(),
  valid_from: z.string(),
  effective_valid_until: z.string().nullable(),
  revoked_at: z.string().nullable(),
  catalog_revision: z.string(),
});

const resolvedCapabilitySchema = responseObject({
  key: z.string(),
  capability_type: capabilityTypeSchema,
  value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
  contributing_grant_ids: z.array(uuid()),
  ordered_draw_grant_ids: z.array(uuid()),
});

const scheduledPlanChangeSchema = responseObject({
  direction: z.enum(['upgrade', 'downgrade']),
  catalog_key: z.string(),
  effective_at: z.string(),
  state: z.enum(['requested', 'scheduled', 'provider_rejected']),
});

const subscriptionSummarySchema = responseObject({
  catalog_key: z.string(),
  credential_mode: credentialModeSchema,
  status: subscriptionStatusSchema,
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  resumable_until: z.string().nullable(),
  scheduled_change: scheduledPlanChangeSchema.nullable(),
});

const trialGrantSummarySchema = responseObject({
  deadline: z.string(),
  days_remaining: z.number().int(),
  exhausted: z.boolean(),
});

export const billingEntitlementSchema = responseObject({
  billing_account_id: uuid(),
  status: entitlementStatusSchema,
  errors: z.array(z.string()),
  registry_revision: z.string(),
  entitlement_lifecycle_version: z.number().int(),
  resolved_at: z.string(),
  valid_until: z.string().nullable(),
  subscription: subscriptionSummarySchema.nullable(),
  trial_grant: trialGrantSummarySchema.nullable(),
  capabilities: z.array(resolvedCapabilitySchema),
  grants: z.array(grantProvenanceSchema),
});

const usageGrantBalanceSchema = responseObject({
  grant_id: uuid(),
  source_kind: grantSourceKindSchema,
  allowance: z.number().int(),
  consumed: z.number().int(),
  reserved: z.number().int(),
  remaining: z.number().int(),
  effective_valid_until: z.string().nullable(),
});

const usageItemSchema = responseObject({
  key: z.string(),
  capability_type: counterCapabilityTypeSchema,
  unit: z.string(),
  limit_state: limitStateSchema,
  allowance: z.number().int().nullable(),
  consumed: z.number().int().nullable(),
  reserved: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  window_started_at: z.string().nullable(),
  resets_at: z.string().nullable(),
  earliest_expiry: z.string().nullable(),
  grants: z.array(usageGrantBalanceSchema),
});

export const billingUsageSchema = responseObject({
  billing_account_id: uuid(),
  entitlement_lifecycle_version: z.number().int(),
  status: entitlementStatusSchema,
  items: z.array(usageItemSchema),
});

export const activationSchema = responseObject({
  activation_id: uuid(),
  kind: activationKindSchema,
  catalog_key: z.string(),
  quantity: z.number().int(),
  status: activationStatusSchema,
  quote: resolvedQuoteSchema,
  expires_at: z.string(),
  failure_code: z.string().nullable(),
});

export const planChangeSchema = responseObject({
  direction: z.enum(['upgrade', 'downgrade']),
  catalog_key: z.string(),
  status: z.enum(['payment_required', 'requested', 'scheduled']),
  effective_at: z.string(),
  activation: activationSchema.nullable(),
});

export const subscriptionChangeSchema = responseObject({
  catalog_key: z.string(),
  status: z.enum(['cancellation_scheduled', 'already_scheduled', 'resumed', 'nothing_to_resume']),
  effective_at: z.string(),
});

export const providerConnectionStateSchema = z.enum([
  'connected',
  'missing',
  'failed',
  'unavailable',
]);

const providerProbeSchema = responseObject({
  status: z.enum(['ok', 'failed']),
  safe_reason: z.string().nullable(),
  tested_at: z.string(),
  model: z.string().nullable(),
  latency_ms: z.number().int().nullable(),
});

export const providerConnectionStateEntrySchema = responseObject({
  key: z.string(),
  label: z.string(),
  state: providerConnectionStateSchema,
  safe_reason: z.string().nullable(),
  grant_key: z.string(),
  latest_probe: providerProbeSchema.nullable(),
});

export const providerConnectionStatesSchema = responseObject({
  workspace_id: uuid(),
  providers: z.array(providerConnectionStateEntrySchema),
});

export const subscriptionCheckoutSchema = responseObject({
  activation_id: uuid(),
  provider: z.string(),
  provider_mode: providerModeSchema,
  sdk_name: z.literal('razorpay-checkout'),
  public_key: z.string(),
  reference: z.string(),
  reference_kind: z.enum(['subscription', 'order', '']),
  expires_at: z.string(),
  quote: resolvedQuoteSchema,
});

export const billingInvoiceSchema = responseObject({
  invoice_id: z.string(),
  invoice_number: z.string(),
  receipt_number: z.string(),
  document_kind: z.enum(['gst_tax_receipt', 'export_receipt', 'credit_note']),
  status: z.enum(['paid', 'credited']),
  description: z.string(),
  original_invoice_number: z.string().nullable(),
  paid_at: z.string(),
  amount_paid: moneySchema,
  subtotal_price: moneySchema,
  discount: moneySchema,
  taxable_value: moneySchema,
  tax_treatment: taxTreatmentSchema,
  tax_rate: z.string(),
  cgst: moneySchema,
  sgst: moneySchema,
  igst: moneySchema,
  payment_id: z.string().nullable(),
});

export const billingInvoiceListSchema = responseObject({ invoices: z.array(billingInvoiceSchema) });

export const billingInvoicesSchema = z.union([
  z.array(billingInvoiceSchema),
  billingInvoiceListSchema.transform((value) => value.invoices),
]);

export type ProviderConnectionState = z.infer<typeof providerConnectionStateSchema>;
export type ProviderConnectionStateEntry = z.infer<typeof providerConnectionStateEntrySchema>;
export type SiteHealthEntitlement = z.infer<typeof workspaceEntitlementSchema>['site_health'];
