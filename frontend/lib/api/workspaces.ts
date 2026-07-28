/** Workspace membership-scoped endpoints. */
import { apiClient, type ApiRequestOptions } from './client';
import { productTourSchema, strictValidate } from './schemas';
import type { ProductTour, ProductTourStatus } from './types';

export const workspacesApi = {
  getProductTour: async (workspaceId: string, options?: ApiRequestOptions) => {
    const response = await apiClient.get<ProductTour>(
      `/workspaces/${workspaceId}/product-tour`,
      options,
    );
    return strictValidate(productTourSchema, response, 'workspaces.getProductTour');
  },
  updateProductTour: async (
    workspaceId: string,
    payload: { version: string; status: ProductTourStatus; step_id?: string | null },
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.patch<ProductTour>(
      `/workspaces/${workspaceId}/product-tour`,
      payload,
      options,
    );
    return strictValidate(productTourSchema, response, 'workspaces.updateProductTour');
  },
};
