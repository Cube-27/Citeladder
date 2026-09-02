'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ProductsScreen } from '@/components/products/products-screen';

/**
 * Commerce workspace: Catalog, Competitors, Buyer Prompts, and AI Shelf.
 * The active tab is mirrored in `?tab=`. The page title renders in the top
 * bar (F5), so there is no in-page header block.
 */
export default function ProductsPage() {
  return (
    <TooltipProvider>
      <div className="grid gap-[var(--workspace-gap)]">
        <ProductsScreen />
      </div>
    </TooltipProvider>
  );
}
