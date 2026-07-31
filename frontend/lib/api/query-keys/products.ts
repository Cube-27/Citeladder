/** Products (agentic commerce) query-key namespace. */
import type { ListFilters } from './shared';

export const productKeys = {
  all: ['products'] as const,
  list: (projectId: string) => ['products', 'list', projectId] as const,
  detail: (productId: string) => ['products', 'detail', productId] as const,
  competitorProducts: (projectId: string) =>
    ['products', 'competitor-products', projectId] as const,
  // `auditId ?? 'latest'` mirrors the backend default-to-latest resolution so
  // the unfiltered view and an explicit selection cache separately; the engine
  // and surface slices participate so switching a control re-derives the view.
  // `surface || 'measurement'` normalizes the measurement surface ('' or
  // omitted) to one cache entry.
  visibility: (projectId: string, auditId?: string, engine?: string, surface?: string) =>
    [
      'products',
      'visibility',
      projectId,
      auditId ?? 'latest',
      engine ?? 'all',
      surface || 'measurement',
    ] as const,
  // Every filter (audit_id, engine, limit) participates in the key so
  // switching a control re-derives the view.
  evidence: (productId: string, filters: ListFilters = {}) =>
    ['products', 'evidence', productId, filters] as const,
  // D4 delete guard: the frozen-audit usage check for one product.
  auditReferences: (productId: string) => ['products', 'audit-references', productId] as const,
};
