import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { CheckoutConsent } from '@/components/billing/billing-policies';
import { BillingQuoteSummary } from '@/components/billing/quote-summary';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { SettingsPage } from '@/components/templates/settings-page';
import { Button } from '@/components/ui/button';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { StateBlock } from '@/components/ui/state-block';
import { Text } from '@/components/ui/typography';
import {
  billingDetailsError,
  billingQueries,
  emptyBillingCustomerDetails,
  refreshBilling,
  type BillingCatalog,
  type BillingCustomerDetails,
  type BillingEntitlement,
} from '@/lib/api/billing';
import { useWorkspaceCatalog } from '@/lib/billing/use-workspace-catalog';
import {
  catalogPlanByKey,
  checkoutSelection,
  SUBSCRIBED_STATUSES,
  formatMoney,
  headlinePrice,
  isPurchasable,
} from '@/lib/billing/catalog';
import {
  clearPendingIntent,
  readPendingIntent,
  type PendingPricingIntentV1,
} from '@/lib/billing/pending-pricing-intent';
import { billingErrorMessage } from '@/lib/billing/reason-copy';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { publicOrigins } from '@/lib/config/public-origins';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

const websitePricing = new URL(
  '/pricing',
  publicOrigins().website ?? 'https://citeladder.com',
).toString();
type Selection = PendingPricingIntentV1;
type Checkout = ReturnType<typeof useSubscriptionCheckout>;

type PurchaseInput = {
  selection: Selection;
  catalog: BillingCatalog;
  country: string;
  details: BillingCustomerDetails;
  checkout: Checkout;
};

function prepareBase(input: PurchaseInput) {
  const { selection, catalog, country, details, checkout } = input;
  const plan = catalog.plans.find((candidate) => candidate.key === selection.catalog_key);
  const current = plan && checkoutSelection(plan, selection.byok ? 'byok' : 'funded');
  if (!current?.ok || selection.quantity !== 1) {
    throw new Error('This plan is no longer available. Please select it again.');
  }
  const error = billingDetailsError(country, details);
  if (error) throw new Error(error);
  return checkout.prepare({
    purchase: {
      kind: 'base',
      input: {
        catalog_key: current.catalog_key,
        credential_mode: selection.byok ? 'byok' : 'funded',
        country_code: country,
        ...details,
      },
    },
  });
}

function prepareExtra(input: PurchaseInput) {
  const { selection, catalog, checkout } = input;
  const pool = selection.kind === 'addon' ? catalog.addons : catalog.topups;
  const entry = pool.find((candidate) => candidate.key === selection.catalog_key);
  if (
    !entry ||
    !isPurchasable(entry) ||
    selection.quantity < entry.quantity_min ||
    selection.quantity > entry.quantity_max
  ) {
    throw new Error('This purchase is no longer available. Please select it again.');
  }
  return checkout.prepare({
    purchase: {
      kind: selection.kind === 'addon' ? 'addon' : 'topup',
      catalog_key: entry.key,
      quantity: selection.quantity,
    },
    key: selection.idempotency_key,
  });
}

function PurchaseButton({
  canBuy,
  workspaceId,
  pending,
  quoted,
  priceUnavailable,
  onPurchase,
}: Readonly<{
  canBuy: boolean;
  workspaceId: string | null;
  pending: boolean;
  quoted: boolean;
  priceUnavailable: boolean;
  onPurchase: () => void;
}>) {
  return (
    <Button
      variant={quoted ? 'secondary' : 'primary'}
      disabled={!canBuy || !workspaceId || priceUnavailable}
      aria-disabled={quoted || undefined}
      pending={pending}
      pendingLabel="Preparing…"
      onClick={quoted ? undefined : onPurchase}
    >
      Review current quote
    </Button>
  );
}

function CheckoutFields({
  selection,
  country,
  setCountry,
  details,
  setDetails,
}: Readonly<{
  selection: Selection;
  country: string;
  setCountry: (value: string) => void;
  details: BillingCustomerDetails;
  setDetails: (value: BillingCustomerDetails) => void;
}>) {
  if (selection.kind !== 'checkout') return null;
  return (
    <>
      <BillingCountryInput country={country} setCountry={setCountry} />
      <BillingDetailsForm country={country} details={details} setDetails={setDetails} />
    </>
  );
}

function PriceInfo({
  price,
  catalog,
}: Readonly<{
  price: ReturnType<typeof headlinePrice> | null;
  catalog: BillingCatalog;
}>) {
  if (price?.kind === 'price')
    return (
      <SettingRow
        label="Price"
        value={
          <Text variant="body" tone="ink-2" numeric>
            {formatMoney(price.money, catalog.currency_minor_units)}
          </Text>
        }
      />
    );
  if (price?.kind === 'unavailable')
    return <SettingRow label="Price" value="Checkout is unavailable for this credential mode." />;
  return null;
}

function selectedOffer(catalog: BillingCatalog, selection: Selection) {
  let extra: BillingCatalog['addons'][number] | BillingCatalog['topups'][number] | null = null;
  if (selection.kind === 'addon') {
    extra = catalog.addons.find((entry) => entry.key === selection.catalog_key) ?? null;
  } else if (selection.kind === 'topup') {
    extra = catalog.topups.find((entry) => entry.key === selection.catalog_key) ?? null;
  }
  return {
    plan:
      selection.kind === 'checkout'
        ? catalog.plans.find((entry) => entry.key === selection.catalog_key)
        : null,
    extra,
  };
}

function hasSelectedOffer(
  catalog: BillingCatalog | undefined,
  selection: Selection | null,
): boolean | undefined {
  if (!catalog || !selection) return undefined;
  const { plan, extra } = selectedOffer(catalog, selection);
  return Boolean(plan || extra);
}

function SelectedPurchase({
  selection,
  catalog,
  country,
  setCountry,
  details,
  setDetails,
  canBuy,
  workspaceId,
  pending,
  quoted,
  onPurchase,
}: Readonly<{
  selection: Selection | null;
  catalog: BillingCatalog | undefined;
  country: string;
  setCountry: (value: string) => void;
  details: BillingCustomerDetails;
  setDetails: (value: BillingCustomerDetails) => void;
  canBuy: boolean;
  workspaceId: string | null;
  pending: boolean;
  quoted: boolean;
  onPurchase: () => void;
}>) {
  if (!selection || !catalog) return null;
  const { plan, extra } = selectedOffer(catalog, selection);
  if (!plan && !extra) return null;
  const usage = selection.byok ? 'byok' : 'funded';
  const price = plan ? headlinePrice(plan, usage) : null;
  return (
    <SettingsGroup title={plan?.name ?? extra?.name}>
      <SettingRows
        foot={
          <PurchaseButton
            canBuy={canBuy}
            workspaceId={workspaceId}
            pending={pending}
            quoted={quoted}
            priceUnavailable={Boolean(price && price.kind !== 'price')}
            onPurchase={onPurchase}
          />
        }
      >
        <SettingRow
          label="Quantity"
          value={
            <>
              <Text variant="body" tone="ink-2" numeric>
                {selection.quantity}
              </Text>{' '}
              × {selection.byok ? 'Your own keys' : 'Managed'}
            </>
          }
        />
        <PriceInfo price={price} catalog={catalog} />
        {extra?.unit_price ? (
          <SettingRow
            label="Unit price"
            value={
              <>
                <Text variant="body" tone="ink-2" numeric>
                  {formatMoney(extra.unit_price, catalog.currency_minor_units)}
                </Text>{' '}
                per unit before tax
              </>
            }
          />
        ) : null}
        <CheckoutFields
          selection={selection}
          country={country}
          setCountry={setCountry}
          details={details}
          setDetails={setDetails}
        />
      </SettingRows>
    </SettingsGroup>
  );
}

function QuoteConfirmation({
  checkout,
  catalog,
  pending,
  onConfirm,
}: Readonly<{
  checkout: Checkout;
  catalog: BillingCatalog | undefined;
  pending: boolean;
  onConfirm: () => void;
}>) {
  if (!checkout.prepared?.quote || !catalog) return null;
  return (
    <SettingsGroup title="Current quote">
      <SettingRows
        foot={
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            {pending ? 'Opening checkout…' : 'Confirm and continue to payment'}
          </Button>
        }
      >
        <BillingQuoteSummary
          quote={checkout.prepared.quote}
          currencyMinorUnits={catalog.currency_minor_units}
        />
        <CheckoutConsent recurring={checkout.prepared.kind === 'base'} />
      </SettingRows>
    </SettingsGroup>
  );
}

function BillingErrorNotice({
  error,
  fallback,
  shown,
}: Readonly<{ error: unknown; fallback: string; shown: string | null }>) {
  if (!error) return null;
  const message = billingErrorMessage(error, fallback);
  if (message === shown) return null;
  return <Notice tone="negative">{message}</Notice>;
}

type CurrentPlanRead =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'plan'; name: string }>;

function currentPlanRead(
  entitlement: BillingEntitlement | undefined,
  catalog: BillingCatalog | undefined,
): CurrentPlanRead {
  if (entitlement?.status !== 'resolved') return { kind: 'unknown' };
  const subscription = entitlement.subscription;
  if (!subscription) return { kind: 'none' };
  if (!SUBSCRIBED_STATUSES.has(subscription.status)) return { kind: 'unknown' };
  const plan = catalog ? catalogPlanByKey(catalog, subscription.catalog_key) : undefined;
  return { kind: 'plan', name: plan?.name ?? subscription.catalog_key };
}

function currentPlanLine(plan: CurrentPlanRead): string | undefined {
  switch (plan.kind) {
    case 'unknown':
      return undefined;
    case 'none':
      return 'No plan yet';
    case 'plan':
      return `Current plan: ${plan.name}`;
    default: {
      const unreachable: never = plan;
      return unreachable;
    }
  }
}

function PricingState({
  workspaceName,
  canBuy,
  workspaceError,
  retryWorkspace,
  catalogRead,
  selection,
  offered,
  currentPlan,
}: Readonly<{
  workspaceName: string | null;
  canBuy: boolean;
  workspaceError: boolean;
  retryWorkspace: () => void;
  catalogRead: RetryableRead & Readonly<{ isError: boolean }>;
  selection: Selection | null;
  offered: boolean | undefined;
  currentPlan: CurrentPlanRead;
}>) {
  if (workspaceError) {
    return (
      <StateBlock
        kind="error"
        title="Couldn't load the workspace"
        error={null}
        fallback="The billing workspace could not be loaded."
        onRetry={retryWorkspace}
      />
    );
  }
  if (!workspaceName)
    return (
      <StateBlock kind="loading" label="Loading workspace…" shape={{ kind: 'facts', rows: 2 }} />
    );
  return (
    <>
      {canBuy ? null : <Notice tone="info">Owner or Admin only.</Notice>}
      {catalogRead.isError ? (
        <Notice
          kind="read"
          title="Couldn't load plans"
          {...readErrorProps(catalogRead)}
          fallback="The plan catalog could not be loaded."
        />
      ) : null}
      {selection && offered === false ? (
        <Notice tone="warning">This selection is no longer offered.</Notice>
      ) : null}
      {selection ? null : (
        <StateBlock
          kind="empty"
          headingLevel={2}
          heading={currentPlan.kind === 'plan' ? 'Change plan' : 'Choose a plan'}
          description={currentPlanLine(currentPlan)}
          action={
            <Button asChild>
              <a href={websitePricing}>View public pricing</a>
            </Button>
          }
        />
      )}
    </>
  );
}

export default function PricingRoute() {
  const [selection, setSelection] = useState(readPendingIntent);
  const [country, setCountry] = useState('');
  const [details, setDetails] = useState(emptyBillingCustomerDetails);
  const { activeWorkspaceId, activeWorkspace, isError, retry } = useProjectContext();
  const canBuy = useWorkspaceCapability('manage_billing');
  const queryClient = useQueryClient();
  const catalogQuery = useWorkspaceCatalog(activeWorkspaceId, country);
  const entitlementQuery = useQuery({
    ...billingQueries.entitlement(activeWorkspaceId),
    retry: false,
  });
  const checkout = useSubscriptionCheckout();
  const resetPrepared = checkout.resetPrepared;
  useEffect(() => {
    resetPrepared();
  }, [activeWorkspaceId, country, details, selection, resetPrepared]);
  const confirm = useMutation({
    mutationFn: () => checkout.confirmPrepared(),
    onSuccess: (result) => {
      if (result?.status && result.status !== 'pending') {
        resetPrepared();
        clearPendingIntent();
        setSelection(null);
      }
    },
  });
  const purchase = useMutation({
    mutationFn: async () => {
      if (!selection || !activeWorkspaceId || !canBuy) {
        throw new Error('Select a billing workspace and refresh the catalog.');
      }
      const refreshed = await catalogQuery.refetch();
      if (!refreshed.data || refreshed.isError)
        throw new Error('The current catalog is unavailable.');
      const input = {
        selection,
        catalog: refreshed.data,
        country,
        details,
        checkout,
      };
      return selection.kind === 'checkout' ? prepareBase(input) : prepareExtra(input);
    },
    onSuccess: async (result) => {
      if (result.status !== 'pending') {
        clearPendingIntent();
        setSelection(null);
      }
      await refreshBilling(queryClient);
    },
  });
  const catalog = catalogQuery.data;
  const offered = hasSelectedOffer(catalog, selection);

  return (
    <SettingsPage
      actions={
        selection || isError ? (
          <MastheadPrimary>
            <Button asChild variant={!selection || offered === false ? 'primary' : 'secondary'}>
              <a href={websitePricing}>View public pricing</a>
            </Button>
          </MastheadPrimary>
        ) : undefined
      }
    >
      <PricingState
        workspaceName={activeWorkspace?.name ?? null}
        canBuy={canBuy}
        workspaceError={isError}
        retryWorkspace={retry}
        catalogRead={catalogQuery}
        selection={selection}
        offered={offered}
        currentPlan={currentPlanRead(
          entitlementQuery.isError ? undefined : entitlementQuery.data,
          catalog,
        )}
      />
      <SelectedPurchase
        selection={selection}
        catalog={catalog}
        country={country}
        setCountry={setCountry}
        details={details}
        setDetails={setDetails}
        canBuy={canBuy}
        workspaceId={activeWorkspaceId}
        pending={purchase.isPending}
        quoted={Boolean(checkout.prepared?.quote)}
        onPurchase={() => void purchase.mutate()}
      />
      <QuoteConfirmation
        checkout={checkout}
        catalog={catalog}
        pending={confirm.isPending}
        onConfirm={() => void confirm.mutate()}
      />
      <CheckoutStatus checkout={checkout} />
      <BillingErrorNotice
        error={purchase.error}
        fallback="Quote unavailable."
        shown={checkout.notice}
      />
      <BillingErrorNotice
        error={confirm.error}
        fallback="Checkout unavailable."
        shown={checkout.notice}
      />
    </SettingsPage>
  );
}
