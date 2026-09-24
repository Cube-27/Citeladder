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
      <div className="grid justify-items-start gap-2">
        {checkout.testMode ? <p>Test mode — no real money is charged.</p> : null}
        {checkout.notice ? <output>{checkout.notice}</output> : null}
        <Button variant="secondary" size="sm" onClick={() => void checkout.refresh()}>
          Refresh payment status
        </Button>
      </div>
    </Alert>
  );
}
