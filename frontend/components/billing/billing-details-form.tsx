'use client';

import type { BillingCustomerDetails } from '@/lib/api/billing';

import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { textRole } from '@/components/ui/typography';

type BillingDetailsFormProps = Readonly<{
  country: string;
  details: BillingCustomerDetails;
  setDetails: (details: BillingCustomerDetails) => void;
  idPrefix: 'pricing' | 'settings';
}>;

const addressFields = [
  ['billing_name', 'Billing name', 'name'],
  ['billing_address_line1', 'Address', 'street-address'],
  ['billing_city', 'City', 'address-level2'],
  ['billing_postal_code', 'Postal code', 'postal-code'],
] as const satisfies ReadonlyArray<readonly [keyof BillingCustomerDetails, string, string]>;

export function BillingDetailsForm({
  country,
  details,
  setDetails,
  idPrefix,
}: BillingDetailsFormProps) {
  const update = (key: keyof BillingCustomerDetails, value: string | boolean) =>
    setDetails({ ...details, [key]: value });
  const india = country.trim().toUpperCase() === 'IN';

  return (
    <fieldset className="border-border-subtle grid gap-3 rounded-[var(--radius-card)] border p-4">
      <legend className={textRole('label', 'px-1')}>Billing details</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {addressFields.map(([key, label, autoComplete]) => (
          <label key={key} className="grid gap-1 text-sm">
            {label}
            <Input
              value={details[key]}
              autoComplete={autoComplete}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      {india ? (
        <>
          <label htmlFor={`${idPrefix}-billing-state-code`} className="grid gap-1 text-sm">
            Billing state code
            <Input
              id={`${idPrefix}-billing-state-code`}
              value={details.billing_state_code}
              maxLength={3}
              autoComplete="address-level1"
              onChange={(event) => update('billing_state_code', event.target.value.toUpperCase())}
            />
            <span className="text-muted text-xs">GSTIN is optional for Indian customers.</span>
          </label>
          <label htmlFor={`${idPrefix}-customer-gstin`} className="grid gap-1 text-sm">
            GSTIN (optional)
            <Input
              id={`${idPrefix}-customer-gstin`}
              value={details.customer_gstin}
              autoComplete="off"
              onChange={(event) => update('customer_gstin', event.target.value.toUpperCase())}
            />
          </label>
        </>
      ) : (
        <Checkbox
          className="text-secondary items-start"
          label="I confirm this purchase qualifies as an export of service."
          checked={details.export_eligibility_attested}
          onCheckedChange={(checked) => update('export_eligibility_attested', checked === true)}
        />
      )}
    </fieldset>
  );
}
