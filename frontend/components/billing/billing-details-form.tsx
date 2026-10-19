'use client';

import type { BillingCustomerDetails } from '@/lib/api/billing';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';

type BillingDetailsFormProps = Readonly<{
  country: string;
  details: BillingCustomerDetails;
  setDetails: (details: BillingCustomerDetails) => void;
}>;

const addressFields = [
  ['billing_name', 'Billing name', 'name'],
  ['billing_address_line1', 'Address', 'street-address'],
  ['billing_city', 'City', 'address-level2'],
  ['billing_postal_code', 'Postal code', 'postal-code'],
] as const satisfies ReadonlyArray<readonly [keyof BillingCustomerDetails, string, string]>;

export function BillingDetailsForm({ country, details, setDetails }: BillingDetailsFormProps) {
  const update = (key: keyof BillingCustomerDetails, value: string | boolean) =>
    setDetails({ ...details, [key]: value });
  const india = country.trim().toUpperCase() === 'IN';

  return (
    <Stack as="fieldset" gap="compact" className={panelClasses()}>
      <legend className={textRole('label')}>Billing details</legend>
      <Stack gap="compact" className="desktop:grid-cols-2">
        {addressFields.map(([key, label, autoComplete]) => (
          <Field key={key} label={label}>
            {(field) => (
              <Input
                {...field}
                value={details[key]}
                autoComplete={autoComplete}
                onChange={(event) => update(key, event.target.value)}
              />
            )}
          </Field>
        ))}
      </Stack>
      {india ? (
        <>
          <Field label="Billing state code" hint="GSTIN is optional for Indian customers.">
            {(field) => (
              <Input
                {...field}
                value={details.billing_state_code}
                maxLength={3}
                autoComplete="address-level1"
                onChange={(event) => update('billing_state_code', event.target.value.toUpperCase())}
              />
            )}
          </Field>
          <Field label="GSTIN (optional)">
            {(field) => (
              <Input
                {...field}
                value={details.customer_gstin}
                autoComplete="off"
                onChange={(event) => update('customer_gstin', event.target.value.toUpperCase())}
              />
            )}
          </Field>
        </>
      ) : (
        <Checkbox
          className="text-secondary items-start"
          label="I confirm this purchase qualifies as an export of service."
          checked={details.export_eligibility_attested}
          onCheckedChange={(checked) => update('export_eligibility_attested', checked === true)}
        />
      )}
    </Stack>
  );
}
