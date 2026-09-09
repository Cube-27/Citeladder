'use client';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { billingDetailsError, type BillingCustomerDetails } from '@/lib/api/billing';

export function PricingBillingDialog({
  open,
  onOpenChange,
  country,
  setCountry,
  details,
  setDetails,
  onContinue,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string;
  setCountry: (country: string) => void;
  details: BillingCustomerDetails;
  setDetails: (details: BillingCustomerDetails) => void;
  onContinue: () => void;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complete your billing details"
      description="These details are needed to prepare your checkout and invoice."
      footer={
        <Button disabled={billingDetailsError(country, details) !== null} onClick={onContinue}>
          Continue to checkout
        </Button>
      }
    >
      <div className="grid gap-5">
        <BillingCountryInput country={country} setCountry={setCountry} />
        <BillingDetailsForm
          country={country}
          details={details}
          setDetails={setDetails}
          idPrefix="pricing"
        />
      </div>
    </Dialog>
  );
}
