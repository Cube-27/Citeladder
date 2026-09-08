'use client';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';

export function CheckoutStatus({
  checkout,
}: Readonly<{ checkout: ReturnType<typeof useSubscriptionCheckout> }>) {
  if (!checkout.notice && !checkout.testMode) return null;
  return (
    <Alert tone="info">
      {checkout.testMode ? <p>Test mode — no real money is charged.</p> : null}
      <output>{checkout.notice}</output>
      <Button variant="secondary" onClick={() => void checkout.refresh()}>
        Refresh payment status
      </Button>
    </Alert>
  );
}
