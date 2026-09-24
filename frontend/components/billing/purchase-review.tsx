'use client';

import { CheckoutConsent } from '@/components/billing/billing-policies';
import { BillingQuoteSummary } from '@/components/billing/quote-summary';
import { Button } from '@/components/ui/button';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import type { BillingCatalog } from '@/lib/api/billing';
import type { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';

type Checkout = ReturnType<typeof useSubscriptionCheckout>;

const KIND_TITLE = {
  base: 'Review your subscription',
  upgrade: 'Review your upgrade',
  addon: 'Review your add-on',
  topup: 'Review your top-up',
} as const;

/**
 * The one confirm-and-pay step. Whatever was chosen — a plan, an upgrade's
 * prorated charge, an add-on or a top-up — the server's quote is shown in
 * full with the consent copy before the payment provider opens.
 */
export function PurchaseReview({
  checkout,
  catalog,
  itemName,
}: Readonly<{ checkout: Checkout; catalog: BillingCatalog; itemName: (key: string) => string }>) {
  const prepared = checkout.prepared;
  if (!prepared || prepared.status !== 'pending') return null;
  return (
    <section className={panelClasses({}, 'grid gap-3')} aria-labelledby="purchase-review-title">
      <div className="grid gap-0.5">
        <h2 id="purchase-review-title" className={textRole('sectionTitle')}>
          {KIND_TITLE[prepared.kind]}
        </h2>
        <p className={textRole('meta')}>
          {itemName(prepared.catalog_key)}
          {prepared.quantity > 1 ? ` × ${prepared.quantity}` : ''}
          {prepared.kind === 'upgrade' ? ' · prorated for the rest of this period' : ''}
        </p>
      </div>
      <BillingQuoteSummary
        quote={prepared.quote}
        currencyMinorUnits={catalog.currency_minor_units}
      />
      <CheckoutConsent recurring={prepared.kind === 'base'} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={checkout.confirming}
          onClick={() => void checkout.confirmPrepared().catch(() => undefined)}
        >
          {checkout.confirming ? 'Opening checkout…' : 'Confirm and pay'}
        </Button>
        <Button variant="secondary" disabled={checkout.confirming} onClick={checkout.resetPrepared}>
          Not now
        </Button>
      </div>
    </section>
  );
}
