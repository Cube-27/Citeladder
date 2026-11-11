'use client';

import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ListScreen } from '@/components/layout/page-shell';
import { AppGrid } from '@/components/ui/app-grid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DisplayTime } from '@/components/ui/display-time';
import { FilterChoice } from '@/components/ui/filter-bar';
import { Inline, Stack } from '@/components/ui/layout';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import { StatRow } from '@/components/ui/stat-row';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { SegmentedControl } from '@/components/ui/tabs';
import { InlineFigure } from '@/components/ui/typography';
import { MissingValue, UnavailableValue } from '@/components/ui/unavailable-value';
import type {
  CommerceOverviewBrand,
  CommerceOverviewProduct,
  CommerceShoppingOverview,
} from '@citeladder/contracts/commerce-suite';
import { commerceQueries } from '@/lib/api/commerce';
import {
  PRODUCT_DEFAULT_WINDOW,
  PRODUCT_WINDOW_DAYS,
  type ProductWindowDays,
} from '@/lib/config/commerce';
import { formatCount, formatPercent, pluralCount } from '@/lib/format';
import { holderLabel } from '@/lib/products/product-columns';
import {
  overviewSearch,
  productHref,
  useOverviewFilters,
  type ProductScopeFilters,
} from '@/lib/products/product-filters';
import { useProjectScope } from '@/lib/project/active-project-scope';

const WINDOWS = PRODUCT_WINDOW_DAYS.map((days) => ({ value: days, label: `Last ${days} days` }));
const EVERY = '__all__';
const RANKINGS = [
  { value: 'brands', label: 'Brands' },
  { value: 'products', label: 'Products' },
] as const;
type Ranking = (typeof RANKINGS)[number]['value'];
type Overview = CommerceShoppingOverview;

const percent = (value: number) => formatPercent(value, 1);
const rank = (value: number) => value.toFixed(1);

/** A rate or mean, or the unavailable mark when nothing in scope measured it (never a zero). */
function Measured({
  value,
  format,
}: Readonly<{ value: number | null; format: (value: number) => string }>) {
  return value === null ? <MissingValue state="unavailable" /> : format(value);
}

/** One row in place of rows: what is absent. */
const emptyRow = (message: string) => ({ kind: 'empty', inline: true, message }) as const;

const VISIBILITY: DataTableColumn = {
  key: 'visibility',
  label: 'Visibility',
  hint: 'Share of answers in the window that named it.',
  width: 'figure',
  numeric: true,
};
const METRIC_COLUMNS: readonly DataTableColumn[] = [
  VISIBILITY,
  {
    key: 'win_rate',
    label: 'Win rate',
    hint: 'Of the ranked answers that named it, the share that ranked it first.',
    width: 'figure',
    numeric: true,
  },
  {
    key: 'position',
    label: 'Position',
    hint: 'Its mean rank in the answers that ranked it; a carousel rank counts first.',
    width: 'figure',
    numeric: true,
  },
];
const SHARE_COLUMN: DataTableColumn = {
  key: 'share_of_shelf',
  label: 'Share of Shelf',
  hint: 'Its products’ share of every product recommendation in the answers.',
  width: 'figure',
  numeric: true,
};

function MetricCells({ row }: Readonly<{ row: CommerceOverviewProduct | CommerceOverviewBrand }>) {
  return (
    <>
      <TableCell numeric>
        <Measured value={row.visibility} format={percent} />
      </TableCell>
      <TableCell numeric>
        <Measured value={row.win_rate} format={percent} />
      </TableCell>
      <TableCell numeric>
        <Measured value={row.position} format={rank} />
      </TableCell>
    </>
  );
}

/** Every product opens its own page in the overview's window, as the Products table's rows do. */
function ProductName({
  row,
  scope,
}: Readonly<{ row: CommerceOverviewProduct; scope: ProductScopeFilters }>) {
  const caption = [row.brand, holderLabel(row.kind)].filter(Boolean).join(' · ');
  const name = (
    <TextLink href={productHref(row.holder_id, scope)} text="inherit">
      {row.name}
    </TextLink>
  );
  return <TableCellLines title primary={name} secondary={caption} />;
}

/** Brands (with Share of Shelf) or products, by appearances in the window. */
function RankingTable({
  overview,
  scope,
}: Readonly<{ overview: Overview; scope: ProductScopeFilters }>) {
  const [ranking, setRanking] = useState<Ranking>('brands');
  const brands = ranking === 'brands';
  const count = brands ? overview.brands.length : overview.products.length;
  const emptyMessage = brands ? 'No brand yet.' : 'No product yet.';
  return (
    <DataTable
      title="Ranking"
      description="By appearances in the window's answers."
      toolbar={{
        view: (
          <SegmentedControl
            ariaLabel="Ranking shown"
            value={ranking}
            options={RANKINGS}
            onChange={setRanking}
          />
        ),
      }}
      columns={[
        { key: 'name', label: brands ? 'Brand' : 'Product' },
        ...METRIC_COLUMNS,
        ...(brands ? [SHARE_COLUMN] : []),
      ]}
      rowCount={count}
      rowLines={2}
      state={count ? undefined : emptyRow(emptyMessage)}
    >
      {brands
        ? overview.brands.map((row) => (
            <TableRow key={row.brand}>
              <TableCell>
                <TableCellLines
                  title
                  primary={row.brand}
                  secondary={row.owned ? 'Your brand' : 'Competitor'}
                />
              </TableCell>
              <MetricCells row={row} />
              <TableCell numeric>
                <Measured value={row.share_of_shelf} format={percent} />
              </TableCell>
            </TableRow>
          ))
        : overview.products.map((row) => (
            <TableRow key={row.holder_id}>
              <TableCell>
                <ProductName row={row} scope={scope} />
              </TableCell>
              <MetricCells row={row} />
            </TableRow>
          ))}
    </DataTable>
  );
}

function ProductList({
  title,
  description,
  empty,
  rows,
  scope,
}: Readonly<{
  title: string;
  description: string;
  empty: string;
  rows: readonly CommerceOverviewProduct[];
  scope: ProductScopeFilters;
}>) {
  return (
    <DataTable
      title={title}
      description={description}
      columns={[
        { key: 'name', label: 'Product' },
        {
          key: 'appearances',
          label: 'Appearances',
          hint: 'Answers that named it.',
          width: 'figure',
          numeric: true,
        },
        VISIBILITY,
      ]}
      rowCount={rows.length}
      rowLines={2}
      state={rows.length ? undefined : emptyRow(empty)}
    >
      {rows.map((row) => (
        <TableRow key={row.holder_id}>
          <TableCell>
            <ProductName row={row} scope={scope} />
          </TableCell>
          <TableCell numeric>{formatCount(row.appearances)}</TableCell>
          <TableCell numeric>
            <Measured value={row.visibility} format={percent} />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function MerchantTable({ rows }: Readonly<{ rows: Overview['merchants'] }>) {
  return (
    <DataTable
      title="Top merchants"
      description="Where the answers send shoppers to buy."
      columns={[
        { key: 'domain', label: 'Merchant' },
        { key: 'answers', label: 'Answers', width: 'figure', numeric: true },
        { key: 'products', label: 'Products', width: 'figure', numeric: true },
      ]}
      rowCount={rows.length}
      state={rows.length ? undefined : emptyRow('No answer named a merchant.')}
    >
      {rows.map((row) => (
        <TableRow key={row.domain}>
          <TableCell>{row.domain}</TableCell>
          <TableCell numeric>{formatCount(row.answers)}</TableCell>
          <TableCell numeric>{formatCount(row.products)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

/**
 * What the query list stands on. An answer that searched without exposing its
 * queries, or has no analysis yet, is unknown: neither a search nor none.
 */
function fanoutCoverage(fanout: Overview['fanout']) {
  const unknown = fanout.answers - fanout.answers_with_queries - fanout.answers_without_search;
  const parts = [
    `${formatCount(fanout.answers_with_queries)} with readable search queries`,
    `${formatCount(fanout.answers_without_search)} without a search`,
    ...(unknown ? [`${formatCount(unknown)} unknown`] : []),
  ];
  return `From the ${pluralCount(fanout.answers, 'answer')} that named a product: ${parts.join(', ')}.`;
}

function FanoutTable({ fanout }: Readonly<{ fanout: Overview['fanout'] }>) {
  const empty = fanout.answers
    ? 'No answer exposed its search queries.'
    : 'No answer named a product.';
  return (
    <DataTable
      title="Top fan-out queries"
      description={fanoutCoverage(fanout)}
      columns={[
        { key: 'query', label: 'Query' },
        { key: 'answers', label: 'Answers', width: 'figure', numeric: true },
      ]}
      rowCount={fanout.queries.length}
      state={fanout.queries.length ? undefined : emptyRow(empty)}
    >
      {fanout.queries.map((row) => (
        <TableRow key={row.query}>
          <TableCell>{row.query}</TableCell>
          <TableCell numeric>{formatCount(row.answers)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const shelfPercent = (value: number | null) => (value === null ? null : percent(value));

/**
 * The chosen category's AI Shelf from its latest Commerce run: the
 * category-target metrics, unchanged. Not measured until a run covers it.
 */
function CategoryShelf({ shelf }: Readonly<{ shelf: Overview['category_shelf'] }>) {
  // A run measured it but a metric had no denominator: unavailable, not unmeasured.
  const missing = shelf ? 'unavailable' : 'not_measured';
  const segments = [
    {
      label: 'Product visibility',
      sub: 'Share of answers that recommended you.',
      value: shelfPercent(shelf?.product_visibility ?? null),
    },
    {
      label: 'Share of shelf',
      sub: 'Your share of every recommendation named.',
      value: shelfPercent(shelf?.share_of_shelf ?? null),
    },
    {
      label: 'Average position',
      sub: 'Your mean rank in answers that ranked products.',
      value: shelf?.average_shelf_position?.toFixed(2) ?? null,
    },
    {
      label: 'First-position rate',
      sub: 'Share of ranked answers that put you first.',
      value: shelfPercent(shelf?.first_position_win_rate ?? null),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category shelf</CardTitle>
        <CardDescription>
          {shelf ? (
            <>
              Latest Commerce run, <DisplayTime value={shelf.measured_at} dateOnly />, from{' '}
              {pluralCount(shelf.successful_execution_count, 'answer')} and{' '}
              {pluralCount(shelf.recognized_slot_count, 'recognized recommendation')}.
            </>
          ) : (
            'No Commerce run has measured this category yet.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StatRow
          segments={segments.map(({ label, sub, value }) => ({
            key: label,
            label,
            sub,
            value: value ?? <UnavailableValue state={missing} />,
          }))}
        />
      </CardContent>
    </Card>
  );
}

/**
 * What the screen draws below its filters for one read of the overview; each
 * product links to its page in `windowDays`, the window the overview was read in.
 */
export function OverviewSections({
  query,
  windowDays,
}: Readonly<{ query: UseQueryResult<Overview>; windowDays: ProductWindowDays }>) {
  if (query.isPending) return <QueryState kind="loading" label="Loading the Shopping overview" />;
  if (query.isError)
    return (
      <QueryState
        kind="error"
        {...readErrorProps(query)}
        fallback="The Shopping overview could not be loaded."
      />
    );
  const overview = query.data;
  const scope: ProductScopeFilters = { window: windowDays, engine: null, promptSet: null };
  return (
    <Stack gap="section">
      <Inline as="p" gap="meta" className="type-caption">
        <span>
          <InlineFigure>{formatCount(overview.executions)}</InlineFigure>
          {overview.executions === 1 ? ' answer' : ' answers'} in the last {overview.window_days}{' '}
          days
        </span>
        <span>
          <InlineFigure>{formatCount(overview.slots)}</InlineFigure>
          {overview.slots === 1 ? ' product recommendation' : ' product recommendations'}
        </span>
      </Inline>
      {overview.category ? <CategoryShelf shelf={overview.category_shelf} /> : null}
      <RankingTable overview={overview} scope={scope} />
      <AppGrid layout="halves">
        <ProductList
          title="Most visible"
          description="Your products named in the most answers."
          empty="No product in the catalog yet."
          rows={overview.most_visible}
          scope={scope}
        />
        <ProductList
          title="Least visible"
          description="Your products named in the fewest answers."
          empty="Every product is listed under Most visible."
          rows={overview.least_visible}
          scope={scope}
        />
      </AppGrid>
      <AppGrid layout="halves">
        <MerchantTable rows={overview.merchants} />
        <FanoutTable fanout={overview.fanout} />
      </AppGrid>
    </Stack>
  );
}

/**
 * Commerce's Shopping overview (commerce improvement PR 5): how brands and
 * products rank in AI shopping answers over a window, which catalog products
 * are most and least visible, where answers send shoppers and what they
 * searched; with a category, its AI Shelf from the latest Commerce run.
 */
export function ShoppingOverviewScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const scope = { workspaceId, projectId };
  const overviewFilters = useOverviewFilters();
  const { filters } = overviewFilters;
  const catalog = useQuery(commerceQueries.catalog(scope));
  const known = catalog.data?.categories ?? [];
  // A project switch keeps the `category` parameter; another project's category reads as none.
  const category = known.some((row) => row.id === filters.category) ? filters.category : null;
  const query = useQuery({
    ...commerceQueries.overview(scope, overviewSearch({ ...filters, category })),
    // A category in the URL waits for the catalog that says whether it is this project's.
    enabled: !filters.category || !catalog.isPending,
  });
  const categories = [
    { value: EVERY, label: 'All categories' },
    ...known.map((row) => ({ value: row.id, label: row.name })),
  ];
  return (
    <ListScreen
      controls={{
        filters: (
          <>
            <FilterChoice
              label="Window"
              value={filters.window}
              defaultValue={PRODUCT_DEFAULT_WINDOW}
              options={WINDOWS}
              onChange={overviewFilters.setWindow}
            />
            <FilterChoice
              label="Category"
              value={category ?? EVERY}
              defaultValue={EVERY}
              options={categories}
              onChange={(value) => overviewFilters.setCategory(value === EVERY ? null : value)}
            />
          </>
        ),
      }}
    >
      <OverviewSections query={query} windowDays={filters.window} />
    </ListScreen>
  );
}
