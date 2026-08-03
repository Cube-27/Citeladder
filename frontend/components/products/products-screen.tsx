'use client';

import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectContext } from '@/lib/project/project-context';
import {
  useCatalogQueries,
  useCommerceDiscovery,
  useMarketIntelligence,
  useProductsTab,
  useProductVisibilityQueries,
} from '@/lib/products/use-products-screen';

import { CatalogPanel } from './catalog-panel';
import { CommerceDiscoveryPanel } from './commerce-discovery-panel';
import { MarketIntelligencePanel } from './market-intelligence-panel';
import { ProductVisibilityPanel } from './product-visibility-panel';
import { ProductsTabs } from './products-tabs';

export function ProductsScreenSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden>
      <Skeleton className="h-8 w-72" />
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Commerce workspace container. Resolves the active project (F5 context) and
 * renders one shell: an accessible four-tab tablist (**Discover** default |
 * **Catalog** | **AI Conversations** | **Market Intelligence**) with exactly one panel at a time; the
 * active tab is mirrored in `?tab=` (mirror `visibility-dashboard.tsx`).
 * Every tab's query hooks are instantiated HERE with explicit `enabled`
 * flags, so only the active tab's queries run — hidden tabs stay inert.
 */
export function ProductsScreen() {
  const { activeProject, isLoading: isProjectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;

  const { activeTab, selectTab } = useProductsTab();
  const catalogQueries = useCatalogQueries(projectId, activeTab === 'catalog');
  const visibilityQueries = useProductVisibilityQueries(projectId, activeTab === 'conversations');
  const discoveryQueries = useCommerceDiscovery(projectId, activeTab === 'discover');
  const marketQueries = useMarketIntelligence(projectId, activeTab === 'market_intelligence');

  if (isProjectLoading) {
    return <ProductsScreenSkeleton />;
  }

  if (!projectId) {
    return <Alert tone="info">Select or create a project to manage its product catalog.</Alert>;
  }

  const panel =
    activeTab === 'conversations' ? (
      <ProductVisibilityPanel
        projectId={projectId}
        queries={visibilityQueries}
        onGoToCatalog={() => selectTab('catalog')}
      />
    ) : activeTab === 'catalog' ? (
      <CatalogPanel projectId={projectId} queries={catalogQueries} />
    ) : activeTab === 'market_intelligence' ? (
      <MarketIntelligencePanel projectId={projectId} queries={marketQueries} />
    ) : (
      <CommerceDiscoveryPanel projectId={projectId} queries={discoveryQueries} />
    );

  return <ProductsTabs activeTab={activeTab} onSelectTab={selectTab} panel={panel} />;
}
