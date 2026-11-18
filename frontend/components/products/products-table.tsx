import { PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { DataTable, type DataTableColumn, type DataTablePager } from '@/components/ui/data-table';
import {
  TableActionsCell,
  TableCell,
  TableCellLines,
  TableRow,
  TableSelectCell,
} from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import { Value } from '@/components/ui/value';
import type {
  CommerceProductPage,
  CommerceProductRow,
  CommerceProductSort,
} from '@citeladder/contracts/commerce-suite';
import {
  holderCaption,
  PRODUCT_COLUMNS,
  productCell,
  type ProductCell,
  type ProductColumnKey,
} from '@/lib/products/product-columns';
import {
  productHref,
  type ProductFilters,
  type ProductScopeFilters,
} from '@/lib/products/product-filters';
import { useProjectScope } from '@/lib/project/active-project-scope';
import type { UseQueryResult } from '@tanstack/react-query';

import { AddToTracking } from './product-catalog-controls';

/** The metric columns a reader can sort by; each sorts best first. */
const SORTABLE: Partial<Record<ProductColumnKey, CommerceProductSort>> = {
  visibility: 'visibility',
  win_rate: 'win_rate',
  position: 'position',
};

/**
 * Each metric column's width role; the product name takes what is left. The
 * four ranking figures fit beside the pinned name at 982; prices and
 * merchants come last and are what scrolls. None is `priority: 'low'`: the
 * reader picks the columns, so a chosen column never hides for room.
 */
const COLUMN_WIDTHS: Record<ProductColumnKey, DataTableColumn['width']> = {
  visibility: 'shortMetric',
  appearances: 'shortMetric',
  win_rate: 'shortMetric',
  position: 'shortMetric',
  mentioned_price: 'figure',
  catalog_price: 'figure',
  merchants: 'category',
};

/**
 * A metric as the Value atom prints it, its note beneath. Nothing in scope to
 * measure is "not measured", a price the catalog lacks is "unknown", and a
 * competitor's catalog price does not apply; none of them is ever a zero.
 */
function MetricValue({ cell }: Readonly<{ cell: ProductCell }>) {
  const value = cell.kind === 'value' ? <Value value={cell.text} /> : <MissingValue cell={cell} />;
  if (!cell.note) return value;
  return (
    <span title={cell.note}>
      {value}
      <span className="type-caption block">{cell.note}</span>
    </span>
  );
}

/** A metric's absence, or "None": never a zero. */
export function MissingValue({
  cell,
}: Readonly<{ cell: Extract<ProductCell, { kind: 'missing' }> }>) {
  switch (cell.state) {
    case 'none':
      return <Absence state="none" />;
    case 'not_mentioned':
      return <Absence state="none" label="Not mentioned" />;
    case 'not_applicable':
      return <Absence state="not_applicable" />;
    case 'unknown':
      return <Absence state="unavailable" label="Unknown" />;
    case 'unavailable':
      return <Absence state="not_measured" />;
    default: {
      const exhaustive: never = cell.state;
      return exhaustive;
    }
  }
}

/** The Products table's empty page: nothing listed yet, or nothing matching the filters. */
export type ProductsEmpty =
  | Readonly<{ kind: 'empty'; source: ProductFilters['source'] }>
  | Readonly<{ kind: 'filtered'; onClear: () => void }>;

/** The product cell: its page (in the read's window), its brand and who holds it. */
export function ProductName({
  row,
  scope,
}: Readonly<{
  row: Pick<CommerceProductRow, 'holder_id' | 'name' | 'brand' | 'kind'>;
  scope: ProductScopeFilters;
}>) {
  const name = (
    <TextLink href={productHref(row.holder_id, scope)} text="inherit" underline="hover">
      {row.name}
    </TextLink>
  );
  // "Your product" is said once, by the My catalog view and the row's accent
  // mark; a row names its kind only when it differs.
  const caption = row.kind === 'owned' ? row.brand : holderCaption(row);
  return <TableCellLines title primary={name} secondary={caption || undefined} />;
}

/**
 * The Products table: one row per holder with the shown metric columns. A
 * catalog product can be checked for bulk competitor discovery; competitor
 * rows cannot (discovery targets the catalog), nor archived products.
 */
export function ProductsTable({
  query,
  columns,
  sort,
  onSort,
  checked,
  onCheck,
  pager,
  pageSize,
  scope,
  trackable = false,
  selectable = true,
  empty,
  description,
  onRetry = () => void query.refetch(),
}: Readonly<{
  /** What an empty page says: none yet, or none matching the filters. */
  empty: ProductsEmpty;
  /** A failed read's one Retry: the page's other reads may have failed with it. */
  onRetry?: () => void;
  /** One caption line over the table (the chosen category's own page). */
  description?: ReactNode;
  /** The reader's rows per page: the footprint the table reserves. */
  pageSize: number;
  query: UseQueryResult<CommerceProductPage>;
  /** All products: an AI-observed competitor's row offers Add to tracking (CM6). */
  trackable?: boolean;
  /** Whether catalog rows can be checked; archived products take no new competitors. */
  selectable?: boolean;
  /** The window, engine and prompt set a row's page opens with. */
  scope: ProductScopeFilters;
  columns: readonly ProductColumnKey[];
  sort: CommerceProductSort;
  onSort: (sort: CommerceProductSort) => void;
  checked: ReadonlySet<string>;
  onCheck: (ids: string[], checked: boolean) => void;
  pager: DataTablePager;
}>) {
  const shown = PRODUCT_COLUMNS.filter((column) => columns.includes(column.key));
  const tableColumns: DataTableColumn[] = [
    {
      key: 'product',
      label: 'Product',
      kind: 'identity',
      sort: { active: sort === 'name', descending: false, onSort: () => onSort('name') },
    },
    ...shown.map((column): DataTableColumn => {
      const sortKey = SORTABLE[column.key];
      return {
        key: column.key,
        label: column.label,
        hint: column.hint,
        width: COLUMN_WIDTHS[column.key],
        kind: column.key === 'merchants' ? 'text' : 'number',
        ...(sortKey
          ? {
              sort: {
                active: sort === sortKey,
                descending: sortKey !== 'position',
                onSort: () => onSort(sortKey),
              },
            }
          : {}),
      };
    }),
    ...(trackable
      ? [
          {
            key: 'track',
            label: 'Tracking',
            width: 'name',
            kind: 'actions',
            hideLabel: true,
          } satisfies DataTableColumn,
        ]
      : []),
  ];
  const projectScope = useProjectScope();
  const rows = query.data?.items ?? [];
  const owned = selectable
    ? rows.filter((row) => row.kind === 'owned').map((row) => row.holder_id)
    : [];
  const checkedOnPage = owned.filter((id) => checked.has(id)).length;
  let all: boolean | 'indeterminate' = false;
  if (checkedOnPage && checkedOnPage === owned.length) all = true;
  else if (checkedOnPage) all = 'indeterminate';
  return (
    <DataTable
      label="Products"
      description={description}
      columns={tableColumns}
      rowCount={rows.length}
      pageSize={pageSize}
      rowLines={2}
      busy={{ active: query.isFetching && !query.isPending, label: 'Updating products' }}
      selection={{
        all,
        onAllChange: (next) => onCheck(owned, next),
        noun: 'products on this page',
      }}
      state={tableState({ query, empty, onRetry })}
      pager={pager}
    >
      {rows.map((row) => (
        // In a list that mixes holders, your own products carry the accent rung.
        <TableRow key={row.holder_id} highlight={trackable && row.kind === 'owned'}>
          <TableSelectCell
            label={`Select ${row.name}`}
            checked={checked.has(row.holder_id)}
            disabled={!owned.includes(row.holder_id)}
            onCheckedChange={(next) => onCheck([row.holder_id], next)}
          />
          <TableCell>
            <ProductName row={row} scope={scope} />
          </TableCell>
          {shown.map((column) => {
            const cell = productCell(row, column.key);
            return (
              <TableCell key={column.key}>
                <MetricValue cell={cell} />
              </TableCell>
            );
          })}
          {trackable ? (
            <TableActionsCell>
              {row.kind === 'ai_observed_competitor' ? (
                <AddToTracking
                  scope={{
                    workspaceId: projectScope.workspaceId,
                    projectId: projectScope.projectId,
                  }}
                  candidateId={row.holder_id}
                  name={row.name}
                />
              ) : null}
            </TableActionsCell>
          ) : null}
        </TableRow>
      ))}
    </DataTable>
  );
}

const EMPTY_COPY = {
  catalog: {
    heading: 'No products yet',
    description: 'Add products, or run a Website crawl to read them from your site.',
  },
  all: {
    heading: 'No products yet',
    description: 'Your catalog and the competitors seen in shopping answers list here.',
  },
  archived: {
    heading: 'No archived products',
    description: 'A product you archive from its page lists here until you restore it.',
  },
} as const satisfies Record<ProductFilters['source'], { heading: string; description: string }>;

function tableState({
  query,
  empty,
  onRetry,
}: Readonly<{
  query: UseQueryResult<CommerceProductPage>;
  empty: ProductsEmpty;
  onRetry: () => void;
}>) {
  if (query.isPending) return { kind: 'loading', label: 'Loading products' } as const;
  if (query.isError)
    return {
      kind: 'error',
      title: "Couldn't load products",
      error: query.error,
      fallback: 'Products could not be loaded.',
      onRetry,
      pending: query.isFetching,
    } as const;
  if (query.data.items.length) return undefined;
  if (empty.kind === 'filtered')
    return {
      kind: 'filtered',
      heading: 'No products match these filters',
      onClear: empty.onClear,
    } as const;
  return { kind: 'empty', icon: PackageOpen, ...EMPTY_COPY[empty.source] } as const;
}
