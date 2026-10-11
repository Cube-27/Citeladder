'use client';

import { useState, type ReactNode } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { PlanRow } from '@/components/billing/plan-row';
import { Alert } from '@/components/ui/alert';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { panelClasses } from '@/components/ui/panel';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import type {
  BillingCatalog,
  BillingCustomerDetails,
  CredentialMode,
  SelfServePlanKey,
} from '@/lib/api/billing';
import { selfServeCheckoutComingSoon } from '@/lib/billing/catalog';
import type { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { websiteHref } from '@/lib/config/app-link';
import { contactSalesHref } from '@/lib/config/contact';

export type NewSubscription = {
  country: string;
  setCountry: (country: string) => void;
  details: BillingCustomerDetails;
  setDetails: (details: BillingCustomerDetails) => void;
  subscribe: (key: SelfServePlanKey, details: BillingCustomerDetails, mode: CredentialMode) => void;
};

/** Starts the quote for a new subscription in the chosen mode. */
export function subscribeWith(
  checkout: ReturnType<typeof useSubscriptionCheckout>,
  country: string,
): NewSubscription['subscribe'] {
  return (key, billingDetails, mode) =>
    void checkout
      .prepare({
        purchase: {
          kind: 'base',
          input: {
            catalog_key: key,
            credential_mode: mode,
            country_code: country,
            ...billingDetails,
          },
        },
      })
      .catch(() => undefined);
}

const MODES = [
  { value: 'byok', label: 'Your own keys' },
  { value: 'funded', label: 'Managed' },
] as const satisfies readonly { value: CredentialMode; label: string }[];

const MODE_NOTE: Record<CredentialMode, string> = {
  byok: 'Audits run on your own provider keys, billed by those providers directly.',
  funded: 'CiteLadder supplies the AI engine and search keys; you manage no provider accounts.',
};

/**
 * A new subscription: the plans the workspace may buy, in either mode. While
 * self-serve checkout is closed the app says so instead of listing prices, as
 * the public pricing page does.
 */
export function ChoosePlan({
  catalog,
  canManage,
  pending,
  country,
  setCountry,
  details,
  setDetails,
  subscribe,
}: Readonly<
  NewSubscription & { catalog: BillingCatalog; canManage: boolean; pending: boolean }
>): ReactNode {
  const [chosen, setChosen] = useState<SelfServePlanKey | null>(null);
  const [mode, setMode] = useState<CredentialMode>('byok');
  // Closed only when neither mode can be bought; managed alone still sells.
  if (
    selfServeCheckoutComingSoon(catalog) &&
    !catalog.plans.some((plan) => plan.funded_checkout_available)
  )
    return (
      <section className={panelClasses({}, 'grid gap-4')} aria-labelledby="choose-plan-title">
        <EditorialSectionHeader
          headingId="choose-plan-title"
          title="Choose a plan"
          description="Self-serve plans are not open yet."
        />
        <Alert tone="info">
          To start a plan now, contact us and we will set it up for this workspace.{' '}
          <ExternalHttpLink
            href={contactSalesHref(
              catalog.support_contact?.contact_url ?? null,
              new URL(websiteHref('/contact'), 'https://citeladder.com').href,
            )}
          >
            Contact us
          </ExternalHttpLink>
        </Alert>
      </section>
    );
  return (
    <section className={panelClasses({}, 'grid gap-4')} aria-labelledby="choose-plan-title">
      <EditorialSectionHeader
        headingId="choose-plan-title"
        title="Choose a plan"
        description={`Your billing country sets the currency and tax; you review the exact quote before paying. ${MODE_NOTE[mode]}`}
      />
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={MODES}
        ariaLabel="Provider keys"
        className="w-fit"
      />
      <BillingCountryInput country={country} setCountry={setCountry} />
      <BillingDetailsForm
        country={country}
        details={details}
        setDetails={setDetails}
        idPrefix="settings"
      />
      <div className="grid gap-2">
        {catalog.plans.map((plan) => (
          <PlanRow
            key={plan.key}
            plan={plan}
            mode={mode}
            currencyMinorUnits={catalog.currency_minor_units}
            country={country}
            billingDetails={details}
            pending={pending && chosen === plan.key}
            locked={!canManage || pending}
            onCheckout={(key, billingDetails) => {
              setChosen(key);
              subscribe(key, billingDetails, mode);
            }}
          />
        ))}
      </div>
    </section>
  );
}
