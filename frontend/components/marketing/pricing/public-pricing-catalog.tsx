import { useId, useState } from 'react';

import type {
  BillingCatalog,
  CatalogAddon,
  CatalogPlan,
  CatalogTopup,
  CredentialMode,
} from '@/lib/api/billing';
import type { HeadlinePrice } from '@/lib/billing/catalog';
import {
  checkoutSelection,
  formatMoney,
  headlinePrice,
  isPurchasable,
  selfServeCheckoutComingSoon,
} from '@/lib/billing/catalog';
import { publicPricingSelectionHref } from '@/lib/billing/public-pricing-selection';
import { CONTACT_SALES_HREF } from '@/lib/config/billing';
import { contactSalesHref } from '@/lib/config/contact';
import { formatCount } from '@/lib/format';
import {
  BYOK_DISCLOSURE,
  BYOK_SWITCH_LABEL,
  PLAN_PRESENTATION,
  capabilityLabel,
  type PlanKey,
} from '@/lib/marketing-content/pricing';
import { cn } from '@/lib/utils';

import { ButtonLink } from '../primitives/button';
import { Section, SectionHeader } from '../primitives/section';
import { PricingComparison } from './pricing-comparison';
import { PricingTrial } from './pricing-trial';

/**
 * INR prices are published exclusive of GST, which the server quote adds for
 * the buyer's state. Other currencies are charged as shown.
 */
function taxNote(currency: BillingCatalog['currency']): string {
  return currency === 'INR' ? 'excl. GST' : 'taxes confirmed at checkout';
}

function priceLabel(price: HeadlinePrice, minorUnits: number): string {
  if (price.kind === 'price') return formatMoney(price.money, minorUnits);
  return price.kind === 'contact' ? 'Contact sales' : 'Not yet priced';
}

/**
 * The headline limits a plan card lists, in reading order. Values come from
 * the plan's published capabilities; a capability the plan does not publish
 * (or publishes as off) is simply not listed — the comparison table below
 * carries the full grid.
 */
const CARD_CAPABILITIES = [
  'project_slots',
  'prompt_slots',
  'monitored_urls',
  'manual_runs_per_day',
  'agent',
  'ai_credits',
] as const;

type CardFact = { key: string; label: string; value: string | null };

function cardFacts(plan: CatalogPlan): CardFact[] {
  return CARD_CAPABILITIES.flatMap((key): CardFact[] => {
    const value = plan.capabilities.find((capability) => capability.key === key)?.value;
    if (value === undefined || value === null || value === false) return [];
    const label = capabilityLabel(key);
    if (value === true) return [{ key, label, value: null }];
    return [{ key, label, value: typeof value === 'number' ? formatCount(value) : value }];
  });
}

function PlanAction({
  plan,
  href,
  highlighted,
}: Readonly<{ plan: CatalogPlan; href: string | null; highlighted: boolean }>) {
  if (href) {
    return (
      <ButtonLink
        href={href}
        variant={highlighted ? 'primary' : 'soft'}
        size="marketing"
        className="w-full"
      >
        Choose {plan.name}
      </ButtonLink>
    );
  }
  if (plan.contact_only) {
    return (
      <ButtonLink
        href={contactSalesHref(plan.contact_url, CONTACT_SALES_HREF)}
        variant="soft"
        size="marketing"
        className="w-full"
      >
        Contact sales
      </ButtonLink>
    );
  }
  return <p className="website-body">Checkout unavailable</p>;
}

function PlanCard({
  plan,
  catalog,
  mode,
  appOrigin,
}: Readonly<{
  plan: CatalogPlan;
  catalog: BillingCatalog;
  mode: CredentialMode;
  appOrigin: URL;
}>) {
  const price = headlinePrice(plan, mode);
  const choice = checkoutSelection(plan, mode);
  const presentation = PLAN_PRESENTATION[plan.key as PlanKey];
  const highlighted = presentation?.highlighted === true;
  const href = choice.ok
    ? publicPricingSelectionHref(
        { kind: 'checkout', catalog_key: choice.catalog_key, quantity: 1, byok: mode === 'byok' },
        appOrigin,
      )
    : null;
  const facts = cardFacts(plan);
  return (
    <article className={cn('cm-plan', highlighted && 'cm-plan-highlighted')}>
      <div className="cm-plan-head">
        <h3 className="website-feature-heading text-foreground">{plan.name}</h3>
        <p className="website-body">{presentation?.blurb ?? plan.description}</p>
      </div>
      <div className="cm-plan-price">
        <p className="website-data-display text-foreground">
          {priceLabel(price, catalog.currency_minor_units)}
        </p>
        {price.kind === 'price' && (
          <p className="website-label text-muted">per month · {taxNote(catalog.currency)}</p>
        )}
      </div>
      <PlanAction plan={plan} href={href} highlighted={highlighted} />
      {facts.length > 0 && (
        <ul className="cm-plan-facts" aria-label={`${plan.name} limits`}>
          {facts.map((fact) => (
            <li key={fact.key}>
              <span>{fact.label}</span>
              {fact.value === null ? (
                <span className="cm-plan-included">Included</span>
              ) : (
                <span className="cm-plan-value">{fact.value}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ExtraRow({
  entry,
  kind,
  catalog,
  appOrigin,
  byok,
}: Readonly<{
  entry: CatalogAddon | CatalogTopup;
  kind: 'addon' | 'topup';
  catalog: BillingCatalog;
  appOrigin: URL;
  byok: boolean;
}>) {
  const href = isPurchasable(entry)
    ? publicPricingSelectionHref(
        { kind, catalog_key: entry.key, quantity: entry.quantity_min, byok },
        appOrigin,
      )
    : null;
  return (
    <li className="cm-extra">
      <div className="cm-extra-copy">
        <h3 className="website-feature-heading text-foreground">{entry.name}</h3>
        <p className="website-body">{entry.description}</p>
      </div>
      <div className="cm-extra-price">
        <p className="website-body text-foreground">
          {entry.unit_price
            ? formatMoney(entry.unit_price, catalog.currency_minor_units)
            : 'Not yet priced'}
        </p>
        {entry.unit_price ? (
          <p className="website-label text-muted">
            one-time · {taxNote(catalog.currency)} · usable for {entry.expiry_days} days while your
            plan is active
          </p>
        ) : null}
      </div>
      <div className="cm-extra-action">
        {href ? (
          <a className="mk-text-link" href={href}>
            Choose {entry.name}
          </a>
        ) : (
          <p className="website-label text-muted">Unavailable</p>
        )}
      </div>
    </li>
  );
}

function ByokSwitch({
  byok,
  onChange,
}: Readonly<{ byok: boolean; onChange: (value: boolean) => void }>) {
  const id = useId();
  return (
    <div className="cm-byok">
      <input
        id={`${id}-input`}
        type="checkbox"
        className="cm-switch"
        checked={byok}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="cm-byok-copy">
        <label htmlFor={`${id}-input`} className="cm-byok-label">
          {BYOK_SWITCH_LABEL}
        </label>
        <span id={`${id}-hint`} className="website-label text-muted">
          {BYOK_DISCLOSURE}
        </span>
      </span>
    </div>
  );
}

export function PublicPricingCatalog({
  catalog,
  appOrigin,
  initialByok,
}: Readonly<{ catalog: BillingCatalog; appOrigin: string; initialByok: boolean }>) {
  const [byok, setByok] = useState(initialByok);
  const mode = byok ? 'byok' : 'funded';
  if (selfServeCheckoutComingSoon(catalog)) {
    return <PricingTrial appOrigin={appOrigin} checkoutOpen={false} />;
  }
  const origin = new URL(appOrigin);
  return (
    <>
      <Section tone="paper" rhythm="tight" className="pt-0" aria-label="Plans">
        <div className="cm-plans-bar">
          <ByokSwitch
            byok={byok}
            onChange={(value) => {
              setByok(value);
              const url = new URL(window.location.href);
              if (value) url.searchParams.delete('byok');
              else url.searchParams.set('byok', '0');
              window.history.replaceState(null, '', url);
            }}
          />
          <p className="website-label text-muted cm-plans-currency">
            Prices shown in {catalog.currency}
            {catalog.currency === 'INR' ? ', exclusive of GST' : ''}. Your billing country sets the
            final currency and tax, confirmed in the app before payment.
          </p>
        </div>
        <div className="grid gap-5">
          <div className="cm-plans">
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                catalog={catalog}
                mode={mode}
                appOrigin={origin}
              />
            ))}
          </div>
          <p className="website-label text-muted">
            Provider usage may be billed separately from your CiteLadder plan. Review the selected
            usage option and its costs before starting a run.
          </p>
        </div>
        <PricingTrial appOrigin={appOrigin} checkoutOpen />
      </Section>
      <Section tone="soft" aria-label="Plan comparison">
        <SectionHeader
          title="Compare every published limit."
          lead="Every value comes from the live plan catalog. A dash means the plan does not include it."
          headingId="pricing-compare-title"
        />
        <PricingComparison catalog={catalog} />
      </Section>
      {(catalog.addons.length > 0 || catalog.topups.length > 0) && (
        <Section tone="paper" aria-label="Add-ons and top-ups">
          <div className="mk-split">
            <SectionHeader
              title="Add capacity when you need it."
              lead="One-time purchases on top of an active plan."
              headingId="pricing-extras-title"
            />
            <ul className="cm-extras">
              {catalog.addons.map((entry) => (
                <ExtraRow
                  key={entry.key}
                  entry={entry}
                  kind="addon"
                  catalog={catalog}
                  appOrigin={origin}
                  byok={byok}
                />
              ))}
              {catalog.topups.map((entry) => (
                <ExtraRow
                  key={entry.key}
                  entry={entry}
                  kind="topup"
                  catalog={catalog}
                  appOrigin={origin}
                  byok={byok}
                />
              ))}
            </ul>
          </div>
        </Section>
      )}
    </>
  );
}
