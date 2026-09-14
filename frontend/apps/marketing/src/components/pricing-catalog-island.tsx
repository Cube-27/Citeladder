import { PricingCatalog } from '@/components/marketing/pricing/pricing-catalog';
import { QueryProvider } from '@/lib/providers/query-provider';

export function PricingCatalogIsland() {
  return (
    <QueryProvider>
      <PricingCatalog />
    </QueryProvider>
  );
}
