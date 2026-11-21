import { useState, type ReactNode } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { PlanCards, PlanRow } from '@/components/billing/plan-row';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { SegmentedControl } from '@/components/ui/tabs';
import type {
  BillingCatalog,
  BillingCustomerDetails,
  CredentialMode,
  SelfServePlanKey,
} from '@/lib/api/billing';
import { MessageSquare } from '@/lib/icons';
import { newPlanCheckoutClosed } from '@/lib/billing/catalog';
import type { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { websiteHref } from '@/lib/config/app-link';
import { contactSalesHref } from '@/lib/config/contact-sales';
import { Button } from '@/components/ui/button';
import { StateBlock } from '@/components/ui/state-block';

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

const MODE_NOTE: Record<CredentialMode, string | null> = {
  byok: 'Your providers bill audit usage directly.',
  funded: null,
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
  // Contact is the page's one real next step while checkout is closed.
  if (newPlanCheckoutClosed(catalog))
    return (
      <SettingsGroup id="choose-plan" title="Choose a plan" region={false}>
        <StateBlock
          kind="empty"
          icon={MessageSquare}
          heading="Self-serve plans are not open yet"
          action={
            <Button asChild>
              <ExternalHttpLink
                className="no-underline"
                href={contactSalesHref(
                  catalog.support_contact?.contact_url ?? null,
                  new URL(websiteHref('/contact'), 'https://citeladder.com').href,
                )}
              >
                Contact us
              </ExternalHttpLink>
            </Button>
          }
        />
      </SettingsGroup>
    );
  return (
    <SettingsGroup id="choose-plan" title="Choose a plan">
      <SettingRows label="Billing details">
        <SettingRow
          label="Provider keys"
          description={MODE_NOTE[mode]}
          action={
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={MODES}
              ariaLabel="Provider keys"
            />
          }
        />
        <BillingCountryInput country={country} setCountry={setCountry} />
        <BillingDetailsForm country={country} details={details} setDetails={setDetails} />
      </SettingRows>
      <PlanCards>
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
      </PlanCards>
    </SettingsGroup>
  );
}
