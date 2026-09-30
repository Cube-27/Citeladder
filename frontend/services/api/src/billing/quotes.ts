import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { resolvedQuoteSchema } from '@citeladder/contracts/billing';
import { amount, conflict, taxSchema, type Identity } from './contracts.ts';
import type { BillingSettings } from './config.ts';
import type { CatalogPlan, CatalogItem } from './catalog.ts';

export type Quote = z.infer<typeof resolvedQuoteSchema>;
export type Intent = {
  kind: 'base' | 'addon' | 'topup' | 'upgrade';
  key: string;
  quantity: number;
  region: 'india' | 'international';
  country: string;
  priceRef: string;
  quote: Quote;
  taxSnapshot: {
    customer: Identity;
    seller: Record<string, string>;
    tax: z.infer<typeof taxSchema>;
  };
  changeTerms: Record<string, unknown> | null;
};

/** Integer rational arithmetic keeps minor-unit rounding exact. */
export function roundedRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Invalid money ratio');
  return amount.parse(Number((numerator * 2n + denominator) / (2n * denominator)));
}

function gstMinor(subtotal: number, raw: string): number {
  if (!/^0(?:\.\d+)?$|^1(?:\.0+)?$/u.test(raw)) conflict('checkout_unavailable');
  const [whole, fraction = ''] = raw.split('.');
  return roundedRatio(
    BigInt(subtotal) * BigInt(`${whole}${fraction}`),
    10n ** BigInt(fraction.length),
  );
}

export function quoteIntent(
  settings: BillingSettings,
  input: {
    kind: Intent['kind'];
    key: string;
    quantity: number;
    country: string;
    identity: Identity;
    currency: 'USD' | 'INR';
    unitAmount: number;
    priceRef: string;
    revision: string;
    now: Date;
    changeTerms?: Record<string, unknown>;
  },
): Intent {
  const { kind, key, quantity, country, identity, currency, unitAmount, priceRef, revision, now } =
    input;
  const seller = settings.seller;
  if (
    !seller.legal_name ||
    !seller.address ||
    !seller.email ||
    !seller.gstin ||
    !seller.state_code ||
    !seller.state_name ||
    !seller.sac ||
    !/^[A-Z0-9]{1,3}$/u.test(seller.invoice_prefix) ||
    !settings.quoteSecret
  )
    conflict('checkout_unavailable');
  const subtotal = amount.parse(unitAmount * quantity);
  let cgst = 0,
    sgst = 0,
    igst = 0;
  let treatment: 'CGST_SGST' | 'IGST' | 'EXPORT_ZERO_RATED' = 'EXPORT_ZERO_RATED';
  let rate = '0';
  if (country === 'IN') {
    if (
      currency !== 'INR' ||
      !identity.state_code ||
      !settings.gstRate ||
      !seller.gst_approval_reference
    )
      conflict('checkout_unavailable');
    if (identity.customer_gstin && identity.customer_gstin.slice(0, 2) !== identity.state_code)
      conflict('billing_gstin_state_mismatch');
    rate = settings.gstRate;
    const tax = gstMinor(subtotal, rate);
    if (identity.state_code === seller.state_code) {
      treatment = 'CGST_SGST';
      cgst = Math.floor(tax / 2);
      sgst = tax - cgst;
    } else {
      treatment = 'IGST';
      igst = tax;
    }
  } else if (currency !== 'USD' || !seller.lut_reference || !identity.export_eligibility_attested)
    conflict('checkout_unavailable');
  const tax = taxSchema.parse({
    subtotal_minor: subtotal,
    discount_minor: 0,
    taxable_minor: subtotal,
    cgst_minor: cgst,
    sgst_minor: sgst,
    igst_minor: igst,
    tax_minor: cgst + sgst + igst,
    total_minor: subtotal + cgst + sgst + igst,
    treatment,
    tax_rate: rate,
    policy_version: 1,
  });
  const expires = new Date(now.getTime() + settings.quoteMinutes * 60_000).toISOString();
  const region = country === 'IN' ? 'india' : 'international';
  const taxSnapshot = { customer: identity, seller, tax };
  const quoteId = createHmac('sha256', settings.quoteSecret)
    .update(
      JSON.stringify({ kind, key, quantity, country, revision, priceRef, taxSnapshot, expires }),
    )
    .digest('hex');
  const money = (value: number) => ({ currency, amount_minor: value });
  const quote = resolvedQuoteSchema.parse({
    quote_id: quoteId,
    catalog_revision: revision,
    catalog_key: key,
    credential_mode: 'byok',
    country_code: country,
    region,
    base_price: money(subtotal),
    subtotal_price: money(subtotal),
    discount: money(0),
    taxable_value: money(subtotal),
    credit_price: null,
    tax: money(tax.tax_minor),
    tax_treatment: treatment,
    tax_rate: rate,
    cgst: money(cgst),
    sgst: money(sgst),
    igst: money(igst),
    tax_policy_version: 1,
    total_price: money(tax.total_minor),
    expires_at: expires,
  });
  return {
    kind,
    key,
    quantity,
    country,
    region,
    priceRef,
    quote,
    taxSnapshot,
    changeTerms: input.changeTerms ?? null,
  };
}

export function baseIntent(
  settings: BillingSettings,
  plan: CatalogPlan,
  country: string,
  identity: Identity,
  revision: string,
  now: Date,
): Intent {
  const regional = plan.regional_byok_prices[country === 'IN' ? 'india' : 'international'];
  if (!plan.self_serve || plan.contact_only) conflict('contact_only');
  if (!regional?.provider_price_ref || !regional.tax_verified) conflict('checkout_unavailable');
  const intent = quoteIntent(settings, {
    kind: 'base',
    key: plan.key,
    quantity: 1,
    country,
    identity,
    currency: regional.currency,
    unitAmount: regional.amount_minor,
    priceRef: regional.provider_price_ref,
    revision,
    now,
  });
  if (intent.quote.total_price.amount_minor !== regional.amount_minor + regional.tax_minor)
    conflict('checkout_unavailable');
  return intent;
}

export function packIntent(
  settings: BillingSettings,
  item: CatalogItem,
  {
    kind,
    quantity,
    planKey,
    country,
    identity,
    revision,
    now,
  }: {
    kind: 'addon' | 'topup';
    quantity: number;
    planKey: string;
    country: string;
    identity: Identity;
    revision: string;
    now: Date;
  },
) {
  if (!item.eligible_plan_keys.includes(planKey)) conflict('item_plan_ineligible');
  if (!item.available) conflict('provider_unavailable');
  if (quantity < item.quantity_min || quantity > item.quantity_max)
    conflict('quantity_out_of_bounds');
  const price = item.modes.byok?.regional_prices[country === 'IN' ? 'india' : 'international'];
  if (!price) conflict('checkout_unavailable');
  return quoteIntent(settings, {
    kind,
    key: item.key,
    quantity,
    country,
    identity,
    currency: price.currency,
    unitAmount: price.amount_minor,
    priceRef: '',
    revision,
    now,
  });
}
