import { MessageSquare } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { PlanRow } from '@/components/billing/plan-row';
import { AppGrid } from '@/components/ui/app-grid';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { Stack } from '@/components/ui/layout';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { SegmentedControl } from '@/components/ui/tabs';
import type {
  BillingCatalog,
  BillingCustomerDetails,
  CredentialMode,
  SelfServePlanKey,
} from '@/lib/api/billing';
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

const MODE_NOTE: Record<CredentialMode, string> = {
  byok: 'Audits run on your own provider keys, billed by those providers directly.',
  funded: 'CiteLadder supplies the AI engine and search keys; you manage no provider accounts.',
};

/**
 * A new subscription: the plans the workspace may buy, in either mode. While
 * self-serve checkout is closed the app says so instead of listing prices, as
 * the public pricing page does. Unframed: the caller puts it in its card.
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
      <div id="choose-plan">
        <StateBlock
          kind="empty"
          icon={MessageSquare}
          heading="Self-serve plans are not open yet"
          description="To start a plan now, contact us and we will set it up for this workspace."
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
      </div>
    );
  return (
    <Section id="choose-plan" aria-labelledby="choose-plan-title">
      <SectionHeader>
        <SectionTitle id="choose-plan-title">Choose a plan</SectionTitle>
        <SectionDescription>
          Your billing country sets the currency and tax; you review the exact quote before paying.{' '}
          {MODE_NOTE[mode]}
        </SectionDescription>
      </SectionHeader>
      <Stack as={SectionContent} gap="workspace">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={MODES}
          ariaLabel="Provider keys"
          className="w-fit"
        />
        <BillingCountryInput country={country} setCountry={setCountry} />
        <BillingDetailsForm country={country} details={details} setDetails={setDetails} />
        <AppGrid layout="slips">
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
        </AppGrid>
      </Stack>
    </Section>
  );
}
