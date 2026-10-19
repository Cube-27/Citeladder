import type { BillingEntitlement } from '@/lib/api/billing';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import { DisplayTime } from '@/components/ui/display-time';

export function BillingCountryInput({
  country,
  setCountry,
}: Readonly<{ country: string; setCountry: (country: string) => void }>) {
  return (
    <Field
      label="Billing country"
      hint="Two-letter ISO code. The server resolves currency, tax and the exact amount from it."
      className={panelClasses({ tone: 'tonal' })}
    >
      {(field) => (
        <Input
          {...field}
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))}
          placeholder="US"
          className="uppercase tabular-nums"
        />
      )}
    </Field>
  );
}

export function SubscriptionDetail({
  subscription,
  periodEnd,
}: Readonly<{
  subscription: BillingEntitlement['subscription'] | null;
  periodEnd: string | null | undefined;
}>) {
  if (!subscription) return <p className={textRole('caption')}>No active subscription</p>;
  return (
    <p className={textRole('caption')}>
      Subscription: {subscription.status.replaceAll('_', ' ')}
      {periodEnd ? (
        <>
          {' · '}
          {subscription.cancel_at_period_end ? 'Access scheduled to end ' : 'Current period ends '}
          <DisplayTime value={periodEnd} dateOnly />.
        </>
      ) : null}
    </p>
  );
}
