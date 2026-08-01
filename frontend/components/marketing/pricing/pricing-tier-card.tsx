'use client';

import type { BillingCatalog, CatalogPlan, CredentialMode } from '@/lib/api/billing';
import { formatMoney, headlinePrice, majorUnits } from '@/lib/billing/catalog';
import {
  CONTACT_LABEL,
  FUNDED_UNAVAILABLE_LABEL,
  PLAN_PRESENTATION,
  type PlanKey,
} from '@/lib/marketing-content/pricing';
import { cn } from '@/lib/utils';

import { Badge } from '../primitives/badge';
import { AnimatedPrice } from './animated-price';

/**
 * One plan card. Every enforceable value — name, price, capabilities — comes
 * from the catalog entry; only the blurb and the emphasis come from the
 * presentation module.
 *
 * `data-tier` / `data-price` / `data-highlighted` are structural test hooks:
 * with utility CSS there is no meaningful class to query, and a plan name is
 * ambiguous once it also heads a comparison column.
 */
export function PricingTierCard({
  plan,
  catalog,
  mode,
  onCheckout,
  pending,
}: Readonly<{
  plan: CatalogPlan;
  catalog: BillingCatalog;
  mode: CredentialMode;
  /** Runs the checkout (or captures an intent when anonymous). */
  onCheckout: (plan: CatalogPlan) => void;
  pending: boolean;
}>) {
  const presentation = PLAN_PRESENTATION[plan.key as PlanKey];
  const price = headlinePrice(plan, mode);
  const highlighted = presentation?.highlighted ?? false;

  const numeric =
    price.kind === 'price' ? majorUnits(price.money, catalog.currency_minor_units) : null;
  const settled =
    price.kind === 'price'
      ? formatMoney(price.money, catalog.currency_minor_units)
      : price.kind === 'contact'
        ? CONTACT_LABEL
        : FUNDED_UNAVAILABLE_LABEL;

  return (
    <div
      data-tier={plan.key}
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(
        'rounded-mkt-lg shadow-card flex h-full flex-col p-8',
        highlighted ? 'bg-mkt-wash ring-mkt-proof-line ring-1' : 'bg-mkt-surface',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mkt-display text-mkt-ink text-mkt-d5">{plan.name}</h3>
        {highlighted && <Badge tone="proof">Recommended</Badge>}
      </div>
      <p className="text-mkt-sm text-mkt-ink-soft mt-2 min-h-[3rem]">
        {presentation?.blurb ?? plan.description}
      </p>

      <p className="text-mkt-ink text-hero mt-4 flex items-baseline gap-1.5 font-mono leading-none font-medium tabular-nums">
        <AnimatedPrice
          value={numeric}
          format={(value) =>
            formatMoney(
              {
                currency: catalog.currency,
                amount_minor: value * 10 ** catalog.currency_minor_units,
              },
              catalog.currency_minor_units,
            )
          }
          announce={settled}
        />
        {price.kind === 'price' && (
          <span className="text-mkt-ink-muted text-mkt-sm font-normal">per month</span>
        )}
      </p>

      <ul className="border-mkt-line-soft mt-6 grid flex-1 gap-3 border-t pt-6">
        {plan.capabilities.slice(0, 5).map((capability) => (
          <li key={capability.key} className="text-mkt-sm text-mkt-ink-soft">
            {capability.key.replaceAll('_', ' ')}: {renderValue(capability.value)}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <PlanCta plan={plan} priceKind={price.kind} onCheckout={onCheckout} pending={pending} />
      </div>
    </div>
  );
}

function PlanCta({
  plan,
  priceKind,
  onCheckout,
  pending,
}: Readonly<{
  plan: CatalogPlan;
  priceKind: 'price' | 'contact' | 'unavailable';
  onCheckout: (plan: CatalogPlan) => void;
  pending: boolean;
}>) {
  if (plan.contact_only) {
    return (
      <a
        href={plan.contact_url ?? '/demo'}
        className="border-mkt-line text-mkt-ink focus-ring text-mkt-sm inline-flex h-10 w-full items-center justify-center rounded-sm border font-medium"
      >
        {CONTACT_LABEL}
      </a>
    );
  }
  // Funded mode is unpurchasable while `credit_price` is null: the button is
  // present but disabled, so the state is visible rather than the CTA
  // vanishing and the card silently losing its call to action.
  const disabled = priceKind !== 'price' || pending;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCheckout(plan)}
      className="bg-mkt-proof text-mkt-surface focus-ring text-mkt-sm inline-flex h-10 w-full items-center justify-center rounded-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Starting checkout…' : `Choose ${plan.name}`}
    </button>
  );
}

function renderValue(value: boolean | number | string | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Included' : '—';
  return String(value);
}
