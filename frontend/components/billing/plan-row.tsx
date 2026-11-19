import { CreditCard } from 'lucide-react';

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
import { billingReasonMessage } from '@/lib/billing/reason-copy';
import { websiteHref } from '@/lib/config/app-link';
import { contactSalesHref } from '@/lib/config/contact';

import { Button } from '@/components/ui/button';
import { ControlRow } from '@/components/ui/control-row';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';

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
  /** Your own provider keys, or managed: the platform's keys at the managed price (B32). */
  mode: CredentialMode;
  currencyMinorUnits: number;
  country: string;
  billingDetails: BillingCustomerDetails;
  pending: boolean;
  /** The reader's role may not buy; the screen says why once, above. */
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
    <ControlRow
      data-tier={plan.key}
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
      <Inline>
        <span className={textRole('body')}>{plan.name}</span>
        <span className={textRole('body', 'text-ink-2 tabular-nums')}>{priceLabel}</span>
      </Inline>
      {plan.description ? <p className="type-caption">{plan.description}</p> : null}
      {!selection.ok && !plan.contact_only && selection.reason ? (
        <p className="type-caption">{billingReasonMessage(selection.reason)}</p>
      ) : null}
    </ControlRow>
  );
}

/** Only India adds the tax note; every other country sees the bare figure. */
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

/** A plan the caller cannot check out still names itself, then says why not. */
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
