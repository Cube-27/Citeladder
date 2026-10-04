import { z } from 'zod';
import { createHash } from 'node:crypto';
import { policy } from '../config.ts';
import { catalogAuthoring as cfg } from '../config/billing-authoring.ts';
import { catalogSchema } from './catalog.ts';
import { creditPolicy } from './ai-credits.ts';
import { billingSettings, type BillingSettings } from './config.ts';
import { compareText } from '../text-order.ts';

/** Decimal strings are converted to rational integers, never binary floating-point money. */
function fraction(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match || value.length > 100) throw new Error('invalid_decimal_rate');
  const places = match[2] ?? '';
  return { numerator: BigInt(match[1]! + places), denominator: 10n ** BigInt(places.length) };
}
function safeAmount(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('amount_overflow');
  return Number(value);
}
export function inrMinor(usdMinor: number, rate: string): number {
  if (!Number.isSafeInteger(usdMinor) || usdMinor <= 0) throw new Error('invalid_usd_amount');
  const { numerator, denominator } = fraction(rate);
  if (!numerator) throw new Error('invalid_authoring_rate');
  const divisor = denominator * 10000n;
  const steps = (BigInt(usdMinor) * numerator + divisor - 1n) / divisor;
  return safeAmount((steps * 100n - 1n) * 100n);
}
export function taxMinor(minor: number, rate: string): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('invalid_tax_amount');
  const { numerator, denominator } = fraction(rate);
  if (numerator > denominator) throw new Error('invalid_tax_rate');
  return safeAmount((BigInt(minor) * numerator * 2n + denominator) / (denominator * 2n));
}

const units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const grant = z.strictObject({ key: z.string(), value: units }).refine(({ key, value }) => {
  const def =
    policy.entitlements.capabilities[key as keyof typeof policy.entitlements.capabilities];
  return (
    Boolean(def?.issuable) &&
    (def?.type !== 'flag' || value <= 1) &&
    (def?.type !== 'level' || value < def.levels)
  );
});
const grants = z
  .array(grant)
  .refine((rows) => new Set(rows.map((row) => row.key)).size === rows.length);
const basePrice = z.strictObject({
  currency: z.literal('USD'),
  amount_minor: units,
  tax_behavior: z.literal('inclusive'),
  provider_price_ref: z.string().default(''),
});
const regionalPrice = z.strictObject({
  currency: z.enum(['USD', 'INR']),
  amount_minor: units.min(100),
  tax_behavior: z.enum(['inclusive', 'exclusive']),
  tax_minor: units,
  provider_price_ref: z.string().default(''),
  provider_mode: z.enum(['test', 'live']),
  provider_plan_name: z.string().min(1).max(255),
  interval: z.literal(1).default(1),
  period: z.literal('monthly').default('monthly'),
  fx_inr_per_usd: z.string(),
  tax_rate: z.string(),
  metadata: z.string(),
  tax_verified: z.boolean().default(false),
});
const plan = z.strictObject({
  ...catalogSchema.shape.plans.element.shape,
  byok_price: basePrice.nullable(),
  funded_price: basePrice.nullable(),
  regional_byok_prices: z
    .partialRecord(z.enum(['india', 'international']), regionalPrice)
    .default({}),
  grants,
});
const itemPrice = z.strictObject({
  currency: z.enum(['USD', 'INR']),
  amount_minor: units.min(100),
  tax_behavior: z.enum(['inclusive', 'exclusive']),
  fx_inr_per_usd: z.string().default(''),
});
const terms = z.strictObject({
  usd_minor: units.min(100),
  regional_prices: z.partialRecord(z.enum(['india', 'international']), itemPrice),
  grants: grants.min(1),
});
const item = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
  name: z.string().min(1).max(80),
  description: z.string().max(255),
  available: z.boolean(),
  eligible_plan_keys: z.array(z.enum(['tier_1', 'tier_2', 'tier_3'])).min(1),
  quantity_min: units.min(1),
  quantity_max: units.min(1).max(100),
  expiry_days: units.min(1).max(366),
  modes: z.partialRecord(z.enum(['byok', 'funded']), terms),
});
const authoringSchema = z.strictObject({
  ...catalogSchema.shape,
  plans: z.array(plan),
  addons: z.array(item).default([]),
  topups: z.array(item).default([]),
  campaign: z.strictObject({
    ...catalogSchema.shape.campaign.shape,
    cohort_started_at: z.iso.datetime({ offset: true }).nullable().default(null),
    ends_at: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
  platform_routes: z.array(
    z.strictObject({
      logical_engine: z.string(),
      transport_provider: z.string(),
      model: z.string(),
      credential_ref: z
        .string()
        .trim()
        .min(1)
        .refine((value) => !/(sk-|secret|password)/iu.test(value)),
    }),
  ),
  ai_credit_policy: creditPolicy.nullable().default(null),
  support_contact: z
    .strictObject({
      email: z.email().max(254),
      phone: z.string().max(32).default(''),
      contact_url: z.url().startsWith('https://').max(255),
    })
    .nullable()
    .default(null),
});
export type AuthoredCatalog = z.infer<typeof authoringSchema>;
/** Preserve compact sorted ASCII catalog checksums produced by the retired author. */
export function catalogDigest(payload: AuthoredCatalog) {
  const keys = new Set<string>();
  JSON.stringify(payload, (key, value: unknown) => {
    if (key) keys.add(key);
    return value;
  });
  const encoded = JSON.stringify(payload, [...keys].sort(compareText)).replace(
    /[\u0080-\uffff]/g,
    (char) => String.raw`\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );
  return createHash('sha256').update(encoded).digest('hex');
}
type AuthoredPlan = AuthoredCatalog['plans'][number];
type AuthoredItem = AuthoredCatalog['addons'][number];
type RegionalPrice = z.infer<typeof regionalPrice>;

function validatePlanShape(row: AuthoredPlan) {
  if (row.contact_only) {
    if (row.self_serve || row.byok_price || row.funded_price || row.grants.length)
      throw new Error('catalog_plan_shape_invalid');
    return;
  }
  if (!row.byok_price) throw new Error('catalog_plan_shape_invalid');
}

function validatePlanBundle(row: AuthoredPlan) {
  if (
    row.byok_price &&
    row.funded_price &&
    row.funded_price.amount_minor < row.byok_price.amount_minor
  )
    throw new Error('funded_below_byok');
  const hasAgent = row.grants.some((g) => g.key === 'agent');
  if (row.key === 'tier_1' && hasAgent) throw new Error('catalog_agent_bundle_invalid');
  if (['tier_2', 'tier_3'].includes(row.key) && !hasAgent)
    throw new Error('catalog_agent_bundle_invalid');
}

function validateRegionalPrice(region: string, price: RegionalPrice, usdMinor: number) {
  if (region === 'international') {
    if (
      price.currency !== 'USD' ||
      price.amount_minor !== usdMinor ||
      price.tax_minor ||
      price.tax_behavior !== 'inclusive'
    )
      throw new Error('international_price_invalid');
    return;
  }
  const expected = inrMinor(usdMinor, price.fx_inr_per_usd);
  if (
    price.currency !== 'INR' ||
    price.tax_behavior !== 'exclusive' ||
    price.amount_minor !== expected ||
    price.tax_minor !== taxMinor(expected, price.tax_rate)
  )
    throw new Error('india_price_invalid');
}

function validatePlanPrices(row: AuthoredPlan): string[] {
  const refs: string[] = [];
  for (const [region, price] of Object.entries(row.regional_byok_prices)) {
    if (!price) continue;
    if (!row.byok_price || row.contact_only) throw new Error('contact_only_regional_price');
    if (price.provider_price_ref) refs.push(price.provider_price_ref);
    validateRegionalPrice(region, price, row.byok_price.amount_minor);
  }
  return refs;
}

function validateItem(row: AuthoredItem) {
  if (
    row.quantity_min > row.quantity_max ||
    !row.modes.byok ||
    new Set(row.eligible_plan_keys).size !== row.eligible_plan_keys.length
  )
    throw new Error('catalog_item_invalid');
  for (const mode of Object.values(row.modes).filter((value) => value !== undefined))
    for (const [region, price] of Object.entries(mode.regional_prices)) {
      if (!price) continue;
      validateItemPrice(region, price, mode.usd_minor);
    }
}

function validateItemPrice(region: string, price: z.infer<typeof itemPrice>, usdMinor: number) {
  if (region === 'international') {
    if (
      price.currency !== 'USD' ||
      price.tax_behavior !== 'inclusive' ||
      price.amount_minor !== usdMinor
    )
      throw new Error('catalog_item_price_invalid');
    return;
  }
  if (
    price.currency !== 'INR' ||
    price.tax_behavior !== 'exclusive' ||
    price.amount_minor !== inrMinor(usdMinor, price.fx_inr_per_usd)
  )
    throw new Error('catalog_item_price_invalid');
}

function validateTopup(row: AuthoredItem) {
  for (const mode of Object.values(row.modes).filter((value) => value !== undefined))
    for (const g of mode.grants) {
      if (
        policy.entitlements.capabilities[g.key as keyof typeof policy.entitlements.capabilities]
          .type !== 'counter.consumable'
      )
        throw new Error('topup_requires_consumable');
    }
}

function validateCampaign(payload: AuthoredCatalog) {
  const c = payload.campaign;
  const active = c.state === 'enabled';
  if (
    c.enabled !== active ||
    c.claim_available !== active ||
    (active && !c.cohort_started_at) ||
    (c.ends_at &&
      (!c.cohort_started_at || Date.parse(c.ends_at) <= Date.parse(c.cohort_started_at)))
  )
    throw new Error('campaign_lifecycle_invalid');
  if (active && !payload.plans.find((p) => p.key === c.plan_key)?.grants.length)
    throw new Error('campaign_bundle_missing');
}

export function validateCatalog(input: unknown): AuthoredCatalog {
  const payload = authoringSchema.parse(input);
  if (payload.plans.length !== 4 || new Set(payload.plans.map((row) => row.key)).size !== 4)
    throw new Error('catalog_plan_set_invalid');
  const refs = payload.plans.flatMap((row) => {
    validatePlanShape(row);
    validatePlanBundle(row);
    return validatePlanPrices(row);
  });
  if (new Set(refs).size !== refs.length) throw new Error('provider_plan_reference_shared');
  const items = [...payload.addons, ...payload.topups];
  if (new Set(items.map((row) => row.key)).size !== items.length)
    throw new Error('catalog_item_keys_duplicate');
  items.forEach(validateItem);
  payload.topups.forEach(validateTopup);
  validateCampaign(payload);
  return payload;
}

function level(key: string, label: string) {
  const definition =
    policy.entitlements.capabilities[key as keyof typeof policy.entitlements.capabilities];
  const values: readonly string[] = definition.ordered_values;
  const value = values.indexOf(label);
  if (value < 0) throw new Error('invalid_capability_level');
  return value;
}
export function launchCatalog(options: {
  mode: 'test' | 'live' | null;
  rate?: string;
  settings?: BillingSettings;
}) {
  const rate = options.rate ?? cfg.usdInrRate;
  const settings = options.settings ?? billingSettings();
  const gst =
    settings.gstRate && settings.seller.gst_approval_reference.trim() ? settings.gstRate : null;
  if (gst) taxMinor(0, gst);
  const price = (minor: number) => ({
    currency: 'USD',
    amount_minor: minor,
    tax_behavior: 'inclusive',
    provider_price_ref: '',
  });
  const plans: unknown[] = cfg.plans.map((p) => {
    const bundle = [
      { key: 'audit_cadence', value: level('audit_cadence', 'daily') },
      { key: 'project_slots', value: p.projects },
      { key: 'prompt_slots', value: p.prompts },
      { key: 'monitored_urls', value: p.urls },
      { key: 'site_health_page_fetches_per_period', value: p.fetches },
      { key: 'history_window', value: level('history_window', p.history) },
      { key: 'manual_runs_per_day', value: p.runs },
      { key: 'exports', value: 1 },
      { key: 'support_tier', value: level('support_tier', p.support) },
      ...(p.credits ? [{ key: 'ai_credits', value: p.credits }] : []),
      ...(p.upper
        ? [
            { key: 'fanout', value: 1 },
            { key: 'agent', value: 1 },
          ]
        : []),
    ];
    const common = {
      provider_price_ref: '',
      provider_mode: options.mode,
      interval: 1,
      period: 'monthly',
      fx_inr_per_usd: rate,
      metadata: cfg.revision,
    };
    const regional = !options.mode
      ? {}
      : {
          international: {
            ...common,
            ...price(p.byok),
            tax_minor: 0,
            provider_plan_name: `CiteLadder ${p.name} BYOK USD`,
            tax_rate: '0',
            tax_verified: true,
          },
          ...(gst
            ? {
                india: {
                  ...common,
                  currency: 'INR',
                  amount_minor: inrMinor(p.byok, rate),
                  tax_behavior: 'exclusive',
                  tax_minor: taxMinor(inrMinor(p.byok, rate), gst),
                  provider_plan_name: `CiteLadder ${p.name} BYOK INR`,
                  tax_rate: gst,
                  tax_verified: true,
                },
              }
            : {}),
        };
    return {
      key: p.key,
      name: p.name,
      description: p.description,
      cadence: 'monthly',
      self_serve: true,
      contact_only: false,
      byok_price: price(p.byok),
      funded_price: price(p.funded),
      regional_byok_prices: regional,
      grants: bundle,
    };
  });
  plans.push({
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Custom volume, security review, and deployment options.',
    cadence: 'custom',
    self_serve: false,
    contact_only: true,
    byok_price: null,
    funded_price: null,
    grants: [],
  });
  const items = cfg.items.map((i) => {
    const terms = (minor: number, bundle: readonly { key: string; value: number }[]) => ({
      usd_minor: minor,
      regional_prices: {
        international: { currency: 'USD', amount_minor: minor, tax_behavior: 'inclusive' },
        india: {
          currency: 'INR',
          amount_minor: inrMinor(minor, rate),
          tax_behavior: 'exclusive',
          fx_inr_per_usd: rate,
        },
      },
      grants: bundle,
    });
    return {
      key: i.key,
      name: i.name,
      description: i.description,
      available: i.available,
      eligible_plan_keys: i.upperOnly ? ['tier_2', 'tier_3'] : ['tier_1', 'tier_2', 'tier_3'],
      quantity_min: 1,
      quantity_max: cfg.quantityMax,
      expiry_days: cfg.expiryDays,
      modes: { byok: terms(i.byok, i.grants), funded: terms(i.funded, i.fundedGrants ?? i.grants) },
    };
  });
  return validateCatalog({
    schema_version: 1,
    plans,
    addons: items.filter((_, i) => !cfg.items[i]!.topup),
    topups: items.filter((_, i) => cfg.items[i]!.topup),
    campaign: {
      key: 'no_card_tier_1_intro',
      state: 'draft',
      enabled: false,
      duration_days: 7,
      plan_key: 'tier_1',
      claim_available: false,
    },
    contact_sales_url: cfg.contactUrl,
    support_contact: { email: cfg.supportEmail, phone: '', contact_url: cfg.contactUrl },
    platform_routes: [],
    ai_credit_policy: null,
  });
}
