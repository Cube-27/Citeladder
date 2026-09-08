'use client';

import { ProductsScreen } from '@/components/products/products-screen';
import { PageHeader } from '@/components/layout/page-header';

/**
 * Commerce workspace: Catalog, Competitors, Buyer Prompts, and AI Shelf.
 * The active tab is mirrored in `?tab=`. The page title renders in the top
 * bar (F5), so there is no in-page header block.
 */
export default function ProductsPage() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <ProductsScreen />
    </div>
  );
}
