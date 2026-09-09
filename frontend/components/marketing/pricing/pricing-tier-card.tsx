'use client';

import { Check } from 'lucide-react';

import type { BillingCatalog, CatalogPlan, CredentialMode } from '@/lib/api/billing';
import { checkoutSelection, formatMoney, majorUnits, type Money } from '@/lib/billing/catalog';
import { CONTACT_SALES_HREF } from '@/lib/config/billing';
import {
  CONTACT_LABEL,
  FUNDED_UNAVAILABLE_LABEL,
  PLAN_PRESENTATION,
  type PlanKey,
  launchPlanCardFeatures,
  launchPlanPrice,
} from '@/lib/marketing-content/pricing';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnimatedPrice } from './animated-price';

/**
 * One plan card. The approved launch presentation supplies public prices and
 * features while checkout availability still comes from the live catalog.
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
  onEarlyAccess,
}: Readonly<{
  plan: CatalogPlan;
  catalog: BillingCatalog;
  mode: CredentialMode;
  /** Runs the checkout (or captures an intent when anonymous). */
  onCheckout: (plan: CatalogPlan) => void;
  pending: boolean;
  onEarlyAccess?: () => void;
}>) {
  const presentation = PLAN_PRESENTATION[plan.key as PlanKey];
  const configuredPrice = launchPlanPrice(plan.key as PlanKey, catalog.currency, mode);
  const price: { kind: 'price'; money: Money } | { kind: 'contact' } | { kind: 'unavailable' } =
    plan.contact_only
      ? { kind: 'contact' }
      : configuredPrice === null
        ? { kind: 'unavailable' }
        : {
            kind: 'price',
            money: { currency: catalog.currency, amount_minor: configuredPrice },
          };
  const highlighted = presentation?.highlighted ?? false;

  return (
    <div
      data-tier={plan.key}
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(
        'flex h-full flex-col rounded-[var(--radius-card)] p-6 md:p-7 xl:p-6 shadow-card hover:shadow-card-hover transition-all duration-200 ease-out hover:-translate-y-1',
        highlighted
          ? 'border-accent-border bg-panel ring-accent/15 border shadow-pricing-featured ring-2'
          : 'bg-panel border border-border-subtle/80',
      )}
    >
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="website-feature-heading text-foreground">{plan.name}</h3>
        {highlighted && (
          <Badge variant="status" value="info">
            Recommended
          </Badge>
        )}
      </div>
      <p className="website-body text-muted mt-3 min-h-[3rem] max-w-[32ch]">
        {presentation?.blurb ?? plan.description}
      </p>

      {/* The price rides the website's own display rung, not the app's
          `text-hero`: an app token on this surface drifts with the dashboard
          ladder rather than the site's. */}
      <PriceDisplay price={price} catalog={catalog} />

      {/* Labels and values occupy separate edges so every limit scans as a
          compact row instead of wrapping around punctuation. */}
      <CapabilityList planKey={plan.key as PlanKey} mode={mode} />

      <div className="mt-auto grid gap-2 pt-6">
        <PlanCta
          plan={plan}
          priceKind={price.kind}
          checkoutAvailable={checkoutSelection(plan, mode).ok}
          onCheckout={onCheckout}
          pending={pending}
        />
        {onEarlyAccess ? (
          <Button variant="secondary" className="w-full" onClick={onEarlyAccess}>
            Claim 7-day early access
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PriceDisplay({
  price,
  catalog,
}: Readonly<{
  price: { kind: 'price'; money: Money } | { kind: 'contact' } | { kind: 'unavailable' };
  catalog: BillingCatalog;
}>) {
  const numeric =
    price.kind === 'price' ? majorUnits(price.money, catalog.currency_minor_units) : null;
  const settled =
    price.kind === 'price'
      ? formatMoney(price.money, catalog.currency_minor_units)
      : price.kind === 'contact'
        ? CONTACT_LABEL
        : FUNDED_UNAVAILABLE_LABEL;
  const paidPrice = price.kind === 'price';
  return (
    <div className="text-foreground mt-6 min-h-[3.75rem]">
      <p className="website-data-display flex items-baseline gap-2 whitespace-nowrap">
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
        {paidPrice ? <span className="text-muted text-sm font-normal">per month</span> : null}
      </p>
      {paidPrice ? (
        <span className="text-muted mt-1 block text-xs">Taxes calculated at checkout</span>
      ) : null}
    </div>
  );
}

function CapabilityList({ planKey, mode }: Readonly<{ planKey: PlanKey; mode: CredentialMode }>) {
  const capabilities = launchPlanCardFeatures(planKey, mode);
  return (
    <ul className="border-border-subtle mt-6 grid flex-1 content-start gap-1 border-t pt-4">
      {capabilities.map((capability) => {
        const value = capability.value;
        return (
          <li
            key={capability.label}
            className="text-secondary flex min-h-9 items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Check aria-hidden className="text-accent size-4 shrink-0" />
              <span>{capability.label}</span>
            </span>
            {value !== 'Included' ? (
              <span className="text-foreground shrink-0 font-medium tabular-nums">{value}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function PlanCta({
  plan,
  priceKind,
  checkoutAvailable,
  onCheckout,
  pending,
}: Readonly<{
  plan: CatalogPlan;
  priceKind: 'price' | 'contact' | 'unavailable';
  checkoutAvailable: boolean;
  onCheckout: (plan: CatalogPlan) => void;
  pending: boolean;
}>) {
  if (plan.contact_only) {
    return (
      <Button asChild variant="secondary" className="w-full">
        <a href={plan.contact_url ?? CONTACT_SALES_HREF} target="_blank" rel="noreferrer">
          {CONTACT_LABEL}
        </a>
      </Button>
    );
  }
  // Funded mode is unpurchasable while `credit_price` is null: the button is
  // present but disabled, so the state is visible rather than the CTA
  // vanishing and the card silently losing its call to action.
  const unavailable = !checkoutAvailable || priceKind !== 'price';
  const disabled = unavailable || pending;
  return (
    <Button
      disabled={disabled}
      variant="primary"
      onClick={() => onCheckout(plan)}
      className="w-full min-w-0 whitespace-normal"
      aria-label={unavailable ? `Choose ${plan.name} — checkout unavailable` : undefined}
    >
      {pending
        ? 'Starting checkout…'
        : !unavailable
          ? `Choose ${plan.name}`
          : 'Checkout unavailable'}
    </Button>
  );
}
