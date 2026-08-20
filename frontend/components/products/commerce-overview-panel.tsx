'use client';

import Link from 'next/link';
import { PackageSearch, Play } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { httpErrorStatus } from '@/lib/api/errors';
import { formatAvgRank, formatPercent } from '@/lib/products/catalog';
import type { ProductsTab } from '@/lib/products/catalog';
import type { useCommerceOverview } from '@/lib/products/use-products-screen';

type OverviewQueries = ReturnType<typeof useCommerceOverview>;

export function CommerceOverviewPanel({
  queries,
  onSelectTab,
  onLaunchAudit,
}: Readonly<{
  queries: OverviewQueries;
  onSelectTab: (tab: ProductsTab) => void;
  onLaunchAudit: () => void;
}>) {
  if (queries.visibilityQuery.isLoading || queries.productsQuery.isLoading) {
    return <p className="text-secondary text-sm">Loading Commerce overview…</p>;
  }
  if (queries.productsQuery.isError) {
    return <Alert tone="danger">Could not load the Commerce overview.</Alert>;
  }
  if (!queries.productsQuery.data?.length) {
    return (
      <EmptyState
        icon={PackageSearch}
        heading="Add products before measuring Commerce visibility"
        description="Import or add the products you want CiteLadder to track, then launch an AI visibility audit."
        action={<Button onClick={() => onSelectTab('catalog')}>Add products</Button>}
      />
    );
  }
  if (queries.visibilityQuery.isError && httpErrorStatus(queries.visibilityQuery.error) !== 404) {
    return <Alert tone="danger">Could not load the Commerce overview.</Alert>;
  }
  if (
    (queries.visibilityQuery.isError && httpErrorStatus(queries.visibilityQuery.error) === 404) ||
    !queries.visibilityQuery.data
  ) {
    return (
      <EmptyState
        icon={Play}
        heading="Run your first Commerce visibility audit"
        description="The audit freezes the current catalog and measures which products AI engines mention."
        action={<Button onClick={onLaunchAudit}>Launch audit</Button>}
      />
    );
  }
  const visibility = queries.visibilityQuery.data;
  const summary = visibility.summary;
  const gaps = [...visibility.products]
    .filter((product) => product.visibility_delta !== null)
    .sort((a, b) => a.visibility_delta! - b.visibility_delta!)
    .slice(0, 3);

  return (
    <div className="grid gap-4" data-testid="commerce-overview-panel">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Products visible"
          value={`${summary.products_visible}/${summary.products_tracked}`}
        />
        <Kpi label="Visibility rate" value={formatPercent(summary.visibility_rate)} />
        <Kpi label="Top-three rate" value={formatPercent(summary.top_three_rate)} />
        <Kpi label="Average rank" value={formatAvgRank(summary.average_rank)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Engine visibility</CardTitle>
            <CardDescription>Latest completed audit across configured AI engines.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>{visibility.total_analyses} responses analyzed</p>
            <p>{summary.competitor_wins} observed competitor wins</p>
            <button
              className="text-link w-fit"
              type="button"
              onClick={() => onSelectTab('visibility')}
            >
              View AI Visibility
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Largest product gaps</CardTitle>
            <CardDescription>Products with the weakest recent visibility movement.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {gaps.map((product) => (
              <Link
                key={product.product_id ?? product.sku}
                className="hover:bg-surface-hover flex justify-between rounded-sm p-2"
                href={
                  product.product_id ? `/products/${product.product_id}` : '/products?tab=catalog'
                }
              >
                <span>{product.name}</span>
                <span>{formatPercent(product.visibility_delta)}</span>
              </Link>
            ))}
            {!gaps.length ? <p className="text-muted">No product gaps yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recommended actions</CardTitle>
          <CardDescription>Deterministic opportunities tied to product evidence.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <RecommendedActions query={queries.opportunitiesQuery} onSelectTab={onSelectTab} />
        </CardContent>
      </Card>
    </div>
  );
}

function RecommendedActions({
  query,
  onSelectTab,
}: Readonly<{
  query: OverviewQueries['opportunitiesQuery'];
  onSelectTab: (tab: ProductsTab) => void;
}>) {
  // Loading and failure are answered before absence: an unresolved or failed
  // request carries no items, and reporting that as "no open actions" would
  // state a fact about the catalog that was never observed.
  if (query.isLoading) return <p className="text-secondary">Loading Commerce actions…</p>;
  if (query.isError) return <Alert tone="danger">Could not load Commerce actions.</Alert>;
  if (!query.data) return <p className="text-muted">Commerce actions are unavailable.</p>;
  const opportunities = query.data.items;
  if (!opportunities.length) return <p className="text-muted">No open Commerce actions.</p>;
  return (
    <>
      {opportunities.slice(0, 3).map((opportunity) => (
        <button
          key={opportunity.id}
          className="hover:bg-surface-hover flex justify-between rounded-sm p-2 text-left"
          type="button"
          onClick={() => onSelectTab('opportunities')}
        >
          <span>{opportunity.title}</span>
          <span className="text-muted">{opportunity.target_label ?? 'Catalog'}</span>
        </button>
      ))}
    </>
  );
}

function Kpi({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <span className="text-muted text-xs">{label}</span>
        <strong className="text-2xl">{value}</strong>
      </CardContent>
    </Card>
  );
}
