import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  billingCancelSchema,
  billingCatalogSchema,
  billingCheckoutSchema,
  billingSummarySchema,
  strictValidate,
  workspaceEntitlementSchema,
} from './schemas';

export type BillingCatalog = z.infer<typeof billingCatalogSchema>;
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export type WorkspaceEntitlement = z.infer<typeof workspaceEntitlementSchema>;

export const BILLING_CONFIRM_POLL_MS = 3_000;
export const BILLING_CONFIRM_MAX_POLLS = 20;

export const billingApi = {
  catalog: async (countryCode?: string, options?: ApiRequestOptions) => {
    const query = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
    const response = await apiClient.get<unknown>(`/billing/catalog${query}`, options);
    return strictValidate(billingCatalogSchema, response, 'billing.catalog');
  },
  me: async (options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>('/billing/me', options);
    return strictValidate(billingSummarySchema, response, 'billing.me');
  },
  updateCountry: async (countryCode: string, options?: ApiRequestOptions) => {
    const response = await apiClient.patch<unknown>(
      '/billing/profile',
      { country_code: countryCode },
      options,
    );
    return strictValidate(billingSummarySchema, response, 'billing.updateCountry');
  },
  checkout: async (idempotencyKey: string, options?: ApiRequestOptions) => {
    const response = await apiClient.post<unknown>(
      '/billing/checkout',
      { tier_key: 'paid', cadence: 'monthly' },
      { ...options, idempotencyKey },
    );
    return strictValidate(billingCheckoutSchema, response, 'billing.checkout');
  },
  cancel: async (options?: ApiRequestOptions) => {
    const response = await apiClient.post<unknown>('/billing/cancel', {}, options);
    return strictValidate(billingCancelSchema, response, 'billing.cancel');
  },
  entitlement: async (workspaceId: string, options?: ApiRequestOptions) => {
    const response = await apiClient.get<unknown>(
      `/workspaces/${workspaceId}/entitlements`,
      options,
    );
    return strictValidate(workspaceEntitlementSchema, response, 'billing.entitlement');
  },
};
