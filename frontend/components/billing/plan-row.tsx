'use client';

import Link from 'next/link';
import { CreditCard, ExternalLink } from 'lucide-react';

import {
  billingDetailsError,
  type BillingCustomerDetails,
  type CatalogPlan,
  type SelfServePlanKey,
} from '@/lib/api/billing';
import { checkoutSelection, formatMoney, headlinePrice } from '@/lib/billing/catalog';
import { CONTACT_SALES_HREF } from '@/lib/config/billing';

import { Button } from '@/components/ui/button';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

export function PlanRow({
  plan,
  currencyMinorUnits,
  country,
  billingDetails,
  pending,
  onCheckout,
}: Readonly<{
  plan: CatalogPlan;
  currencyMinorUnits: number;
  country: string;
  billingDetails: BillingCustomerDetails;
  pending: boolean;
  onCheckout: (key: SelfServePlanKey, details: BillingCustomerDetails) => void;
}>) {
  const { priceLabel, selection, canCheckout } = planCheckoutState(
    plan,
    currencyMinorUnits,
    country,
    billingDetails,
    pending,
  );
  return (
    <div
      className={panelClasses(
        { tone: 'tonal', pad: 'compact' },
        'flex flex-col justify-between gap-3 sm:flex-row sm:items-center',
      )}
      data-tier={plan.key}
    >
      <div className="grid min-w-0 gap-0.5">
        <div className="flex items-center gap-2">
          <span className={textRole('bodyStrong')}>{plan.name}</span>
          <span className={textRole('label', 'font-mono')}>{priceLabel}</span>
        </div>
        {plan.description ? <p className="text-muted text-xs">{plan.description}</p> : null}
        {!selection.ok && !plan.contact_only && selection.reason ? (
          <p className="text-muted text-xs">{selection.reason}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        {plan.contact_only ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={plan.contact_url ?? CONTACT_SALES_HREF} target="_blank" rel="noreferrer">
              Contact sales <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canCheckout}
            onClick={() => selection.ok && onCheckout(selection.catalog_key, billingDetails)}
          >
            <CreditCard className="size-3.5" aria-hidden />
            {pending
              ? 'Opening checkout…'
              : selection.ok
                ? `Choose ${plan.name}`
                : `Choose ${plan.name} — checkout unavailable`}
          </Button>
        )}
      </div>
    </div>
  );
}

function planCheckoutState(
  plan: CatalogPlan,
  currencyMinorUnits: number,
  country: string,
  billingDetails: BillingCustomerDetails,
  pending: boolean,
) {
  const price = headlinePrice(plan, 'byok');
  const selection = checkoutSelection(plan, 'byok');
  const priceLabel =
    price.kind === 'price'
      ? `${formatMoney(price.money, currencyMinorUnits)} / month${country === 'IN' ? ' + applicable GST' : ''}`
      : price.kind === 'contact'
        ? 'Contact us'
        : price.reason || 'Unavailable';
  return {
    priceLabel,
    selection,
    canCheckout: selection.ok && billingDetailsError(country, billingDetails) === null && !pending,
  };
}
