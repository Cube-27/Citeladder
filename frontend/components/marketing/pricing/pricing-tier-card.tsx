'use client';

import { Check } from 'lucide-react';

import type { BillingCatalog, CatalogPlan, CredentialMode } from '@/lib/api/billing';
import { formatMoney, headlinePrice, majorUnits } from '@/lib/billing/catalog';
import {
  CONTACT_LABEL,
  FUNDED_UNAVAILABLE_LABEL,
  PLAN_PRESENTATION,
  type PlanKey,
  capabilityLabel,
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
        'rounded-mkt-lg shadow-mkt-card p-mkt-30 flex h-full flex-col',
        highlighted ? 'bg-mkt-surface-sunk ring-mkt-primary ring-1' : 'bg-mkt-surface',
      )}
    >
      <div className="gap-mkt-14 flex items-center justify-between">
        <h3 className="font-mkt-display text-mkt-ink text-mkt-hsm">{plan.name}</h3>
        {highlighted && <Badge tone="proof">Recommended</Badge>}
      </div>
      <p className="text-mkt-sm text-mkt-ink-soft mt-mkt-10 min-h-[3rem]">
        {presentation?.blurb ?? plan.description}
      </p>

      {/* The price rides the website's own display rung, not the app's
          `text-hero`: an app token on this surface drifts with the dashboard
          ladder rather than the site's. */}
      <p className="text-mkt-ink text-mkt-h2 mt-mkt-20 gap-mkt-6 flex items-baseline font-mono tabular-nums">
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
          <span className="text-mkt-ink-soft text-mkt-sm font-normal">per month</span>
        )}
      </p>

      {/* Each capability leads with a check glyph and reads as a sentence:
          "Prompts tracked — 250". The raw `snake_case` key used to render
          verbatim, so the list read as a database dump rather than a list of
          what you get. Tight 10px rhythm — a feature list is a scan target,
          not prose.

          Absent capabilities are dropped BEFORE the cap, not after: the glyph
          is a success tick, so an absent value rendered "Label — —" behind a
          tick, and dropping it late would also spend one of the five slots on
          something the tier does not include. */}
      <ul className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 grid flex-1 border-t">
        {plan.capabilities
          .filter((capability) => isIncluded(capability.value))
          .slice(0, 5)
          .map((capability) => (
            <li
              key={capability.key}
              className="text-mkt-sm text-mkt-ink-soft gap-mkt-10 flex items-start"
            >
              {/* The glyph sits in a box as tall as the text's first line, so
                  it stays optically aligned on wrapped items without a nudge
                  margin — a margin here would be an off-ladder one-off, which
                  is exactly what this system exists to prevent. */}
              <span aria-hidden className="text-mkt-sm flex h-[1lh] shrink-0 items-center">
                <Check className="text-mkt-success size-4" />
              </span>
              <span>
                {capabilityLabel(capability.key)}
                {renderValue(capability.value) !== 'Included' && (
                  <>
                    {' — '}
                    <span className="text-mkt-ink font-medium">
                      {renderValue(capability.value)}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
      </ul>

      <div className="mt-mkt-20">
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
        className="border-mkt-black-10 text-mkt-ink focus-ring text-mkt-sm rounded-mkt-sm inline-flex h-10 w-full items-center justify-center border font-medium"
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
      className="bg-mkt-indigo text-mkt-surface focus-ring text-mkt-sm rounded-mkt-sm inline-flex h-10 w-full items-center justify-center font-medium disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Starting checkout…' : `Choose ${plan.name}`}
    </button>
  );
}

/**
 * Whether the tier carries this capability at all. `null` (not applicable) and
 * `false` (explicitly absent) both mean it does not.
 */
function isIncluded(value: boolean | number | string | null): boolean {
  return value !== null && value !== false;
}

function renderValue(value: boolean | number | string | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Included' : '—';
  return String(value);
}
