'use client';

import { PackageOpen } from 'lucide-react';

import { DataTable, type DataTableColumn, type DataTablePager } from '@/components/ui/data-table';
import {
  TableCell,
  TableCellLines,
  TableRow,
  TableSelectCell,
  mutedWhenMissing,
} from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { MissingValue, UnavailableValue } from '@/components/ui/unavailable-value';
import type {
  CommerceProductPage,
  CommerceProductRow,
  CommerceProductSort,
} from '@citeladder/contracts/commerce-suite';
import {
  holderLabel,
  PRODUCT_COLUMNS,
  productCell,
  type ProductCell,
  type ProductColumnKey,
} from '@/lib/products/product-columns';
import { productHref, type ProductScopeFilters } from '@/lib/products/product-filters';
import { PRODUCT_PAGE_SIZE } from '@/lib/config/commerce';
import type { UseQueryResult } from '@tanstack/react-query';

/** The metric columns a reader can sort by; each sorts best first. */
const SORTABLE: Partial<Record<ProductColumnKey, CommerceProductSort>> = {
  visibility: 'visibility',
  win_rate: 'win_rate',
  position: 'position',
};

function MissingCell({ state }: Readonly<{ state: 'unavailable' | 'unknown' | 'none' }>) {
  if (state === 'none') return <span className="text-ink-muted">None</span>;
  // Unavailable (nothing in scope to measure) and unknown (the catalog has no
  // price) are words, never a zero.
  return state === 'unknown' ? (
    <UnavailableValue state="unknown" />
  ) : (
    <MissingValue state="unavailable" />
  );
}

/** A metric's text, or the word for its missing state, with its note beneath. */
export function MetricValue({ cell }: Readonly<{ cell: ProductCell }>) {
  const value = cell.kind === 'value' ? cell.text : <MissingCell state={cell.state} />;
  if (!cell.note) return value;
  return (
    <span title={cell.note}>
      {value}
      <span className="type-caption block">{cell.note}</span>
    </span>
  );
}

/** The product cell: its page (in the table's window), its brand and who holds it. */
function ProductName({
  row,
  scope,
}: Readonly<{ row: CommerceProductRow; scope: ProductScopeFilters }>) {
  const caption = [row.brand, holderLabel(row.kind)].filter(Boolean).join(' · ');
  const name = (
    <TextLink href={productHref(row.holder_id, scope)} text="inherit">
      {row.name}
    </TextLink>
  );
  return <TableCellLines title primary={name} secondary={caption} />;
}

/**
 * The Products table: one row per holder with the shown metric columns. A
 * catalog product can be checked for bulk competitor discovery; competitor
 * rows cannot (discovery targets the catalog).
 */
export function ProductsTable({
  query,
  columns,
  sort,
  onSort,
  checked,
  onCheck,
  pager,
  scope,
}: Readonly<{
  query: UseQueryResult<CommerceProductPage>;
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
      sort: { active: sort === 'name', descending: false, onSort: () => onSort('name') },
    },
    ...shown.map((column): DataTableColumn => {
      const sortKey = SORTABLE[column.key];
      return {
        key: column.key,
        label: column.label,
        hint: column.hint,
        width: column.key === 'merchants' ? 'name' : 'figure',
        numeric: column.key !== 'merchants',
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
  ];
  const rows = query.data?.items ?? [];
  const owned = rows.filter((row) => row.kind === 'owned').map((row) => row.holder_id);
  const checkedOnPage = owned.filter((id) => checked.has(id)).length;
  let all: boolean | 'indeterminate' = false;
  if (checkedOnPage && checkedOnPage === owned.length) all = true;
  else if (checkedOnPage) all = 'indeterminate';
  return (
    <DataTable
      label="Products"
      columns={tableColumns}
      rowCount={rows.length}
      pageSize={PRODUCT_PAGE_SIZE}
      rowLines={2}
      minWidth="xl"
      pinFirstColumn
      busy={{ active: query.isFetching && !query.isPending, label: 'Updating products' }}
      selection={{
        all,
        onAllChange: (next) => onCheck(owned, next),
        noun: 'products on this page',
      }}
      state={tableState(query)}
      pager={pager}
    >
      {rows.map((row) => (
        <TableRow key={row.holder_id}>
          <TableSelectCell
            label={`Select ${row.name}`}
            checked={checked.has(row.holder_id)}
            disabled={row.kind !== 'owned'}
            onCheckedChange={(next) => onCheck([row.holder_id], next)}
          />
          <TableCell>
            <ProductName row={row} scope={scope} />
          </TableCell>
          {shown.map((column) => {
            const cell = productCell(row, column.key);
            return (
              <TableCell
                key={column.key}
                numeric={column.key !== 'merchants'}
                className={mutedWhenMissing(cell.kind === 'value' ? 0 : null)}
              >
                <MetricValue cell={cell} />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </DataTable>
  );
}

function tableState(query: UseQueryResult<CommerceProductPage>) {
  if (query.isPending) return { kind: 'loading', label: 'Loading products' } as const;
  if (query.isError)
    return {
      kind: 'error',
      error: query.error,
      fallback: 'Products could not be loaded.',
      onRetry: () => void query.refetch(),
      pending: query.isFetching,
    } as const;
  if (query.data.items.length) return undefined;
  return {
    kind: 'empty',
    icon: PackageOpen,
    heading: 'No products match',
    description:
      'Import a catalog, run a Site Health crawl, or clear the search and category to see more.',
  } as const;
}
