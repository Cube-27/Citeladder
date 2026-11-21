import type { BillingEntitlement } from '@/lib/api/billing';

import { Input } from '@/components/ui/input';
import { SettingField } from '@/components/ui/setting-row';
import { textRole } from '@/components/ui/typography';
import { DisplayTime } from '@/components/ui/display-time';

export function BillingCountryInput({
  country,
  setCountry,
}: Readonly<{ country: string; setCountry: (country: string) => void }>) {
  return (
    <SettingField inline label="Billing country" hint="Two-letter ISO code">
      {(field) => (
        <Input
          {...field}
          value={country}
          onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))}
          placeholder="US"
        />
      )}
    </SettingField>
  );
}

export function SubscriptionDetail({
  subscription,
  periodEnd,
}: Readonly<{
  subscription: BillingEntitlement['subscription'] | null;
  periodEnd: string | null | undefined;
}>) {
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
