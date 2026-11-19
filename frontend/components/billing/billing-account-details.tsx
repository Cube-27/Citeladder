import type { BillingEntitlement } from '@/lib/api/billing';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { textRole } from '@/components/ui/typography';
import { DisplayTime } from '@/components/ui/display-time';
import { wellClasses } from '@/components/ui/slip';

export function BillingCountryInput({
  country,
  setCountry,
}: Readonly<{ country: string; setCountry: (country: string) => void }>) {
  return (
    <Field label="Billing country" hint="Two-letter ISO code" className={wellClasses()}>
      {(field) => (
        <Input
          {...field}
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))}
          placeholder="US"
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
  // The plan's name already reads "No active plan".
  if (!subscription) return null;
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
