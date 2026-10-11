'use client';

import { useEffect, useState } from 'react';

import { CheckoutStatus } from '@/components/billing/checkout-status';
import { ChoosePlan, subscribeWith } from '@/components/billing/choose-plan';
import { PurchaseReview } from '@/components/billing/purchase-review';
import { Alert } from '@/components/ui/alert';
import { Stack } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { emptyBillingCustomerDetails } from '@/lib/api/billing';
import { catalogItemName } from '@/lib/billing/catalog';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { useWorkspaceCatalog } from '@/lib/billing/use-workspace-catalog';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Buying a plan from the ended-access screen: only the plans, the quote and the
 * checkout, which the server keeps open to a workspace whose trial or plan ended.
 */
export function RestorePlan({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const canManage = useWorkspaceCapability('manage_billing');
  const [country, setCountry] = useState('');
  const [details, setDetails] = useState(emptyBillingCustomerDetails);
  const catalogQuery = useWorkspaceCatalog(canManage ? workspaceId : null, country);
  const checkout = useSubscriptionCheckout();
  const resetPrepared = checkout.resetPrepared;
  useEffect(() => {
    resetPrepared();
  }, [workspaceId, country, details, resetPrepared]);
  if (!canManage) return <p>Ask a workspace Owner or Admin to choose a plan for this workspace.</p>;
  if (catalogQuery.isError)
    return <Alert tone="danger">Plans could not be loaded. Retry, or contact support.</Alert>;
  const catalog = catalogQuery.data;
  if (!catalog) return <Skeleton className="h-32 w-full" />;
  return (
    <Stack gap="workspace">
      <CheckoutStatus checkout={checkout} />
      <PurchaseReview
        checkout={checkout}
        catalog={catalog}
        itemName={(key) => catalogItemName(catalog, key)}
        renewsOn={null}
      />
      <ChoosePlan
        catalog={catalog}
        canManage={canManage}
        pending={checkout.preparing}
        country={country}
        setCountry={setCountry}
        details={details}
        setDetails={setDetails}
        subscribe={subscribeWith(checkout, country)}
      />
    </Stack>
  );
}
