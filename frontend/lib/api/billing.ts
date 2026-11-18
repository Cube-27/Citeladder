/**
 * Billing domain endpoints (v8 commercial surface).
 *
 * The server owns every amount. A request from here carries a catalog key, a
 * quantity, a credential mode, ISO country and bounded billing evidence —
 * never a price, a currency, a margin, or an external provider/plan id
 * (invariant 6). The activation
 * response's `quote` is what proves the terms the user was shown.
 *
 * Every commercial POST is idempotent: the caller supplies an
 * `Idempotency-Key` and a retry of the same key replays the stored response
 * rather than charging twice.
 */
import {
  mutationOptions,
  partialMatchKey,
  queryOptions,
  skipToken,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';

import type { billingCustomerDetailsSchema } from '@/lib/billing/pending-pricing-intent';
import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  activationSchema,
  billingCatalogSchema,
  billingEntitlementSchema,
  billingInvoiceSchema,
  billingInvoicesSchema,
  billingUsageSchema,
  planChangeSchema,
  resolvedQuoteSchema,
  subscriptionChangeSchema,
  subscriptionCheckoutSchema,
  workspaceEntitlementSchema,
  type SelfServePlanKey,
} from '@citeladder/contracts/billing';
import type {
  CheckoutVerifyRequest,
  PackPurchaseRequest,
  PlanChangeRequest,
  SubscriptionCheckoutRequest,
} from '@citeladder/contracts/billing-requests';
import { strictValidate } from '@citeladder/contracts/validation';

export type BillingCatalog = z.infer<typeof billingCatalogSchema>;
export type CatalogPlan = BillingCatalog['plans'][number];
export type CatalogAddon = BillingCatalog['addons'][number];
export type CatalogTopup = BillingCatalog['topups'][number];
export type BillingEntitlement = z.infer<typeof billingEntitlementSchema>;
export type BillingUsage = z.infer<typeof billingUsageSchema>;
export type BillingQuote = z.infer<typeof resolvedQuoteSchema>;
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;
export type WorkspaceEntitlement = z.infer<typeof workspaceEntitlementSchema>;
export type UsageItem = BillingUsage['items'][number];
export type { SelfServePlanKey };
export type { CredentialMode } from '@citeladder/contracts/billing';

export type BillingCustomerDetails = z.infer<typeof billingCustomerDetailsSchema>;

export function emptyBillingCustomerDetails(): BillingCustomerDetails {
  return {
    billing_name: '',
    billing_address_line1: '',
    billing_city: '',
    billing_state_code: '',
    billing_postal_code: '',
    customer_gstin: '',
    export_eligibility_attested: false,
  };
}

/** Validation only gates the form; tax and treatment remain server decisions. */
export function billingDetailsError(
  countryCode: string,
  details: BillingCustomerDetails,
): string | null {
  const country = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return 'Enter your two-letter billing country.';
  if (!details.billing_name.trim()) return 'Enter the billing name.';
  if (!details.billing_address_line1.trim()) return 'Enter the billing address.';
  if (!details.billing_city.trim()) return 'Enter the billing city.';
  if (!details.billing_postal_code.trim()) return 'Enter the billing postal code.';
  if (country === 'IN') {
    return details.billing_state_code.trim() ? null : 'Enter your Indian billing state code.';
  }
  if (!details.export_eligibility_attested) {
    return 'Confirm that this purchase qualifies as an export of service.';
  }
  return null;
}

/**
 * A fresh idempotency key for one commercial intent.
 *
 * Mirrors `createRequestId` in `client.ts`. The key is a per-account
 * uniqueness token, not a secret or a capability — it authorizes nothing on
 * its own, and the backend scopes every lookup to the authenticated account.
 */
export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export const billingApi = {
  // These endpoints are WORKSPACE-scoped on the server, so each one carries
  // its workspace explicitly. Without it the transport falls back to the
  // mutable active selection, and a call begun in one workspace could be
  // answered for another after a switch.
  checkout: async (activationId: string, options?: ApiRequestOptions) =>
    strictValidate(
      subscriptionCheckoutSchema,
      await apiClient.get<unknown>(`/billing/activations/${activationId}/checkout`, options),
      'billing.checkout',
    ),
  activation: async (activationId: string, options?: ApiRequestOptions) =>
    strictValidate(
      activationSchema,
      await apiClient.get<unknown>(`/billing/activations/${activationId}`, options),
      'billing.activation',
    ),
  verifyCheckout: async (
    activationId: string,
    callback: CheckoutVerifyRequest,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      activationSchema,
      await apiClient.post<unknown>(
        `/billing/activations/${activationId}/verify`,
        callback,
        options,
      ),
      'billing.verifyCheckout',
    ),
  workspaceCatalog: async (countryCode?: string, options?: ApiRequestOptions) => {
    const query = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
    const response = await apiClient.get<unknown>(`/billing/workspace-catalog${query}`, options);
    return strictValidate(billingCatalogSchema, response, 'billing.workspaceCatalog');
  },

  workspaceEntitlement: async (workspaceId: string, options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>(
      `/workspaces/${workspaceId}/entitlements`,
      options,
    );
    return strictValidate(workspaceEntitlementSchema, response, 'billing.workspaceEntitlement');
  },

  entitlement: async (options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>('/billing/entitlement', options);
    return strictValidate(billingEntitlementSchema, response, 'billing.entitlement');
  },

  usage: async (options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>('/billing/usage', options);
    return strictValidate(billingUsageSchema, response, 'billing.usage');
  },

  invoices: async (options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>('/billing/invoices', options);
    return strictValidate(billingInvoicesSchema, response, 'billing.invoices');
  },

  invoicePdf: (invoiceId: string, options?: ApiRequestOptions) =>
    apiClient.getBlob(`/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`, options),

  /** Start a base-plan checkout. */
  createSubscription: async (
    input: SubscriptionCheckoutRequest,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const countryCode = input.country_code.trim().toUpperCase();
    const indianBilling = countryCode === 'IN';
    const response = await apiClient.post<unknown>(
      '/billing/subscriptions',
      {
        ...input,
        country_code: countryCode,
        billing_state_code: indianBilling ? (input.billing_state_code?.trim() ?? null) : null,
        customer_gstin: indianBilling ? (input.customer_gstin?.trim() ?? null) : null,
        export_eligibility_attested: indianBilling ? false : input.export_eligibility_attested,
      } satisfies SubscriptionCheckoutRequest,
      { ...options, idempotencyKey },
    );
    return strictValidate(activationSchema, response, 'billing.createSubscription');
  },

  activateAddon: async (
    catalogKey: string,
    quantity: number,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.post<unknown>(
      '/billing/addons',
      { catalog_key: catalogKey, quantity } satisfies PackPurchaseRequest,
      { ...options, idempotencyKey },
    );
    return strictValidate(activationSchema, response, 'billing.activateAddon');
  },

  purchaseTopup: async (
    catalogKey: string,
    quantity: number,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.post<unknown>(
      '/billing/topups',
      { catalog_key: catalogKey, quantity } satisfies PackPurchaseRequest,
      { ...options, idempotencyKey },
    );
    return strictValidate(activationSchema, response, 'billing.purchaseTopup');
  },

  /**
   * Change the base plan. The server decides the direction and prices an
   * upgrade's prorated charge; the browser names only the target plan.
   */
  changePlan: async (
    catalogKey: SelfServePlanKey,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.post<unknown>(
      '/billing/subscription/change',
      { catalog_key: catalogKey } satisfies PlanChangeRequest,
      { ...options, idempotencyKey },
    );
    return strictValidate(planChangeSchema, response, 'billing.changePlan');
  },

  cancelSubscription: async (options?: ApiRequestOptions) => {
    const response = await apiClient.delete<unknown>('/billing/subscription', options);
    return strictValidate(subscriptionChangeSchema, response, 'billing.cancelSubscription');
  },
  resumeSubscription: async (options?: ApiRequestOptions) => {
    const response = await apiClient.post<unknown>('/billing/subscription/resume', {}, options);
    return strictValidate(subscriptionChangeSchema, response, 'billing.resumeSubscription');
  },
};

/**
 * The shell's billing reads, one definition each for the route loader that
 * warms them and the provider and screens that read them.
 */
export const billingQueries = {
  /**
   * What the workspace may do, its allowance hints and its Site Health
   * runtime. The empty-workspace gate blocks on this read, so it carries the
   * bounded bootstrap timeout: a stall reaches the retry notice in seconds.
   */
  workspaceEntitlement: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.billing.workspaceEntitlement(workspaceId),
      queryFn: ({ signal }) =>
        billingApi.workspaceEntitlement(workspaceId, {
          signal,
          workspaceId,
          timeoutMs: getBootstrapReadTimeoutMs(),
        }),
    }),
  /** Owner/Admin-private usage; not a gate input, so it keeps the default timeout. */
  usage: (workspaceId: string | null) =>
    queryOptions({
      queryKey: queryKeys.billing.usage(workspaceId),
      queryFn: workspaceId ? ({ signal }) => billingApi.usage({ signal, workspaceId }) : skipToken,
    }),
  /** The plan, grants and allowance the billing screen manages (Owner/Admin). */
  entitlement: (workspaceId: string | null) =>
    queryOptions({
      queryKey: queryKeys.billing.entitlement(workspaceId),
      queryFn: workspaceId
        ? ({ signal }) => billingApi.entitlement({ signal, workspaceId })
        : skipToken,
    }),
  invoices: (workspaceId: string | null) =>
    queryOptions({
      queryKey: queryKeys.billing.invoices(workspaceId),
      queryFn: workspaceId
        ? ({ signal }) => billingApi.invoices({ signal, workspaceId })
        : skipToken,
    }),
  /**
   * The plans this workspace may buy: checkout opens only where the server
   * says so (B2), the same signal that hides prices on the public pricing page.
   */
  workspaceCatalog: (workspaceId: string | null, countryCode: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.billing.workspaceCatalog(workspaceId, countryCode),
      queryFn: workspaceId
        ? ({ signal }) => billingApi.workspaceCatalog(countryCode, { signal, workspaceId })
        : skipToken,
      // An ended workspace buys its plan from this list, so the access gate keeps it.
      meta: { accessRecovery: true },
      // A country change keeps the shown plans while the new prices load; another
      // workspace's plans are never shown for this one.
      placeholderData: (previous, previousQuery) =>
        previousQuery &&
        partialMatchKey(previousQuery.queryKey, queryKeys.billing.workspaceCatalogs(workspaceId))
          ? previous
          : undefined,
    }),
};

/** Every billing read: a commercial change can move the plan, grants, usage and invoices. */
export const refreshBilling = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: queryKeys.billing.all });

/**
 * Re-ask every billing read now, including ones that already failed: a retry
 * of a gate that waits on the allowance must not wait for a stale mark.
 */
export const refetchBilling = (client: QueryClient) =>
  client.refetchQueries({ queryKey: queryKeys.billing.all });

/**
 * A verified purchase: billing moves, and a new plan can restore a workspace
 * whose trial or plan had ended, so its access read refreshes too.
 */
export async function refreshAfterPurchase(client: QueryClient, workspaceId: string | null) {
  await refreshBilling(client);
  if (workspaceId)
    await client.invalidateQueries({ queryKey: queryKeys.workspaces.access(workspaceId) });
}

/** Subscription writes on the billing screen; each success refreshes every billing read. */
export const billingMutations = {
  resumeSubscription: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: () => billingApi.resumeSubscription({ workspaceId }),
      onSuccess: (_change, _vars, _result, { client }) => refreshBilling(client),
    }),
  cancelSubscription: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: () => billingApi.cancelSubscription({ workspaceId }),
      onSuccess: (_change, _vars, _result, { client }) => refreshBilling(client),
    }),
  /**
   * A downgrade: the server schedules it with no charge, so it needs no
   * checkout. Each call is a new idempotent request.
   */
  downgrade: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (key: SelfServePlanKey) =>
        billingApi.changePlan(key, createIdempotencyKey(), { workspaceId }),
      onSuccess: (_change, _key, _result, { client }) => refreshBilling(client),
    }),
};
