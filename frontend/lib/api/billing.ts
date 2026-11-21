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

export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export const billingApi = {
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

export const billingQueries = {
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
  usage: (workspaceId: string | null) =>
    queryOptions({
      queryKey: queryKeys.billing.usage(workspaceId),
      queryFn: workspaceId ? ({ signal }) => billingApi.usage({ signal, workspaceId }) : skipToken,
    }),
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
  workspaceCatalog: (workspaceId: string | null, countryCode: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.billing.workspaceCatalog(workspaceId, countryCode),
      queryFn: workspaceId
        ? ({ signal }) => billingApi.workspaceCatalog(countryCode, { signal, workspaceId })
        : skipToken,
      meta: { accessRecovery: true },
      placeholderData: (previous, previousQuery) =>
        previousQuery &&
        partialMatchKey(previousQuery.queryKey, queryKeys.billing.workspaceCatalogs(workspaceId))
          ? previous
          : undefined,
    }),
};

export const refreshBilling = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: queryKeys.billing.all });

export const refetchBilling = (client: QueryClient) =>
  client.refetchQueries({ queryKey: queryKeys.billing.all });

export async function refreshAfterPurchase(client: QueryClient, workspaceId: string | null) {
  await refreshBilling(client);
  if (workspaceId)
    await client.invalidateQueries({ queryKey: queryKeys.workspaces.access(workspaceId) });
}

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
  downgrade: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (key: SelfServePlanKey) =>
        billingApi.changePlan(key, createIdempotencyKey(), { workspaceId }),
      onSuccess: (_change, _key, _result, { client }) => refreshBilling(client),
    }),
};
