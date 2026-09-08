import type { BillingEntitlement } from '@/lib/api/billing';

import { Input } from '@/components/ui/input';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

export function BillingCountryInput({
  country,
  setCountry,
}: Readonly<{ country: string; setCountry: (country: string) => void }>) {
  return (
    <div
      className={panelClasses(
        { tone: 'tonal', pad: 'compact' },
        'flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center',
      )}
    >
      <div className="min-w-0">
        <label htmlFor="billing-country-input" className={textRole('label', 'block')}>
          Billing country
        </label>
        <span id="billing-country-help" className="text-muted block text-xs">
          Two-letter ISO code. The server resolves currency, tax and the exact amount from it.
        </span>
      </div>
      <Input
        id="billing-country-input"
        value={country}
        onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))}
        placeholder="US"
        aria-describedby="billing-country-help"
        className={textRole('label', 'h-8 w-20 text-center font-mono uppercase')}
      />
    </div>
  );
}

export function SubscriptionDetail({
  subscription,
  periodEnd,
}: Readonly<{
  subscription: BillingEntitlement['subscription'] | null;
  periodEnd: string | null | undefined;
}>) {
  if (!subscription) return <p className={textRole('meta')}>No active subscription</p>;
  return (
    <p className={textRole('meta')}>
      Subscription: {subscription.status.replaceAll('_', ' ')}
      {periodEnd ? (
        <>
          {' · '}
          {subscription.cancel_at_period_end ? 'Access scheduled to end ' : 'Current period ends '}
          {new Date(periodEnd).toLocaleDateString('en-US', {
            dateStyle: 'medium',
            timeZone: 'UTC',
          })}
          .
        </>
      ) : null}
    </p>
  );
}
