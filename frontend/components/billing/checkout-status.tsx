'use client';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import type { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';

export function CheckoutStatus({
  checkout,
}: Readonly<{ checkout: ReturnType<typeof useSubscriptionCheckout> }>) {
  if (!checkout.notice && !checkout.testMode) return null;
  return (
    <Alert tone="info">
      <Stack gap="compact" className="justify-items-start">
        {checkout.testMode ? <p>Test mode — no real money is charged.</p> : null}
        {checkout.notice ? <output>{checkout.notice}</output> : null}
        <Button variant="secondary" onClick={() => void checkout.refresh()}>
          Refresh payment status
        </Button>
      </Stack>
    </Alert>
  );
}
