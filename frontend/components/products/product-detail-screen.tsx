'use client';

import { useParams } from 'react-router-dom';

import { DetailScreen } from '@/components/layout/page-shell';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import type { CommerceCatalog, CommerceTarget } from '@citeladder/contracts/commerce-suite';
import { useCompetitorDiscovery } from '@/lib/products/competitor-discovery';
import { useCommerceQueries } from '@/lib/products/use-products-screen';
import { useProjectScope } from '@/lib/project/active-project-scope';

import { TargetDetail } from './target-detail';

const BACK = { href: '/products', label: 'Back to Products' } as const;

/**
 * A catalog id is a category when the catalog lists it as one, else a
 * product: both share `/products/:id`, so a category keeps its own shelf,
 * competitors and shopping prompts.
 */
function resolveTarget(
  catalog: CommerceCatalog,
  id: string,
): { target: CommerceTarget; label: string } {
  const category = catalog.categories.find((row) => row.id === id);
  if (category) return { target: { kind: 'category', id }, label: category.name };
  const product = catalog.products.find((row) => row.id === id);
  return { target: { kind: 'product', id }, label: product?.name ?? 'Product' };
}

/**
 * One catalog product's (or category's) page, opened from a Products row.
 * In this release it renders the existing target detail: AI Shelf, guided
 * next step, Actions, competitors and buyer prompts.
 */
export function ProductDetailScreen() {
  const { targetId = '' } = useParams();
  const { projectId } = useProjectScope();
  const catalog = useCommerceQueries(projectId).catalog;
  if (catalog.isError)
    return (
      <DetailScreen back={BACK}>
        <QueryState
          kind="error"
          {...readErrorProps(catalog)}
          fallback="This product could not be loaded."
        />
      </DetailScreen>
    );
  if (!catalog.data)
    return (
      <DetailScreen back={BACK}>
        <QueryState kind="loading" label="Loading product" />
      </DetailScreen>
    );
  return <ResolvedDetail {...resolveTarget(catalog.data, targetId)} projectId={projectId} />;
}

function ResolvedDetail({
  target,
  label,
  projectId,
}: Readonly<{ target: CommerceTarget; label: string; projectId: string }>) {
  const queries = useCommerceQueries(projectId, target);
  const discovery = useCompetitorDiscovery(projectId);
  return (
    <DetailScreen title={label} back={BACK}>
      <TargetDetail
        projectId={projectId}
        target={target}
        label={label}
        queries={queries}
        discovery={discovery}
      />
    </DetailScreen>
  );
}
