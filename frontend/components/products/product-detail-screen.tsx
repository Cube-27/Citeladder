import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MessageSquareOff } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { NotFoundScreen } from '@/components/templates/not-found-screen';
import { RecordPage } from '@/components/templates/record-page';
import { FilterControls } from '@/components/ui/filter-bar';
import type { FilterDefinition } from '@/components/ui/all-filters';
import { InfoHint } from '@/components/ui/info-hint';
import { Inline, Stack } from '@/components/ui/layout';
import { ProductImage } from '@/components/ui/product-image';
import { UrlText } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import type { CommerceCatalog, CommerceProductDetail } from '@citeladder/contracts/commerce-suite';
import { commerceQueries } from '@/lib/api/commerce';
import { isNotFound } from '@/lib/api/errors';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { promptsQueries } from '@/lib/api/prompts';
import { formatCount } from '@/lib/format';
import { useCompetitorDiscovery } from '@/lib/products/competitor-discovery';
import { holderCaption, PRODUCT_COLUMNS, productCell } from '@/lib/products/product-columns';
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
import { productScopeFilters } from './product-scope-filters';
import { AddToTracking, ProductCatalogControls } from './product-catalog-controls';
import {
  Answers,
  CompetingProducts,
  FanOutQueries,
  Merchants,
  PromptMetrics,
  SeenIn,
  Sources,
} from './product-sections';
import { MissingValue } from './products-table';
import { SetupCompetitors } from './setup-competitors';
import { SetupPrompts } from './setup-prompts';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionHeader, SectionStack, SectionTitle } from '@/components/ui/section';
import { FigureStrip } from '@/components/ui/figure-strip';
import type { LoadingShape } from '@/components/ui/skeleton-block';

/** The product's identity card as it loads: its one row. */
const PRODUCT_IDENTITY = { kind: 'facts', rows: 1 } satisfies LoadingShape;

/** The KPIs, in the plan's order; merchants have their own section below. */
const KPIS = [
  'visibility',
  'win_rate',
  'position',
  'appearances',
  'mentioned_price',
  'catalog_price',
] as const;

/** Products, opened with the filters this page was reached under. */
const trailFrom = (filters: ProductScopeFilters) => [
  { label: 'Products', href: `/products?${productScopeSearch(filters)}` },
];

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
  const trail = trailFrom(scope.filters);
  const { catalog } = queries;
  if (catalog.isError)
    return (
      <RecordPage trail={trail}>
        <StateBlock
          kind="error"
          {...readErrorProps(catalog)}
          title="Couldn't load this product"
          fallback="This product could not be loaded."
        />
      </RecordPage>
    );
  if (!catalog.data)
    return (
      <RecordPage trail={trail}>
        <StateBlock kind="loading" label="Loading product" shape={PRODUCT_IDENTITY} />
      </RecordPage>
    );
  const category = catalog.data.categories.find((row) => row.id === targetId);
  if (category)
    return (
      <CategorySetup category={category} projectId={projectId} queries={queries} trail={trail} />
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

type Trail = ReturnType<typeof trailFrom>;

/** A category's own page: who competes on its shelf, and its shopping-prompt matrix. */
function CategorySetup({
  category,
  projectId,
  queries,
  trail,
}: Readonly<{
  category: CommerceCatalog['categories'][number];
  projectId: string;
  queries: CommerceQueries;
  trail: Trail;
}>) {
  const discovery = useCompetitorDiscovery(projectId);
  const target = { kind: 'category', id: category.id } as const;
  return (
    <RecordPage title={category.name} trail={trail}>
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
    </RecordPage>
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
  const scopeFilters = scope.filters;
  const detail = useQuery(
    commerceQueries.productDetail(projectScope, holderId, productScopeSearch(scopeFilters)),
  );
  const promptSets = useQuery(promptsQueries.sets(projectScope));
  const engines = useEngineCatalog();
  const filters: FilterDefinition[] = productScopeFilters({
    scope,
    engines,
    promptSets: promptSets.data?.prompt_sets ?? [],
  });
  const trail = trailFrom(scopeFilters);
  if (isNotFound(detail.error)) return <NotFoundScreen />;
  if (detail.isError)
    return (
      <RecordPage trail={trail}>
        <StateBlock
          kind="error"
          {...readErrorProps(detail)}
          title="Couldn't load this product"
          fallback="This product could not be loaded."
        />
      </RecordPage>
    );
  if (!detail.data)
    return (
      <RecordPage trail={trail}>
        <StateBlock kind="loading" label="Loading product" shape={PRODUCT_IDENTITY} />
      </RecordPage>
    );
  const data = detail.data;
  const named = data.answer_total > 0;
  return (
    <RecordPage
      title={data.product.name}
      trail={trail}
      busy={detail.isFetching}
      identity={<ProductIdentity detail={data} scope={projectScope} filters={filters} />}
    >
      <ProductKpis detail={data} />
      {/* Each list takes the full row: beside the competing list, the short ones sat over a third empty. */}
      {named ? (
        <>
          <CompetingProducts detail={data} scope={scopeFilters} />
          <Merchants detail={data} />
          <SeenIn detail={data} scope={scopeFilters} />
          <Sources detail={data} />
          <FanOutQueries detail={data} />
        </>
      ) : null}
      {named || data.prompts.length > 0 ? <PromptMetrics detail={data} /> : null}
      {named ? (
        <Answers detail={data} />
      ) : (
        // Every section below reads the answers that named it: with none,
        // one sentence says so instead of six empty cards.
        <Section>
          <StateBlock
            kind="empty"
            icon={MessageSquareOff}
            heading={`No answer named it in the last ${data.window_days} days`}
          />
        </Section>
      )}
      {/* An archived product takes no new competitors or shopping prompts until restored. */}
      {data.product.kind === 'owned' && data.product.catalog?.lifecycle_state !== 'archived' ? (
        <ProductSetup detail={data} projectId={projectId} queries={queries} />
      ) : null}
    </RecordPage>
  );
}

/**
 * The record's identity card, one row (the masthead names it): an info hint
 * holding who holds it, the answers it is read from and a listing title that
 * differs from the name, then the image and the link to its page; the page's
 * filters and a catalog product's Edit and Archive, or Add to tracking for a
 * product the answers showed, sit at the row's end and wrap under it.
 */
function ProductIdentity({
  detail,
  scope,
  filters,
}: Readonly<{
  detail: CommerceProductDetail;
  scope: ProjectScope;
  filters: readonly FilterDefinition[];
}>) {
  const { product } = detail;
  const listingTitle =
    product.description && product.description.trim() !== product.name.trim()
      ? product.description
      : null;
  const card = (notices: ReactNode, actions: ReactNode) => (
    <Section aria-label="Product">
      <Stack gap="workspace">
        <Inline gap="compact" className="flex-wrap items-center">
          <Inline gap="item" className="min-w-0 flex-[1_1_20rem] items-center">
            <InfoHint label="About this product">
              {holderCaption(product)} · From {formatCount(detail.executions)}
              {detail.executions === 1 ? ' answer' : ' answers'} in the last {detail.window_days}{' '}
              days.
              {listingTitle ? ` Listing title: ${listingTitle}` : null}
            </InfoHint>
            {product.image_url ? <ProductImage src={product.image_url} /> : null}
            {product.url ? (
              <TextLink
                variant="external"
                href={product.url}
                text="caption"
                className="flex max-w-full min-w-0"
              >
                {listingTitle ? <span className="sr-only">{listingTitle}, </span> : null}
                <UrlText url={product.url} />
              </TextLink>
            ) : (
              <span className="type-caption text-ink-2">{holderCaption(product)}</span>
            )}
          </Inline>
          <Inline gap="item" className="ms-auto flex-wrap items-center">
            <FilterControls filters={filters} align="end" />
            {actions}
          </Inline>
        </Inline>
        {notices}
      </Stack>
    </Section>
  );
  if (product.catalog)
    return (
      <ProductCatalogControls scope={scope} product={product} catalog={product.catalog}>
        {({ notices, actions }) => card(notices, actions)}
      </ProductCatalogControls>
    );
  return card(
    null,
    product.kind === 'ai_observed_competitor' ? (
      <AddToTracking scope={scope} candidateId={product.holder_id} name={product.name} />
    ) : null,
  );
}

/** Its figures in one strip, at the strip's own figure style, each label carrying its definition. */
function ProductKpis({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <FigureStrip
      label="Product metrics"
      segments={KPIS.map((key) => {
        const column = PRODUCT_COLUMNS.find((row) => row.key === key);
        const label = column?.label ?? key;
        const cell = productCell(detail.product, key);
        return {
          key,
          label,
          value: cell.kind === 'value' ? cell.text : <MissingValue cell={cell} />,
          sub: cell.note,
          // The definition is a hint on the label, not a paragraph under every figure.
          marker: column ? <InfoHint label={`About ${label}`}>{column.hint}</InfoHint> : undefined,
        };
      })}
    />
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
    <Section aria-labelledby="product-setup">
      <SectionHeader>
        <SectionTitle id="product-setup">Setup</SectionTitle>
      </SectionHeader>
      <SectionStack>
        <ProductActions detail={detail} />
        <SetupCompetitors
          projectId={projectId}
          target={target}
          query={queries.competitors}
          discovery={discovery}
          level={3}
        />
        <SetupPrompts
          projectId={projectId}
          target={target}
          targetLabel={detail.product.name}
          query={queries.buyerPrompts}
          level={3}
        />
      </SectionStack>
    </Section>
  );
}
