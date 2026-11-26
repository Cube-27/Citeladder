import type { ReactNode } from 'react';

import {
  billingDetailsError,
  type BillingCustomerDetails,
  type CatalogPlan,
  type CredentialMode,
  type SelfServePlanKey,
} from '@/lib/api/billing';
import {
  checkoutSelection,
  formatMoney,
  headlinePrice,
  type HeadlinePrice,
} from '@/lib/billing/catalog';
import { CreditCard } from '@/lib/icons';
import { billingReasonMessage } from '@/lib/billing/reason-copy';
import { websiteHref } from '@/lib/config/app-link';
import { contactSalesHref } from '@/lib/config/contact-sales';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';

export function PlanCard({
  name,
  price,
  current = false,
  controls,
  children,
  ...props
}: Readonly<{
  name: string;
  price: ReactNode;
  current?: boolean;
  controls?: ReactNode;
  children?: ReactNode;
  'data-tier'?: string;
}>) {
  return (
    <div
      {...props}
      aria-current={current ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="grid min-w-0 flex-1 content-start gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={textRole('label')}>{name}</span>
          {current ? <Tag>Current plan</Tag> : null}
        </div>
        <span className={textRole('body', 'tabular-nums')}>{price}</span>
        {children}
      </div>
      {controls ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{controls}</div>
      ) : null}
    </div>
  );
}

export function PlanCards({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="@container min-w-0">
      <div className="grid gap-[var(--panel-inset)] @[640px]:auto-cols-fr @[640px]:grid-flow-col">
        {children}
      </div>
    </div>
  );
}

export function PlanRow({
  plan,
  mode,
  currencyMinorUnits,
  country,
  billingDetails,
  pending,
  locked = false,
  onCheckout,
}: Readonly<{
  plan: CatalogPlan;
  mode: CredentialMode;
  currencyMinorUnits: number;
  country: string;
  billingDetails: BillingCustomerDetails;
  pending: boolean;
  locked?: boolean;
  onCheckout: (key: SelfServePlanKey, details: BillingCustomerDetails) => void;
}>) {
  const { priceLabel, selection, canCheckout } = planCheckoutState(
    plan,
    mode,
    currencyMinorUnits,
    country,
    billingDetails,
    pending,
  );
  return (
    <PlanCard
      data-tier={plan.key}
      name={plan.name}
      price={priceLabel}
      controls={
        plan.contact_only ? (
          <TextLink
            variant="external"
            className="whitespace-nowrap"
            href={contactSalesHref(
              plan.contact_url,
              new URL(websiteHref('/contact'), 'https://citeladder.com').href,
            )}
          >
            Contact sales
          </TextLink>
        ) : (
          <Button
            variant="secondary"
            disabled={!canCheckout || locked}
            onClick={() => selection.ok && onCheckout(selection.catalog_key, billingDetails)}
          >
            <Icon icon={CreditCard} />
            {planCheckoutLabel(pending, selection.ok, plan.name)}
          </Button>
        )
      }
    >
      {plan.description ? <p className={textRole('caption')}>{plan.description}</p> : null}
      {!selection.ok && !plan.contact_only && selection.reason ? (
        <p className={textRole('caption')}>{billingReasonMessage(selection.reason)}</p>
      ) : null}
    </PlanCard>
  );
}

function monthlyPriceLabel(
  price: HeadlinePrice,
  currencyMinorUnits: number,
  country: string,
): string {
  if (price.kind === 'contact') return 'Contact us';
  if (price.kind === 'unavailable') return price.reason || 'Unavailable';
  const tax = country === 'IN' ? ' + applicable GST' : '';
  return `${formatMoney(price.money, currencyMinorUnits)} / month${tax}`;
}

function planCheckoutLabel(pending: boolean, available: boolean, planName: string): string {
  if (pending) return 'Preparing quote…';
  if (available) return `Choose ${planName}`;
  return `Choose ${planName} (checkout unavailable)`;
}

function planCheckoutState(
  plan: CatalogPlan,
  mode: CredentialMode,
  currencyMinorUnits: number,
  country: string,
  billingDetails: BillingCustomerDetails,
  pending: boolean,
) {
  const price = headlinePrice(plan, mode);
  const selection = checkoutSelection(plan, mode);
  const priceLabel = monthlyPriceLabel(price, currencyMinorUnits, country);
  return {
    priceLabel,
    selection,
    canCheckout: selection.ok && billingDetailsError(country, billingDetails) === null && !pending,
  };
}
