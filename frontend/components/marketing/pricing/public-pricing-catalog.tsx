import { useState } from 'react';

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
} from '@/lib/billing/catalog';
import { publicPricingSelectionHref } from '@/lib/billing/public-pricing-selection';
import { CONTACT_SALES_HREF } from '@/lib/config/billing';
import {
  BYOK_DISCLOSURE,
  BYOK_SWITCH_LABEL,
  PLAN_PRESENTATION,
  type PlanKey,
} from '@/lib/marketing-content/pricing';

import { Section, SectionHeader } from '../primitives/section';
import { PricingComparison } from './pricing-comparison';

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

function PlanAction({ plan, href }: Readonly<{ plan: CatalogPlan; href: string | null }>) {
  if (href) {
    return (
      <a
        className="bg-accent text-accent-fg mt-auto rounded-[var(--radius-control)] px-5 py-3 text-center font-medium"
        href={href}
      >
        Choose {plan.name}
      </a>
    );
  }
  if (plan.contact_only) {
    return (
      <a
        className="border-border-subtle mt-auto rounded-[var(--radius-control)] border px-5 py-3 text-center font-medium"
        href={plan.contact_url ?? CONTACT_SALES_HREF}
      >
        Contact sales
      </a>
    );
  }
  return <p className="website-body text-muted mt-auto">Checkout unavailable</p>;
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
  const href = choice.ok
    ? publicPricingSelectionHref(
        { kind: 'checkout', catalog_key: choice.catalog_key, quantity: 1, byok: mode === 'byok' },
        appOrigin,
      )
    : null;
  return (
    <article className="border-border bg-panel flex flex-col rounded-[var(--radius-card)] border p-6">
      <h3 className="website-feature-heading text-foreground">{plan.name}</h3>
      <p className="website-body text-muted mt-3">{presentation?.blurb ?? plan.description}</p>
      <p className="website-data-display text-foreground mt-6">
        {priceLabel(price, catalog.currency_minor_units)}
      </p>
      {price.kind === 'price' && (
        <p className="website-label text-muted">per month · {taxNote(catalog.currency)}</p>
      )}
      <PlanAction plan={plan} href={href} />
    </article>
  );
}

function ExtraCard({
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
    <article className="border-border-subtle bg-panel flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
      <h3 className="website-feature-heading text-foreground">{entry.name}</h3>
      <p className="website-body text-muted">{entry.description}</p>
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
      {href ? (
        <a className="text-accent-text mt-auto underline" href={href}>
          Choose {entry.name}
        </a>
      ) : (
        <p className="website-label text-muted mt-auto">Unavailable</p>
      )}
    </article>
  );
}

export function PublicPricingCatalog({
  catalog,
  appOrigin,
  initialByok,
}: Readonly<{ catalog: BillingCatalog; appOrigin: string; initialByok: boolean }>) {
  const [byok, setByok] = useState(initialByok);
  const mode = byok ? 'byok' : 'funded';
  return (
    <>
      <Section tone="paper" rhythm="tight" aria-label="Plans">
        <label className="border-border-subtle bg-background-alt mb-8 flex items-center gap-3 rounded-[var(--radius-card)] border p-4">
          <input
            type="checkbox"
            checked={byok}
            onChange={(event) => {
              const value = event.target.checked;
              setByok(value);
              const url = new URL(window.location.href);
              if (value) url.searchParams.delete('byok');
              else url.searchParams.set('byok', '0');
              window.history.replaceState(null, '', url);
            }}
          />
          <span className="text-foreground text-sm font-medium">{BYOK_SWITCH_LABEL}</span>
          <span className="website-label text-muted">{BYOK_DISCLOSURE}</span>
        </label>
        <p className="website-label text-muted mb-6">
          Prices shown in {catalog.currency}
          {catalog.currency === 'INR' ? ', exclusive of GST' : ''}. Your billing country sets the
          final currency and tax, confirmed in the app before payment.
        </p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {catalog.plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              catalog={catalog}
              mode={mode}
              appOrigin={new URL(appOrigin)}
            />
          ))}
        </div>
      </Section>
      <Section tone="sunken" rhythm="tight" aria-label="Plan comparison">
        <SectionHeader
          eyebrow="Compare"
          title="Choose based on what you actually need."
          headingId="pricing-compare-title"
        />
        <PricingComparison catalog={catalog} />
      </Section>
      {(catalog.addons.length > 0 || catalog.topups.length > 0) && (
        <Section tone="paper" rhythm="tight" aria-label="Add-ons and top-ups">
          <SectionHeader
            eyebrow="Extend"
            title="Add what your workspace needs."
            headingId="pricing-extras-title"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.addons.map((entry) => (
              <ExtraCard
                key={entry.key}
                entry={entry}
                kind="addon"
                catalog={catalog}
                appOrigin={new URL(appOrigin)}
                byok={byok}
              />
            ))}
            {catalog.topups.map((entry) => (
              <ExtraCard
                key={entry.key}
                entry={entry}
                kind="topup"
                catalog={catalog}
                appOrigin={new URL(appOrigin)}
                byok={byok}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
