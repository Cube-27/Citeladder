'use client';

import { PageHeader } from '@/components/layout/page-header';

import { ProductsScreen } from './products-screen';

/** Shared /products Commerce Suite route content. */
export function ProductsRouteContent() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <ProductsScreen />
    </div>
  );
}
