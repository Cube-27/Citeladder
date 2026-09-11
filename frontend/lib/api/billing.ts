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
import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  activationSchema,
  subscriptionCheckoutSchema,
  billingCatalogSchema,
  billingEntitlementSchema,
  billingUsageSchema,
  noCardClaimSchema,
  noCardOfferSchema,
  strictValidate,
  workspaceEntitlementSchema,
  subscriptionChangeSchema,
  resolvedQuoteSchema,
  billingInvoiceSchema,
  billingInvoicesSchema,
} from './schemas';

export type BillingCatalog = z.infer<typeof billingCatalogSchema>;
export type CatalogPlan = BillingCatalog['plans'][number];
export type CatalogAddon = BillingCatalog['addons'][number];
export type CatalogTopup = BillingCatalog['topups'][number];
export type CatalogProvider = BillingCatalog['providers'][number];
export type BillingEntitlement = z.infer<typeof billingEntitlementSchema>;
export type BillingUsage = z.infer<typeof billingUsageSchema>;
export type BillingQuote = z.infer<typeof resolvedQuoteSchema>;
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;
export type WorkspaceEntitlement = z.infer<typeof workspaceEntitlementSchema>;
export type NoCardOffer = z.infer<typeof noCardOfferSchema>;
export type UsageItem = BillingUsage['items'][number];
export type CredentialMode = 'byok' | 'funded';
export type SelfServePlanKey = 'tier_1' | 'tier_2' | 'tier_3';

/** Customer evidence required to let the server determine GST/export status. */
export type BillingCustomerDetails = {
  billing_name: string;
  billing_address_line1: string;
  billing_city: string;
  billing_state_code: string;
  billing_postal_code: string;
  customer_gstin: string;
  export_eligibility_attested: boolean;
};

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
 * `crypto.randomUUID` is the real path in every supported browser; the suffix
 * fallback only keeps a non-crypto test environment from throwing.
 */
export function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `intent-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export type SubscriptionCheckoutInput = {
  catalog_key: SelfServePlanKey;
  credential_mode: CredentialMode;
  country_code: string;
} & BillingCustomerDetails;

/**
 * A provider's browser callback, in the NEUTRAL wrapper the API accepts.
 *
 * The field names inside are the vendor's own; the shared controller never
 * reads them, and the originating adapter allowlists exactly the ones it
 * accepts before checking any signature.
 */
export type CheckoutCallback = { fields: Record<string, string> };

export const billingApi = {
  // These endpoints are WORKSPACE-scoped on the server, so each one carries
  // its workspace explicitly. Without it the transport falls back to the
  // mutable active selection, and a call begun in one workspace could be
  // answered for another after a switch.
  checkout: async (activationId: string, options?: ApiRequestOptions) =>
    strictValidate(
      subscriptionCheckoutSchema,
      await apiClient.get<unknown>(`/billing/subscriptions/${activationId}/checkout`, options),
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
    callback: CheckoutCallback,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      activationSchema,
      await apiClient.post<unknown>(
        `/billing/subscriptions/${activationId}/verify`,
        callback,
        options,
      ),
      'billing.verifyCheckout',
    ),
  catalog: async (countryCode?: string, options?: ApiRequestOptions) => {
    const query = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
    const response = await apiClient.get<unknown>(`/billing/catalog${query}`, options);
    return strictValidate(billingCatalogSchema, response, 'billing.catalog');
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

  noCardOffer: async (options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>('/billing/early-access', options);
    return strictValidate(noCardOfferSchema, response, 'billing.noCardOffer');
  },

  claimNoCardOffer: async (
    input: {
      campaign_id: string;
      operator_code?: string;
      terms_consent: boolean;
      data_sharing_consent: boolean;
    },
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.post<unknown>('/billing/early-access/claim', input, {
      ...options,
      idempotencyKey,
    });
    return strictValidate(noCardClaimSchema, response, 'billing.claimNoCardOffer');
  },

  /**
   * Start a base-plan checkout. `trial_requested` is always false in this
   * release — the backend answers `trial_unavailable` for anything else, so
   * there is no trial UI to expose.
   */
  createSubscription: async (
    input: SubscriptionCheckoutInput,
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
        billing_state_code: indianBilling ? input.billing_state_code.trim() : null,
        customer_gstin: indianBilling ? input.customer_gstin.trim() : null,
        export_eligibility_attested: indianBilling ? false : input.export_eligibility_attested,
        trial_requested: false,
      },
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
      { catalog_key: catalogKey, quantity },
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
      { catalog_key: catalogKey, quantity },
      { ...options, idempotencyKey },
    );
    return strictValidate(activationSchema, response, 'billing.purchaseTopup');
  },

  /**
   * Deactivation has its OWN response vocabulary. Parsing it through the
   * activation state machine would invent a pending/failed lifecycle the
   * backend never reports.
   */
  deactivateAddon: async (catalogKey: string, options?: ApiRequestOptions) => {
    const response = await apiClient.delete<unknown>(
      `/billing/addons/${encodeURIComponent(catalogKey)}`,
      options,
    );
    return strictValidate(subscriptionChangeSchema, response, 'billing.deactivateAddon');
  },

  cancelSubscription: async (options?: ApiRequestOptions) => {
    const response = await apiClient.delete<unknown>('/billing/subscription', options);
    return strictValidate(subscriptionChangeSchema, response, 'billing.cancelSubscription');
  },
};
