'use client';

import Link from 'next/link';
import { PackageSearch, Play } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { httpErrorStatus } from '@/lib/api/errors';
import { productsApi } from '@/lib/api/products';
import { formatAvgRank, formatPercent } from '@/lib/products/catalog';
import type { useProductVisibilityQueries } from '@/lib/products/use-products-screen';

import { EngineFilterDropdown } from './engine-filter-dropdown';
import { RunSelectorDropdown } from './run-selector-dropdown';

type VisibilityQueries = ReturnType<typeof useProductVisibilityQueries>;

export function AiVisibilityPanel({
  projectId,
  queries,
  onAddProducts,
  onLaunchAudit,
}: Readonly<{
  projectId: string;
  queries: VisibilityQueries;
  onAddProducts: () => void;
  onLaunchAudit: () => void;
}>) {
  if (queries.visibilityQuery.isLoading || queries.productsQuery.isLoading)
    return <p className="text-secondary text-sm">Loading visibility…</p>;
  if (queries.productsQuery.isError) {
    return <Alert tone="danger">Could not load the product catalog.</Alert>;
  }
  if (!queries.productsQuery.data?.length) {
    return (
      <EmptyState
        icon={PackageSearch}
        heading="Add products before measuring them"
        description="Commerce visibility is calculated for the products present when an audit starts."
        action={<Button onClick={onAddProducts}>Add products</Button>}
      />
    );
  }
  if (queries.visibilityQuery.isError && httpErrorStatus(queries.visibilityQuery.error) !== 404) {
    return <Alert tone="danger">Could not load Commerce visibility.</Alert>;
  }
  if (
    (queries.visibilityQuery.isError && httpErrorStatus(queries.visibilityQuery.error) === 404) ||
    !queries.visibilityQuery.data
  ) {
    return (
      <EmptyState
        icon={Play}
        heading="No Commerce visibility audit yet"
        description="Launch an audit to measure product mentions, rankings, and engine coverage."
        action={<Button onClick={onLaunchAudit}>Launch audit</Button>}
      />
    );
  }
  const visibility = queries.visibilityQuery.data;

  return (
    <div className="grid gap-4" data-testid="commerce-visibility-panel">
      <div className="flex flex-wrap items-center gap-2">
        <RunSelectorDropdown
          runOptions={queries.runOptions}
          activeRunId={queries.activeRunId}
          selectRun={queries.selectRun}
        />
        <EngineFilterDropdown engine={queries.engine} onChange={queries.setEngine} />
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <a
            href={productsApi.exportCsvUrl(projectId, {
              audit_id: queries.activeRunId ?? undefined,
              engine: queries.engineParam,
            })}
            download
          >
            Export CSV
          </a>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>SKU visibility</CardTitle>
          <CardDescription>Observed performance in the selected persisted audit.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted border-b">
              <tr>
                <th className="p-2">Product</th>
                <th className="p-2">Visibility</th>
                <th className="p-2">Top three</th>
                <th className="p-2">Avg position</th>
                <th className="p-2">Engine coverage</th>
                <th className="p-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {visibility.products.map((product) => (
                <tr key={product.product_id ?? product.sku} className="border-b last:border-0">
                  <td className="p-2">
                    {product.product_id ? (
                      <Link className="text-link" href={`/products/${product.product_id}`}>
                        {product.name}
                        <span className="text-muted block text-xs">{product.sku}</span>
                      </Link>
                    ) : (
                      <span>
                        {product.name}
                        <span className="text-muted block text-xs">{product.sku}</span>
                      </span>
                    )}
                  </td>
                  <td className="p-2">{formatPercent(product.visibility_rate)}</td>
                  <td className="p-2">{formatPercent(product.top_three_rate)}</td>
                  <td className="p-2">{formatAvgRank(product.avg_rank)}</td>
                  <td className="p-2">{product.engine_coverage} engines</td>
                  <td className="p-2">{formatPercent(product.visibility_delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
