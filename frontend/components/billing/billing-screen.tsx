import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { BillingSupport } from '@/components/billing/billing-policies';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { CurrentPlan, type BillingCancellation } from '@/components/billing/current-plan';
import { ExtraPurchases, type ExtraPurchase } from '@/components/billing/extra-purchases';
import { InvoiceHistory } from '@/components/billing/invoice-history';
import { PlanChanges, type PlanChangeControls } from '@/components/billing/plan-changes';
import { ChoosePlan, subscribeWith, type NewSubscription } from '@/components/billing/choose-plan';
import { PurchaseReview } from '@/components/billing/purchase-review';
import { UsageMeters } from '@/components/billing/usage-meters';
import { SettingsPage } from '@/components/templates/settings-page';
import {
  billingMutations,
  billingQueries,
  emptyBillingCustomerDetails,
  type BillingCatalog,
  type BillingEntitlement,
} from '@/lib/api/billing';
import { catalogItemName, catalogPlanByKey } from '@/lib/billing/catalog';
import { useWorkspaceCatalog } from '@/lib/billing/use-workspace-catalog';
import type { SubscriptionStatus } from '@citeladder/contracts/billing';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/**
 * Subscription states in which the workspace HAS a plan to change, cancel or
 * extend. Anything else — no subscription, ended, unpaid — is offered a new
 * subscription instead; `pending` is offered neither while it verifies.
 */
const SUBSCRIBED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
  'cancel_scheduled',
]);

type Checkout = ReturnType<typeof useSubscriptionCheckout>;

/**
 * The billing reads, each scoped to the active workspace so one workspace's
 * plan and receipts never render in another's view.
 */
function useBillingReads(workspaceId: string | null, country: string) {
  const entitlementQuery = useQuery({ ...billingQueries.entitlement(workspaceId), retry: false });
  const catalogQuery = useWorkspaceCatalog(workspaceId, country);
  const invoiceQuery = useQuery({ ...billingQueries.invoices(workspaceId), retry: false });
  return { entitlementQuery, catalogQuery, invoiceQuery };
}

function useCancellation(workspaceId: string | null): BillingCancellation {
  const [open, setOpen] = useState(false);
  const resume = useMutation(billingMutations.resumeSubscription(workspaceId));
  const mutation = useMutation(billingMutations.cancelSubscription(workspaceId));
  return {
    open,
    // Each attempt starts clean: a failure belongs to the dialog that made it.
    setOpen: (next) => {
      if (next) mutation.reset();
      setOpen(next);
    },
    pending: mutation.isPending,
    error: mutation.error,
    confirm: () => mutation.mutate(undefined, { onSuccess: () => setOpen(false) }),
    resume: () => resume.mutate(),
    resuming: resume.isPending,
    resumeError: resume.error,
  };
}

function usePlanChangeControls(workspaceId: string | null, checkout: Checkout): PlanChangeControls {
  const downgrade = useMutation(billingMutations.downgrade(workspaceId));
  return {
    upgrade: (key) =>
      void checkout
        .prepare({ purchase: { kind: 'upgrade', catalog_key: key } })
        .catch(() => undefined),
    downgrade: (key) => downgrade.mutate(key),
    pending: downgrade.isPending || checkout.preparing,
    downgradeError: downgrade.error,
  };
}

/** Quote requests for a new subscription and for one-time extras. */
function purchaseActions(checkout: Checkout, country: string) {
  const buyExtra: ExtraPurchase = (kind, catalogKey, quantity) =>
    void checkout
      .prepare({ purchase: { kind, catalog_key: catalogKey, quantity } })
      .catch(() => undefined);
  return { buyExtra, subscribe: subscribeWith(checkout, country) };
}

function currentPlanOf(catalog: BillingCatalog | null, entitlement: BillingEntitlement | null) {
  const subscription = entitlement?.subscription;
  if (!catalog || !subscription) return null;
  return catalogPlanByKey(catalog, subscription.catalog_key) ?? null;
}

/** The dedicated billing section: three cards, Plan, Usage and Invoices. */
export function BillingScreen() {
  const { isLoading: entitlementLoading } = useEntitlement();
  const workspaceId = useActiveWorkspaceId();
  const canManage = useWorkspaceCapability('manage_billing');
  const [country, setCountry] = useState('');
  const [details, setDetails] = useState(emptyBillingCustomerDetails);
  const { entitlementQuery, catalogQuery, invoiceQuery } = useBillingReads(workspaceId, country);
  const checkout = useSubscriptionCheckout();
  const cancellation = useCancellation(workspaceId);
  const planChanges = usePlanChangeControls(workspaceId, checkout);
  const resetPrepared = checkout.resetPrepared;
  // A quote answers the exact inputs it was asked for; change them and it is stale.
  useEffect(() => {
    resetPrepared();
  }, [workspaceId, country, details, resetPrepared]);

  if (entitlementLoading || entitlementQuery.isLoading) {
    return (
      <SettingsPage>
        <StateBlock kind="loading" label="Loading billing…" />
      </SettingsPage>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <SettingsPage>
        <Notice tone="negative">
          Your entitlement could not be resolved, so no billing change is offered. No paid
          capability is active until it does; reload the page or contact support.
        </Notice>
      </SettingsPage>
    );
  }
  const entitlement = entitlementQuery.data ?? null;
  const catalog = catalogQuery.data ?? null;
  const { buyExtra, subscribe } = purchaseActions(checkout, country);

  return (
    <SettingsPage>
      <CheckoutStatus checkout={checkout} />
      {canManage ? null : (
        <Notice tone="info">
          Only a workspace Owner or Admin can change this workspace’s plan or buy add-ons.
        </Notice>
      )}
      {/* Three cards (owner, 2026-11-10): the plan with everything that
          changes it, then usage, then invoices. A prepared purchase is
          reviewed right under the plan card that started it. */}
      <CurrentPlan
        entitlement={entitlement}
        currentPlan={currentPlanOf(catalog, entitlement)}
        planName={(key) => (catalog ? catalogItemName(catalog, key) : key)}
        canManage={canManage}
        cancellation={cancellation}
      >
        <PlanSection
          catalog={catalog}
          catalogLoading={catalogQuery.isLoading}
          catalogError={catalogQuery.isError}
          entitlement={entitlement}
          canManage={canManage}
          checkout={checkout}
          planChanges={planChanges}
          onBuyExtra={buyExtra}
          newSubscription={{ country, setCountry, details, setDetails, subscribe }}
        />
      </CurrentPlan>
      {catalog ? (
        <PurchaseReview
          checkout={checkout}
          catalog={catalog}
          itemName={(key) => catalogItemName(catalog, key)}
          renewsOn={entitlement?.subscription?.current_period_end ?? null}
        />
      ) : null}
      <UsageMeters />
      <InvoiceHistory
        invoices={invoiceQuery.data ?? []}
        loading={invoiceQuery.isLoading}
        error={invoiceQuery.isError}
      />
      <BillingSupport contact={catalog?.support_contact ?? null} />
    </SettingsPage>
  );
}

function PlanSection({
  catalog,
  catalogLoading,
  catalogError,
  entitlement,
  canManage,
  checkout,
  planChanges,
  onBuyExtra,
  newSubscription,
}: Readonly<{
  catalog: BillingCatalog | null;
  catalogLoading: boolean;
  catalogError: boolean;
  entitlement: BillingEntitlement | null;
  canManage: boolean;
  checkout: Checkout;
  planChanges: PlanChangeControls;
  onBuyExtra: ExtraPurchase;
  newSubscription: NewSubscription;
}>) {
  if (catalogError) {
    return (
      <Notice tone="negative">
        Could not load the plan catalog. Check your connection and retry.
      </Notice>
    );
  }
  if (catalogLoading || !catalog) return <StateBlock kind="loading" label="Loading plans…" />;
  const subscription = entitlement?.subscription ?? null;
  const currentPlan = subscription ? catalogPlanByKey(catalog, subscription.catalog_key) : null;
  if (subscription && currentPlan && SUBSCRIBED_STATUSES.has(subscription.status)) {
    return (
      <>
        <PlanChanges
          catalog={catalog}
          currentPlan={currentPlan}
          subscription={subscription}
          canManage={canManage}
          controls={planChanges}
        />
        <ExtraPurchases
          catalog={catalog}
          planKey={currentPlan.key}
          entitlement={entitlement}
          disabled={!canManage || checkout.preparing}
          onBuy={onBuyExtra}
        />
      </>
    );
  }
  if (subscription?.status === 'pending') return null;
  return (
    <ChoosePlan
      catalog={catalog}
      canManage={canManage}
      pending={checkout.preparing}
      {...newSubscription}
    />
  );
}
