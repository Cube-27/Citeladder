import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { BillingSupport } from '@/components/billing/billing-policies';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { CurrentPlan, type BillingCancellation } from '@/components/billing/current-plan';
import { ExtraPurchases, type ExtraPurchase } from '@/components/billing/extra-purchases';
import { InvoiceHistory } from '@/components/billing/invoice-history';
import {
  changeOptions,
  PlanChanges,
  type PlanChangeControls,
} from '@/components/billing/plan-changes';
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
import {
  catalogItemName,
  catalogPlanByKey,
  newPlanCheckoutClosed,
  SUBSCRIBED_STATUSES,
} from '@/lib/billing/catalog';
import { useWorkspaceCatalog } from '@/lib/billing/use-workspace-catalog';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';
import { Button } from '@/components/ui/button';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Section } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';

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

function isSubscribed(entitlement: BillingEntitlement | null): boolean {
  const status = entitlement?.subscription?.status;
  return status !== undefined && SUBSCRIBED_STATUSES.has(status);
}

type PlanStep = Readonly<{ label: string; href: string; closed: boolean }>;

/**
 * The page's next step: changing the plan a workspace has, or choosing one it
 * lacks; `closed` when checkout cannot complete it. None while a quote is
 * under review, since its own confirm is then the step.
 */
function planStep({
  catalog,
  entitlement,
  canManage,
  reviewing,
}: Readonly<{
  catalog: BillingCatalog | null;
  entitlement: BillingEntitlement | null;
  canManage: boolean;
  reviewing: boolean;
}>): PlanStep | null {
  if (!canManage || !catalog || reviewing) return null;
  const subscription = entitlement?.subscription ?? null;
  if (subscription?.status === 'pending') return null;
  const currentPlan = currentPlanOf(catalog, entitlement);
  if (isSubscribed(entitlement) && currentPlan) {
    const options = changeOptions(catalog, currentPlan);
    if (options.length === 0) return null;
    const closed = options.every(
      (option) => option.direction === 'upgrade' && !option.plan.checkout_available,
    );
    return { label: 'Change plan', href: '#change-plan', closed };
  }
  return { label: 'Choose a plan', href: '#choose-plan', closed: newPlanCheckoutClosed(catalog) };
}

/**
 * The step in the masthead: the view's primary while checkout is open; while
 * it is closed, a disabled secondary with the reason beside it (2.8 Disabled).
 */
function NextStep({ step }: Readonly<{ step: PlanStep | null }>) {
  if (!step) return null;
  if (step.closed)
    return (
      <>
        <Button variant="secondary" disabled aria-describedby="plan-step-reason">
          {step.label}
        </Button>
        <span id="plan-step-reason" className="type-caption">
          Checkout is not open yet
        </span>
      </>
    );
  return (
    <MastheadPrimary>
      <Button asChild variant="primary">
        <a href={step.href}>{step.label}</a>
      </Button>
    </MastheadPrimary>
  );
}

/**
 * Billing, in the owner's order (2026-11-10): the plan with everything that
 * changes it, then usage, then invoices. A prepared purchase is reviewed
 * right under the plan that started it; the masthead holds the next step.
 */
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
        <StateBlock
          kind="loading"
          label="Loading billing…"
          shape={{ kind: 'facts', rows: 3, tagRows: [1] }}
        />
      </SettingsPage>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <SettingsPage>
        <StateBlock
          kind="error"
          title="Couldn't load billing"
          {...readErrorProps(entitlementQuery)}
          fallback="Entitlement unresolved. No paid capability is active."
        />
      </SettingsPage>
    );
  }
  const entitlement = entitlementQuery.data ?? null;
  const catalog = catalogQuery.data ?? null;
  const { buyExtra, subscribe } = purchaseActions(checkout, country);
  const offers = (
    <PlanOffers
      catalog={catalog}
      catalogRead={catalogQuery}
      entitlement={entitlement}
      canManage={canManage}
      checkout={checkout}
      planChanges={planChanges}
      onBuyExtra={buyExtra}
      newSubscription={{ country, setCountry, details, setDetails, subscribe }}
    />
  );

  return (
    <SettingsPage
      actions={
        <NextStep
          step={planStep({
            catalog,
            entitlement,
            canManage,
            reviewing: checkout.prepared?.status === 'pending',
          })}
        />
      }
    >
      <CheckoutStatus checkout={checkout} />
      {canManage ? null : <Notice tone="info">Plan changes: Owner or Admin only.</Notice>}
      <CurrentPlan
        entitlement={entitlement}
        currentPlan={currentPlanOf(catalog, entitlement)}
        planName={(key) => (catalog ? catalogItemName(catalog, key) : key)}
        canManage={canManage}
        cancellation={cancellation}
      />
      {catalog ? (
        <PurchaseReview
          checkout={checkout}
          catalog={catalog}
          itemName={(key) => catalogItemName(catalog, key)}
          renewsOn={entitlement?.subscription?.current_period_end ?? null}
        />
      ) : null}
      {offers}
      <UsageMeters />
      <InvoiceHistory invoices={invoiceQuery.data ?? []} read={invoiceQuery} />
      <BillingSupport contact={catalog?.support_contact ?? null} />
    </SettingsPage>
  );
}

/** What changes the plan: a plan change and extras for a subscriber, else a new plan. */
function PlanOffers({
  catalog,
  catalogRead,
  entitlement,
  canManage,
  checkout,
  planChanges,
  onBuyExtra,
  newSubscription,
}: Readonly<{
  catalog: BillingCatalog | null;
  catalogRead: RetryableRead & Readonly<{ isError: boolean; isLoading: boolean }>;
  entitlement: BillingEntitlement | null;
  canManage: boolean;
  checkout: Checkout;
  planChanges: PlanChangeControls;
  onBuyExtra: ExtraPurchase;
  newSubscription: NewSubscription;
}>) {
  if (catalogRead.isError) {
    return (
      <Section aria-label="Plans">
        <StateBlock
          kind="error"
          title="Couldn't load plans"
          {...readErrorProps(catalogRead)}
          fallback="Couldn't load the plan catalog."
        />
      </Section>
    );
  }
  if (catalogRead.isLoading || !catalog)
    return (
      <Section aria-label="Plans">
        <StateBlock kind="loading" label="Loading plans…" shape={{ kind: 'list' }} />
      </Section>
    );
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
