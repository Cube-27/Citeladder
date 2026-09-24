import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { BillingCountryInput } from '@/components/billing/billing-account-details';
import { BillingDetailsForm } from '@/components/billing/billing-details-form';
import { BillingQuoteSummary } from '@/components/billing/quote-summary';
import { CheckoutStatus } from '@/components/billing/checkout-status';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import {
  billingApi,
  billingDetailsError,
  emptyBillingCustomerDetails,
  type BillingCatalog,
  type BillingCustomerDetails,
} from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import {
  checkoutSelection,
  formatMoney,
  headlinePrice,
  isPurchasable,
} from '@/lib/billing/catalog';
import {
  clearPendingIntent,
  readPendingIntent,
  type PendingPricingIntentV1,
} from '@/lib/billing/pending-pricing-intent';
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
  if (!current || !current.ok || selection.quantity !== 1) {
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
  // The same quote review and provider checkout as a plan, paying the
  // one-time order the server creates for this exact quantity.
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
  const label = pending ? 'Preparing…' : 'Review current quote';
  return (
    <Button
      disabled={!canBuy || !workspaceId || pending || quoted || priceUnavailable}
      onClick={onPurchase}
    >
      {label}
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
    <Stack gap="workspace">
      <BillingCountryInput country={country} setCountry={setCountry} />
      <BillingDetailsForm
        country={country}
        details={details}
        setDetails={setDetails}
        idPrefix="pricing"
      />
    </Stack>
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
    return <p>{formatMoney(price.money, catalog.currency_minor_units)}</p>;
  if (price?.kind === 'unavailable')
    return <p>Checkout is unavailable for this credential mode.</p>;
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
  const price = plan ? headlinePrice(plan, selection.byok ? 'byok' : 'funded') : null;
  return (
    <Stack as="section" gap="workspace" className={panelClasses()} aria-label="Selected purchase">
      <h2 className={textRole('sectionTitle')}>{plan?.name ?? extra?.name}</h2>
      <p>
        {selection.quantity} × {selection.byok ? 'Your own provider keys' : 'Funded usage'}
      </p>
      <PriceInfo price={price} catalog={catalog} />
      {extra?.unit_price ? (
        <p>{formatMoney(extra.unit_price, catalog.currency_minor_units)} per unit before tax</p>
      ) : null}
      <CheckoutFields
        selection={selection}
        country={country}
        setCountry={setCountry}
        details={details}
        setDetails={setDetails}
      />
      <p className={textRole('body')}>
        The server resolves the current amount and tax for your billing country. Review its quote
        before continuing to payment.
      </p>
      <PurchaseButton
        canBuy={canBuy}
        workspaceId={workspaceId}
        pending={pending}
        quoted={quoted}
        priceUnavailable={Boolean(price && price.kind !== 'price')}
        onPurchase={onPurchase}
      />
    </Stack>
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
    <Stack as="section" gap="workspace" aria-label="Current quote">
      <BillingQuoteSummary
        quote={checkout.prepared.quote}
        currencyMinorUnits={catalog.currency_minor_units}
      />
      <Button disabled={pending} onClick={onConfirm}>
        {pending ? 'Opening checkout…' : 'Confirm and continue to payment'}
      </Button>
    </Stack>
  );
}

function Notice({ error, fallback }: Readonly<{ error: unknown; fallback: string }>) {
  if (!error) return null;
  return <p role="alert">{error instanceof Error ? error.message : fallback}</p>;
}

function PricingState({
  workspaceName,
  canBuy,
  workspaceError,
  retryWorkspace,
  catalogError,
  retryCatalog,
  selection,
  offered,
}: Readonly<{
  workspaceName: string | null;
  canBuy: boolean;
  workspaceError: boolean;
  retryWorkspace: () => void;
  catalogError: boolean;
  retryCatalog: () => void;
  selection: Selection | null;
  offered: boolean | undefined;
}>) {
  return (
    <>
      {workspaceError ? <Button onClick={retryWorkspace}>Retry workspace</Button> : null}
      {workspaceName ? <p>Workspace: {workspaceName}</p> : <p>Loading workspace…</p>}
      {!canBuy && workspaceName ? (
        <p>Ask a workspace Owner or Admin to make this purchase.</p>
      ) : null}
      {catalogError ? <Button onClick={retryCatalog}>Retry catalog</Button> : null}
      {selection && offered === false ? (
        <p>
          This selection is no longer in the current catalog. Choose again on the public pricing
          page.
        </p>
      ) : null}
      {!selection ? <p>Choose a plan on the public pricing page to continue here.</p> : null}
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
  const catalogQuery = useQuery({
    queryKey: queryKeys.billing.catalog(country.length === 2 ? country : undefined),
    queryFn: ({ signal }) =>
      billingApi.catalog(country.length === 2 ? country : undefined, { signal, workspaceId: null }),
    staleTime: 0,
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    },
  });
  const catalog = catalogQuery.data;
  const offered = hasSelectedOffer(catalog, selection);

  return (
    <PageShell
      title="Review your selection"
      measure="workflow"
      actions={
        <a className="text-sm underline" href={websitePricing}>
          View public pricing
        </a>
      }
    >
      <Stack gap="section">
        <PricingState
          workspaceName={activeWorkspace?.name ?? null}
          canBuy={canBuy}
          workspaceError={isError}
          retryWorkspace={retry}
          catalogError={catalogQuery.isError}
          retryCatalog={() => void catalogQuery.refetch()}
          selection={selection}
          offered={offered}
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
        <Notice error={purchase.error} fallback="Purchase unavailable." />
        <Notice error={confirm.error} fallback="Checkout unavailable." />
      </Stack>
    </PageShell>
  );
}
