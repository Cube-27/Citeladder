'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { BillingSupport } from '@/components/billing/billing-policies';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { CurrentPlan, type BillingCancellation } from '@/components/billing/current-plan';
import { ExtraPurchases, type ExtraPurchase } from '@/components/billing/extra-purchases';
import { InvoiceHistory } from '@/components/billing/invoice-history';
import { PlanChanges, type PlanChangeControls } from '@/components/billing/plan-changes';
import { PlanRow } from '@/components/billing/plan-row';
import { PurchaseReview } from '@/components/billing/purchase-review';
import { UsageMeters } from '@/components/billing/usage-meters';
import { PageLoading } from '@/components/layout/page-loading';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { panelClasses } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import {
  billingApi,
  createIdempotencyKey,
  emptyBillingCustomerDetails,
  type BillingCatalog,
  type BillingCustomerDetails,
  type BillingEntitlement,
  type SelfServePlanKey,
} from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { catalogPlanByKey } from '@/lib/billing/catalog';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Subscription states in which the workspace HAS a plan to change, cancel or
 * extend. Anything else — no subscription, ended, unpaid — is offered a new
 * subscription instead; `pending` is offered neither while it verifies.
 */
const SUBSCRIBED_STATUSES = new Set(['active', 'trialing', 'past_due', 'cancel_scheduled']);

type Checkout = ReturnType<typeof useSubscriptionCheckout>;

/**
 * The billing reads, each scoped to the active workspace so one workspace's
 * plan and receipts never render in another's view.
 */
function useBillingReads(workspaceId: string | null, country: string) {
  const reads = workspaceId !== null;
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.entitlement(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => billingApi.entitlement({ signal, workspaceId }),
    enabled: reads,
    retry: false,
  });
  const catalogQuery = useQuery({
    queryKey: queryKeys.billing.catalog(country || undefined),
    queryFn: ({ signal }) =>
      billingApi.catalog(country || undefined, { signal, workspaceId: null }),
    placeholderData: keepPreviousData,
  });
  const invoiceQuery = useQuery({
    queryKey: queryKeys.billing.invoices(workspaceId),
    queryFn: ({ signal }) => billingApi.invoices({ signal, workspaceId }),
    enabled: reads,
    retry: false,
  });
  return { entitlementQuery, catalogQuery, invoiceQuery };
}

function useCancellation(workspaceId: string | null): BillingCancellation {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => billingApi.cancelSubscription({ workspaceId }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
  });
  return {
    open,
    setOpen,
    pending: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    confirm: () => mutation.mutate(),
  };
}

function usePlanChangeControls(workspaceId: string | null, checkout: Checkout): PlanChangeControls {
  const queryClient = useQueryClient();
  const downgrade = useMutation({
    mutationFn: (key: SelfServePlanKey) =>
      billingApi.changePlan(key, createIdempotencyKey(), { workspaceId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.all }),
  });
  return {
    upgrade: (key) =>
      void checkout
        .prepare({ purchase: { kind: 'upgrade', catalog_key: key } })
        .catch(() => undefined),
    downgrade: (key) => downgrade.mutate(key),
    pending: downgrade.isPending || checkout.preparing,
    downgradeError: downgrade.isError ? downgrade.error : null,
  };
}

/** The dedicated billing section: plan, changes, extras, usage and documents. */
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
    return <PageLoading label="Loading billing…" />;
  }
  const entitlement = entitlementQuery.data ?? null;
  const catalog = catalogQuery.data ?? null;
  const buyExtra: ExtraPurchase = (kind, catalogKey, quantity) =>
    void checkout
      .prepare({ purchase: { kind, catalog_key: catalogKey, quantity } })
      .catch(() => undefined);
  const subscribe = (key: SelfServePlanKey, billingDetails: BillingCustomerDetails) =>
    void checkout
      .prepare({
        purchase: {
          kind: 'base',
          input: {
            catalog_key: key,
            credential_mode: 'byok',
            country_code: country,
            ...billingDetails,
          },
        },
      })
      .catch(() => undefined);

  return (
    <PageShell>
      <div className="grid gap-[var(--workspace-gap)]">
        <CheckoutStatus checkout={checkout} />
        {canManage ? null : (
          <Alert tone="info">
            Only a workspace Owner or Admin can change this workspace’s plan or buy add-ons.
          </Alert>
        )}
        <CurrentPlan
          entitlement={entitlement}
          currentPlan={
            catalog && entitlement?.subscription
              ? (catalogPlanByKey(catalog, entitlement.subscription.catalog_key) ?? null)
              : null
          }
          planName={(key) => (catalog ? itemName(catalog, key) : key)}
          canManage={canManage}
          cancellation={cancellation}
        />
        {catalog ? (
          <PurchaseReview
            checkout={checkout}
            catalog={catalog}
            itemName={(key) => itemName(catalog, key)}
          />
        ) : null}
        <div className="grid gap-[var(--workspace-gap)] lg:grid-cols-12 lg:items-start">
          <div className="grid gap-[var(--workspace-gap)] lg:col-span-7">
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
          </div>
          <div className="lg:col-span-5">
            <UsageMeters />
          </div>
        </div>
        <InvoiceHistory
          invoices={invoiceQuery.data ?? []}
          loading={invoiceQuery.isLoading}
          error={invoiceQuery.isError}
        />
        <BillingSupport contact={catalog?.support_contact ?? null} />
      </div>
    </PageShell>
  );
}

function itemName(catalog: BillingCatalog, key: string): string {
  const entry = [...catalog.plans, ...catalog.addons, ...catalog.topups].find(
    (candidate) => candidate.key === key,
  );
  return entry?.name ?? key;
}

type NewSubscription = {
  country: string;
  setCountry: (country: string) => void;
  details: BillingCustomerDetails;
  setDetails: (details: BillingCustomerDetails) => void;
  subscribe: (key: SelfServePlanKey, details: BillingCustomerDetails) => void;
};

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
      <Alert tone="danger">Could not load the plan catalog. Check your connection and retry.</Alert>
    );
  }
  if (catalogLoading || !catalog) return <Skeleton className="h-24 w-full" />;
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

function ChoosePlan({
  catalog,
  canManage,
  pending,
  country,
  setCountry,
  details,
  setDetails,
  subscribe,
}: Readonly<
  NewSubscription & { catalog: BillingCatalog; canManage: boolean; pending: boolean }
>): ReactNode {
  return (
    <section className={panelClasses({}, 'grid gap-4')} aria-labelledby="choose-plan-title">
      <div className="grid gap-0.5">
        <h2 id="choose-plan-title" className={textRole('sectionTitle')}>
          Choose a plan
        </h2>
        <p className="text-muted text-xs">
          Your billing country sets the currency and tax; you review the exact quote before paying.
          Audits run on your own provider keys, billed by those providers directly.
        </p>
      </div>
      <BillingCountryInput country={country} setCountry={setCountry} />
      <BillingDetailsForm
        country={country}
        details={details}
        setDetails={setDetails}
        idPrefix="settings"
      />
      <div className="grid gap-2.5">
        {catalog.plans.map((plan) => (
          <PlanRow
            key={plan.key}
            plan={plan}
            currencyMinorUnits={catalog.currency_minor_units}
            country={country}
            billingDetails={details}
            pending={pending}
            locked={!canManage}
            onCheckout={subscribe}
          />
        ))}
      </div>
    </section>
  );
}
