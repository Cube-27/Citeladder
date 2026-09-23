import { useState } from 'react';

import type {
  BillingCatalog,
  CatalogAddon,
  CatalogPlan,
  CatalogTopup,
  CredentialMode,
} from '@/lib/api/billing';
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
    <article className="border-border-subtle bg-panel shadow-card flex flex-col rounded-[var(--radius-card)] border p-6">
      <h3 className="website-feature-heading text-foreground">{plan.name}</h3>
      <p className="website-body text-muted mt-3">{presentation?.blurb ?? plan.description}</p>
      <p className="website-data-display text-foreground mt-6">
        {price.kind === 'price'
          ? formatMoney(price.money, catalog.currency_minor_units)
          : price.kind === 'contact'
            ? 'Contact sales'
            : 'Not yet priced'}
      </p>
      {price.kind === 'price' && (
        <p className="website-label text-muted">per month · taxes calculated at checkout</p>
      )}
      {href ? (
        <a
          className="bg-accent text-accent-fg mt-auto rounded-[var(--radius-control)] px-5 py-3 text-center font-medium"
          href={href}
        >
          Choose {plan.name}
        </a>
      ) : plan.contact_only ? (
        <a
          className="border-border-subtle mt-auto rounded-[var(--radius-control)] border px-5 py-3 text-center font-medium"
          href={plan.contact_url ?? CONTACT_SALES_HREF}
        >
          Contact sales
        </a>
      ) : (
        <p className="website-body text-muted mt-auto">Checkout unavailable</p>
      )}
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
          Prices shown in {catalog.currency}. Your billing country and final quote are confirmed in
          the app.
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
