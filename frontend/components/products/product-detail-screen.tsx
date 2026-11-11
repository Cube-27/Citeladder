'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { DetailScreen } from '@/components/layout/page-shell';
import { AppGrid } from '@/components/ui/app-grid';
import { Card, CardContent } from '@/components/ui/card';
import { FilterChoice } from '@/components/ui/filter-bar';
import { Inline, Stack } from '@/components/ui/layout';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import { ProductImage } from '@/components/ui/product-image';
import { KpiRow } from '@/components/ui/stat-row';
import { TextLink } from '@/components/ui/text-link';
import { InlineFigure, textRole } from '@/components/ui/typography';
import type { CommerceCatalog, CommerceProductDetail } from '@citeladder/contracts/commerce-suite';
import { commerceQueries } from '@/lib/api/commerce';
import { promptsQueries } from '@/lib/api/prompts';
import { PRODUCT_DEFAULT_WINDOW, PRODUCT_WINDOW_DAYS } from '@/lib/config/commerce';
import { formatCount } from '@/lib/format';
import { useCompetitorDiscovery } from '@/lib/products/competitor-discovery';
import { holderLabel, PRODUCT_COLUMNS, productCell } from '@/lib/products/product-columns';
import {
  productScopeSearch,
  useProductScopeFilters,
  type ProductScopeFilters,
} from '@/lib/products/product-filters';
import { useCommerceQueries } from '@/lib/products/use-products-screen';
import { useEngineCatalog } from '@/lib/providers/engines';
import { useProjectScope } from '@/lib/project/active-project-scope';

import type { CommerceQueries } from './commerce-queries';
import { ProductActions } from './product-actions';
import {
  Answers,
  CompetingProducts,
  FanOutQueries,
  Merchants,
  PromptMetrics,
  Sources,
} from './product-sections';
import { MetricValue } from './products-table';
import { SetupCompetitors } from './setup-competitors';
import { SetupPrompts } from './setup-prompts';

const WINDOWS = PRODUCT_WINDOW_DAYS.map((days) => ({ value: days, label: `Last ${days} days` }));
const EVERY = '__all__';
/** The KPIs, in the plan's order; merchants have their own section below. */
const KPIS = [
  'visibility',
  'win_rate',
  'position',
  'appearances',
  'mentioned_price',
  'catalog_price',
] as const;

const backTo = (filters: ProductScopeFilters) =>
  ({ href: `/products?${productScopeSearch(filters)}`, label: 'Back to Products' }) as const;

/**
 * `/products/:id`: a product holder's page (commerce improvement PR 4), or a
 * category's setup. Products and categories share the path, so an id the
 * catalog lists as a category opens its competitors and shopping prompts;
 * any other id is a product holder, which the detail read finds or refuses.
 */
export function ProductDetailScreen() {
  const { targetId = '' } = useParams();
  const { projectId } = useProjectScope();
  const scope = useProductScopeFilters();
  const queries = useCommerceQueries(projectId);
  const back = backTo(scope.filters);
  const { catalog } = queries;
  if (catalog.isError)
    return (
      <DetailScreen back={back}>
        <QueryState
          kind="error"
          {...readErrorProps(catalog)}
          fallback="This product could not be loaded."
        />
      </DetailScreen>
    );
  if (!catalog.data)
    return (
      <DetailScreen back={back}>
        <QueryState kind="loading" label="Loading product" />
      </DetailScreen>
    );
  const category = catalog.data.categories.find((row) => row.id === targetId);
  if (category)
    return (
      <CategorySetup category={category} projectId={projectId} queries={queries} back={back} />
    );
  // Keyed by holder, so typed prompt text and launch state never carry to the next page.
  return (
    <HolderDetail
      key={targetId}
      holderId={targetId}
      projectId={projectId}
      queries={queries}
      scope={scope}
    />
  );
}

type Back = ReturnType<typeof backTo>;

/** A category's own page: who competes on its shelf, and its shopping-prompt matrix. */
function CategorySetup({
  category,
  projectId,
  queries,
  back,
}: Readonly<{
  category: CommerceCatalog['categories'][number];
  projectId: string;
  queries: CommerceQueries;
  back: Back;
}>) {
  const discovery = useCompetitorDiscovery(projectId);
  const target = { kind: 'category', id: category.id } as const;
  return (
    <DetailScreen title={category.name} back={back}>
      <Stack gap="workspace">
        <SetupCompetitors
          projectId={projectId}
          target={target}
          query={queries.competitors}
          discovery={discovery}
        />
        <SetupPrompts
          key={category.id}
          projectId={projectId}
          target={target}
          targetLabel={category.name}
          query={queries.buyerPrompts}
        />
      </Stack>
    </DetailScreen>
  );
}

function HolderDetail({
  holderId,
  projectId,
  queries,
  scope,
}: Readonly<{
  holderId: string;
  projectId: string;
  queries: CommerceQueries;
  scope: ReturnType<typeof useProductScopeFilters>;
}>) {
  const { workspaceId } = useProjectScope();
  const projectScope = { workspaceId, projectId };
  const { filters } = scope;
  const detail = useQuery(
    commerceQueries.productDetail(projectScope, holderId, productScopeSearch(filters)),
  );
  const promptSets = useQuery(promptsQueries.sets(projectScope));
  const engines = useEngineCatalog();
  const controls = {
    filters: (
      <>
        <FilterChoice
          label="Window"
          value={filters.window}
          defaultValue={PRODUCT_DEFAULT_WINDOW}
          options={WINDOWS}
          onChange={scope.setWindow}
        />
        <FilterChoice
          label="Engine"
          value={filters.engine ?? EVERY}
          defaultValue={EVERY}
          options={[
            { value: EVERY, label: 'All engines' },
            ...engines.order.map((key) => ({ value: key, label: engines.label(key) })),
          ]}
          onChange={(value) => scope.setEngine(value === EVERY ? null : value)}
        />
        <FilterChoice
          label="Prompt set"
          value={filters.promptSet ?? EVERY}
          defaultValue={EVERY}
          options={[
            { value: EVERY, label: 'All prompt sets' },
            ...(promptSets.data?.prompt_sets ?? []).map((set) => ({
              value: set.id,
              label: set.name,
            })),
          ]}
          onChange={(value) => scope.setPromptSet(value === EVERY ? null : value)}
        />
      </>
    ),
  };
  const back = backTo(filters);
  if (detail.isError)
    return (
      <DetailScreen back={back} controls={controls}>
        <QueryState
          kind="error"
          {...readErrorProps(detail)}
          fallback="This product could not be loaded."
        />
      </DetailScreen>
    );
  if (!detail.data)
    return (
      <DetailScreen back={back} controls={controls}>
        <QueryState kind="loading" label="Loading product" />
      </DetailScreen>
    );
  const data = detail.data;
  return (
    <DetailScreen
      title={data.product.name}
      back={back}
      controls={controls}
      lead={<ProductHeader detail={data} />}
    >
      <Stack gap="workspace" aria-busy={detail.isFetching}>
        <ProductKpis detail={data} />
        <AppGrid layout="pair">
          <CompetingProducts detail={data} scope={filters} />
          <Merchants detail={data} />
          <Sources detail={data} />
          <FanOutQueries detail={data} />
        </AppGrid>
        <PromptMetrics detail={data} />
        <Answers detail={data} />
        {data.product.kind === 'owned' ? (
          <ProductSetup detail={data} projectId={projectId} queries={queries} />
        ) : null}
      </Stack>
    </DetailScreen>
  );
}

/** Brand, who holds it, image, description and a link to its page. */
function ProductHeader({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  const { product } = detail;
  return (
    <Card>
      <CardContent>
        <Inline gap="compact" className="items-start">
          {product.image_url ? <ProductImage src={product.image_url} /> : null}
          <Stack gap="tight" className="min-w-0 flex-1">
            <span className={textRole('label')}>
              {[product.brand, holderLabel(product.kind)].filter(Boolean).join(' · ')}
            </span>
            {product.description ? <p className={textRole('body')}>{product.description}</p> : null}
            {product.url ? (
              <TextLink variant="external" href={product.url} text="caption">
                {product.url}
              </TextLink>
            ) : null}
          </Stack>
        </Inline>
      </CardContent>
    </Card>
  );
}

function ProductKpis({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <Stack gap="tight">
      <KpiRow
        label="Product metrics"
        segments={KPIS.map((key) => {
          const column = PRODUCT_COLUMNS.find((row) => row.key === key);
          return {
            key,
            label: column?.label ?? key,
            value: <MetricValue cell={productCell(detail.product, key)} />,
            sub: column?.hint,
          };
        })}
      />
      <p className="type-caption">
        From <InlineFigure>{formatCount(detail.executions)}</InlineFigure>
        {detail.executions === 1 ? ' answer' : ' answers'} in the last {detail.window_days} days.
      </p>
    </Stack>
  );
}

/** Competitor discovery and review, hero-product prompts, and the Actions. */
function ProductSetup({
  detail,
  projectId,
  queries,
}: Readonly<{ detail: CommerceProductDetail; projectId: string; queries: CommerceQueries }>) {
  const discovery = useCompetitorDiscovery(projectId);
  const target = { kind: 'product', id: detail.product.holder_id } as const;
  return (
    <Stack as="section" gap="workspace" aria-labelledby="product-setup">
      <h2 id="product-setup" className={textRole('sectionTitle')}>
        Setup
      </h2>
      <ProductActions detail={detail} />
      <SetupCompetitors
        projectId={projectId}
        target={target}
        query={queries.competitors}
        discovery={discovery}
      />
      <SetupPrompts
        projectId={projectId}
        target={target}
        targetLabel={detail.product.name}
        query={queries.buyerPrompts}
      />
    </Stack>
  );
}
