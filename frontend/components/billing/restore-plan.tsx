import { useEffect, useState } from 'react';

import { CheckoutStatus } from '@/components/billing/checkout-status';
import { ChoosePlan, subscribeWith } from '@/components/billing/choose-plan';
import { PurchaseReview } from '@/components/billing/purchase-review';
import { emptyBillingCustomerDetails } from '@/lib/api/billing';
import { catalogItemName } from '@/lib/billing/catalog';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { useWorkspaceCatalog } from '@/lib/billing/use-workspace-catalog';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

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
  if (!canManage) return <p>Owner or Admin only.</p>;
  if (catalogQuery.isError)
    return (
      <StateBlock
        kind="error"
        title="Couldn't load plans"
        {...readErrorProps(catalogQuery)}
        fallback="Plans could not be loaded. Retry, or contact support."
      />
    );
  const catalog = catalogQuery.data;
  if (!catalog)
    return <StateBlock kind="loading" label="Loading plans…" shape={{ kind: 'list' }} />;
  return (
    <>
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
    </>
  );
}
