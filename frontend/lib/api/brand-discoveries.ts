import { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  brandDiscoveryCatalogSchema,
  brandDiscoveryProjectSchema,
  brandDiscoverySchema,
  strictValidate,
} from './schemas';

export type BrandDiscovery = z.infer<typeof brandDiscoverySchema>;
export type BrandDiscoveryInput = {
  brand_name: string;
  website_url: string;
  industry: string;
  business_type: 'b2b' | 'b2c' | 'both';
  products_services?: string[];
  target_audience?: string;
  positioning?: string;
  price_tier?: 'budget' | 'mid_market' | 'premium' | 'luxury' | 'unknown';
  additional_context?: string;
  country_code?: string;
  language_code?: string;
};

export type BrandDiscoveryConfirmation = {
  profile: {
    description: string;
    positioning: string;
    products_services: string[];
    target_audience: string;
    industry: string;
    business_type: 'b2b' | 'b2c' | 'both';
    price_tier: string;
  };
  domains: string[];
  competitors: Array<{ name: string; aliases: string[]; domains: string[] }>;
  topics: string[];
};

export const brandDiscoveriesApi = {
  catalog: async (options?: ApiRequestOptions) => {
    const value = await apiClient.get('/brand-discovery-catalog', options);
    return strictValidate(brandDiscoveryCatalogSchema, value, 'brandDiscovery.catalog');
  },
  create: async (input: BrandDiscoveryInput, idempotencyKey: string) => {
    const value = await apiClient.post('/brand-discoveries', input, {
      idempotencyKey,
      retryNetworkFailures: true,
    });
    return strictValidate(brandDiscoverySchema, value, 'brandDiscovery.create');
  },
  get: async (id: string, options?: ApiRequestOptions) => {
    const value = await apiClient.get(`/brand-discoveries/${id}`, options);
    return strictValidate(brandDiscoverySchema, value, 'brandDiscovery.get');
  },
  confirm: async (id: string, input: BrandDiscoveryConfirmation) => {
    const value = await apiClient.post(`/brand-discoveries/${id}/confirm`, input);
    return strictValidate(brandDiscoverySchema, value, 'brandDiscovery.confirm');
  },
  createProject: async (id: string, name: string, idempotencyKey: string) => {
    const value = await apiClient.post(
      `/brand-discoveries/${id}/create-project`,
      { name },
      { idempotencyKey, retryNetworkFailures: true },
    );
    return strictValidate(brandDiscoveryProjectSchema, value, 'brandDiscovery.createProject');
  },
};
