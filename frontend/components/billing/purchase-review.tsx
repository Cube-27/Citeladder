import { CheckoutConsent } from '@/components/billing/billing-policies';
import { BillingQuoteSummary } from '@/components/billing/quote-summary';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { textRole } from '@/components/ui/typography';
import { DisplayTime } from '@/components/ui/display-time';
import { X } from '@/lib/icons';
import type { BillingCatalog } from '@/lib/api/billing';
import { catalogPlanByKey, formatMoney } from '@/lib/billing/catalog';
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
  renewsOn = null,
}: Readonly<{
  checkout: Checkout;
  catalog: BillingCatalog;
  itemName: (key: string) => string;
  /** When an upgraded subscription next renews, at the new plan's price. */
  renewsOn?: string | null;
}>) {
  const prepared = checkout.prepared;
  if (prepared?.status !== 'pending') return null;
  const upgradedPlan =
    prepared.kind === 'upgrade' ? catalogPlanByKey(catalog, prepared.catalog_key) : undefined;
  return (
    <SettingsGroup
      title={KIND_TITLE[prepared.kind]}
      description={
        <>
          {itemName(prepared.catalog_key)}
          {prepared.quantity > 1 ? ` × ${prepared.quantity}` : ''}
          {prepared.kind === 'upgrade' ? ' · prorated for the rest of this period' : ''}
        </>
      }
    >
      <SettingRows
        foot={
          <>
            <Button variant="quiet" disabled={checkout.confirming} onClick={checkout.resetPrepared}>
              <Icon icon={X} />
              Not now
            </Button>
            <Button
              variant="primary"
              disabled={checkout.confirming}
              onClick={() => void checkout.confirmPrepared().catch(() => undefined)}
            >
              {checkout.confirming ? 'Opening checkout…' : 'Confirm and pay'}
            </Button>
          </>
        }
      >
        <BillingQuoteSummary
          quote={prepared.quote}
          currencyMinorUnits={catalog.currency_minor_units}
        />
        {upgradedPlan?.base_price ? (
          <p className={textRole('body', 'text-ink-2')}>
            Then renews at {formatMoney(upgradedPlan.base_price, catalog.currency_minor_units)} a
            month before tax
            {renewsOn ? (
              <>
                , starting <DisplayTime value={renewsOn} dateOnly />
              </>
            ) : (
              ' from your next renewal'
            )}
            .
          </p>
        ) : null}
        <CheckoutConsent recurring={prepared.kind === 'base'} />
      </SettingRows>
    </SettingsGroup>
  );
}
