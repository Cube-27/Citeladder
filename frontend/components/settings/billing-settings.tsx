'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { UsageMeters } from '@/components/billing/usage-meters';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import {
  BillingCountryInput,
  SubscriptionDetail,
} from '@/components/billing/billing-account-details';
import { BillingQuoteSummary } from '@/components/billing/quote-summary';
import { InvoiceHistory } from '@/components/billing/invoice-history';
import { CardTrialPanel } from '@/components/settings/card-trial-panel';
import {
  billingApi,
  emptyBillingCustomerDetails,
  type BillingCustomerDetails,
  type BillingEntitlement,
  type BillingQuote,
  type CatalogPlan,
  type SelfServePlanKey,
} from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { catalogPlanByKey } from '@/lib/billing/catalog';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { textRole } from '@/components/ui/typography';
import { panelClasses } from '@/components/ui/panel';
import { PlanRow } from '@/components/billing/plan-row';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

type BillingCheckout = {
  pending: boolean;
  error: unknown;
  quote: BillingQuote | null;
  start: (key: SelfServePlanKey, details: BillingCustomerDetails) => void;
};
type BillingCancellation = { pending: boolean; error: unknown; confirm: () => void };

type BillingState = {
  country: string;
  billingDetails: BillingCustomerDetails;
  cancelOpen: boolean;
  setCountry: (country: string) => void;
  setBillingDetails: (details: BillingCustomerDetails) => void;
  setCancelOpen: (open: boolean) => void;
};

function useBillingState(): BillingState {
  const [country, setCountry] = useState('');
  const [billingDetails, setBillingDetails] = useState(emptyBillingCustomerDetails);
  const [cancelOpen, setCancelOpen] = useState(false);
  return { country, billingDetails, cancelOpen, setCountry, setBillingDetails, setCancelOpen };
}

/**
 * Billing reads are workspace-scoped, so they wait for the workspace the same
 * way they wait for the panel to be enabled at all.
 */
function billingReadsEnabled(enabled: boolean, workspaceId: string | null): boolean {
  return enabled && workspaceId !== null;
}

/** Account plan orchestration. Usage rendering lives in `UsageMeters`. */
export function BillingSettings({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  const queryClient = useQueryClient();
  const { isLoading: entitlementLoading } = useEntitlement();
  const workspaceId = useActiveWorkspaceId();
  const reads = billingReadsEnabled(enabled, workspaceId);
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.entitlement(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => billingApi.entitlement({ signal, workspaceId }),
    enabled: reads,
    retry: false,
  });
  const entitlement = entitlementQuery.data ?? null;
  const state = useBillingState();
  const catalogQuery = useQuery({
    queryKey: queryKeys.billing.catalog(state.country || undefined),
    queryFn: ({ signal }) => billingApi.catalog(state.country || undefined, { signal }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const invoiceQuery = useQuery({
    queryKey: [...queryKeys.billing.all, 'invoices'],
    queryFn: ({ signal }) => billingApi.invoices({ signal }),
    enabled,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
  const checkoutMutation = useSubscriptionCheckout();
  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelSubscription(),
    onSuccess: async () => {
      state.setCancelOpen(false);
      await refresh();
    },
  });

  if (!enabled || entitlementLoading || entitlementQuery.isLoading) return <BillingSkeleton />;

  return (
    <>
      <CheckoutStatus checkout={checkoutMutation} />
      <BillingContent
        enabled={enabled}
        entitlement={entitlement}
        catalog={catalogQuery.data ?? null}
        catalogLoading={catalogQuery.isLoading}
        catalogError={catalogQuery.isError}
        state={state}
        checkout={{
          pending: checkoutMutation.isPending,
          error: checkoutMutation.isError ? checkoutMutation.error : null,
          quote: checkoutMutation.data?.quote ?? null,
          start: (key, details) =>
            void checkoutMutation
              .start({
                input: {
                  catalog_key: key,
                  credential_mode: 'byok',
                  country_code: state.country,
                  ...details,
                },
              })
              .catch(() => undefined),
        }}
        cancellation={{
          pending: cancelMutation.isPending,
          error: cancelMutation.isError ? cancelMutation.error : null,
          confirm: () => cancelMutation.mutate(),
        }}
        invoices={invoiceQuery.data ?? []}
        invoicesLoading={invoiceQuery.isLoading}
        invoicesError={invoiceQuery.isError}
      />
    </>
  );
}

function BillingSkeleton() {
  return (
    <div className={panelClasses({}, 'grid gap-3')}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function BillingContent({
  enabled,
  entitlement,
  catalog,
  catalogLoading,
  catalogError,
  state,
  checkout,
  cancellation,
  invoices,
  invoicesLoading,
  invoicesError,
}: Readonly<{
  enabled: boolean;
  entitlement: BillingEntitlement | null;
  catalog: Awaited<ReturnType<typeof billingApi.catalog>> | null;
  catalogLoading: boolean;
  catalogError: boolean;
  state: BillingState;
  checkout: BillingCheckout;
  cancellation: BillingCancellation;
  invoices: Awaited<ReturnType<typeof billingApi.invoices>>;
  invoicesLoading: boolean;
  invoicesError: boolean;
}>) {
  const subscription = entitlement?.subscription ?? null;
  const currentPlan =
    subscription && catalog ? (catalogPlanByKey(catalog, subscription.catalog_key) ?? null) : null;

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <CurrentPlan
        entitlement={entitlement}
        currentPlan={currentPlan}
        cancelPending={cancellation.pending}
        cancelError={cancellation.error}
        onCancel={() => state.setCancelOpen(true)}
      />
      <div className="grid gap-[var(--workspace-gap)] lg:grid-cols-12 lg:items-start">
        <PlanCatalog
          catalog={catalog}
          loading={catalogLoading}
          error={catalogError}
          country={state.country}
          setCountry={state.setCountry}
          billingDetails={state.billingDetails}
          setBillingDetails={state.setBillingDetails}
          pending={checkout.pending}
          checkoutError={checkout.error}
          onCheckout={checkout.start}
        />
        <div className="lg:col-span-5">
          <UsageMeters enabled={enabled} />
        </div>
      </div>
      <InvoiceHistory invoices={invoices} loading={invoicesLoading} error={invoicesError} />
      {checkout.quote && catalog ? (
        <BillingQuoteSummary
          variant="settings"
          quote={checkout.quote}
          currencyMinorUnits={catalog.currency_minor_units}
        />
      ) : null}
      <CardTrialPanel />
      <CancelDialog cancellation={cancellation} state={state} />
    </div>
  );
}

function accessLabel(entitlement: BillingEntitlement | null): string {
  if (!entitlement) return 'Unresolved';
  const active = entitlement.grants.filter((grant) => grant.revoked_at === null);
  if (entitlement.trial_grant) return 'Early access';
  if (active.some((grant) => grant.source_kind === 'override')) return 'Operator override';
  if (active.some((grant) => grant.source_kind === 'plan')) return 'Paid plan';
  return 'Free access';
}

function CurrentPlan({
  entitlement,
  currentPlan,
  cancelPending,
  cancelError,
  onCancel,
}: Readonly<{
  entitlement: BillingEntitlement | null;
  currentPlan: CatalogPlan | null;
  cancelPending: boolean;
  cancelError: unknown;
  onCancel: () => void;
}>) {
  const subscription = entitlement?.subscription ?? null;
  const periodEnd = subscription?.current_period_end;
  return (
    <div className={panelClasses({}, 'grid gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <p className={eyebrowClasses}>Current plan</p>
          <div className="flex items-center gap-2.5">
            <p className={textRole('objectTitle')}>
              {currentPlan?.name ?? subscription?.catalog_key ?? 'No active plan'}
            </p>
            <Badge variant="status" value={entitlement ? 'success' : 'info'}>
              {accessLabel(entitlement)}
            </Badge>
          </div>
          <SubscriptionDetail subscription={subscription} periodEnd={periodEnd} />
        </div>
        {subscription && !subscription.cancel_at_period_end ? (
          <Button variant="secondary" size="sm" disabled={cancelPending} onClick={onCancel}>
            {cancelPending ? 'Scheduling cancellation…' : 'Cancel at period end'}
          </Button>
        ) : null}
      </div>
      {entitlement?.grants.some(
        (grant) => grant.source_kind === 'override' && grant.revoked_at === null,
      ) ? (
        <Alert tone="info">
          Operator override applied. It is read-only here and expires according to the grant shown
          by the server; it does not imply a paid subscription or funded AI credits.
        </Alert>
      ) : null}
      {entitlement?.trial_grant ? (
        <Alert tone="info">
          Temporary access ends{' '}
          {new Date(entitlement.trial_grant.deadline).toLocaleDateString('en-US', {
            dateStyle: 'medium',
            timeZone: 'UTC',
          })}
          . No card is on file, nothing renews, and access returns to free at expiry.
        </Alert>
      ) : null}
      {entitlement === null ? (
        <div className="">
          <Alert tone="warning">
            Your entitlement could not be resolved. No paid capability is active until it does.
          </Alert>
        </div>
      ) : null}
      {cancelError ? (
        <div className="">
          <Alert tone="danger">{message(cancelError)}</Alert>
        </div>
      ) : null}
    </div>
  );
}

function PlanCatalog({
  catalog,
  loading,
  error,
  country,
  setCountry,
  billingDetails,
  setBillingDetails,
  pending,
  checkoutError,
  onCheckout,
}: Readonly<{
  catalog: Awaited<ReturnType<typeof billingApi.catalog>> | null;
  loading: boolean;
  error: boolean;
  country: string;
  setCountry: (country: string) => void;
  billingDetails: BillingCustomerDetails;
  setBillingDetails: (details: BillingCustomerDetails) => void;
  pending: boolean;
  checkoutError: unknown;
  onCheckout: (key: SelfServePlanKey, details: BillingCustomerDetails) => void;
}>) {
  return (
    <div className={panelClasses({}, 'grid gap-4 lg:col-span-7')}>
      <div className="grid gap-0.5">
        <h2 className={textRole('bodyStrong', 'tracking-tight')}>Change plan</h2>
        <p className="text-muted text-xs">
          Prices are resolved by the server for your billing country. Audits run on your own
          provider keys, billed by those providers directly.
        </p>
      </div>
      {error ? (
        <Alert tone="danger">
          Could not load the plan catalog. Check your connection and retry.
        </Alert>
      ) : loading || !catalog ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-3">
          <BillingCountryInput country={country} setCountry={setCountry} />
          <BillingDetailsForm
            country={country}
            details={billingDetails}
            setDetails={setBillingDetails}
            idPrefix="settings"
          />
          <div className="grid gap-2.5">
            {catalog.plans.map((plan) => (
              <PlanRow
                key={plan.key}
                plan={plan}
                currencyMinorUnits={catalog.currency_minor_units}
                country={country}
                billingDetails={billingDetails}
                pending={pending}
                onCheckout={onCheckout}
              />
            ))}
          </div>
          {checkoutError ? <Alert tone="danger">{message(checkoutError)}</Alert> : null}
        </div>
      )}
    </div>
  );
}

function CancelDialog({
  cancellation,
  state,
}: Readonly<{ cancellation: BillingCancellation; state: BillingState }>) {
  return (
    <Dialog
      open={state.cancelOpen}
      onOpenChange={(open) => {
        if (!cancellation.pending) state.setCancelOpen(open);
      }}
      title="Cancel subscription"
      description="Cancellation takes effect at the end of the current billing period."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={cancellation.pending}
            onClick={() => state.setCancelOpen(false)}
          >
            Keep plan
          </Button>
          <Button
            variant="destructive"
            disabled={cancellation.pending}
            onClick={cancellation.confirm}
          >
            {cancellation.pending ? 'Scheduling cancellation…' : 'Cancel at period end'}
          </Button>
        </>
      }
    >
      <p className="text-secondary text-sm">
        Your current period runs to its end and no next bundle is issued. Completed audits and
        evidence are never deleted when a plan ends.
      </p>
      {cancellation.error ? <Alert tone="danger">{message(cancellation.error)}</Alert> : null}
    </Dialog>
  );
}
