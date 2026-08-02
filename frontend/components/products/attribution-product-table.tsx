'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { aiSourceLabel } from '@/lib/analytics/series';
import type { AttributionProductRow } from '@/lib/api/types';
import {
  formatMoney,
  productRowKey,
  type AttributionCurrencyBlock,
} from '@/lib/products/attribution';

const PAGE_SIZE = 10;

/** One paired SKU × source row (A1 side and/or A2 side — never summed). */
type PairedProductRow = {
  key: string;
  identity: AttributionProductRow;
  a1: AttributionProductRow | undefined;
  a2: AttributionProductRow | undefined;
};

function pairProductRows(block: AttributionCurrencyBlock): PairedProductRow[] {
  const pairs = new Map<string, PairedProductRow>();
  const note = (side: 'a1' | 'a2', row: AttributionProductRow) => {
    const key = productRowKey(row);
    const existing = pairs.get(key);
    if (existing) {
      existing[side] = row;
    } else {
      pairs.set(key, { key, identity: row, a1: undefined, a2: undefined, [side]: row });
    }
  };
  for (const row of block.a1?.by_product ?? []) note('a1', row);
  for (const row of block.a2?.by_product ?? []) note('a2', row);
  return [...pairs.values()];
}

/**
 * Attribution › By product: GA4 item revenue joined to catalog SKUs beside
 * Shopify line-item revenue for one ISO currency block, paginated client
 * side. Unresolved rows (`product_id = null`) stay plain SKU/name rows —
 * they are never dropped and never linked. When A1 persisted the reduced
 * GA4 fallback, the source column reads `Item grouping` and carries the
 * persisted channel label verbatim (never relabelled as per-AI-source data).
 */
export function AttributionProductTable({ block }: Readonly<{ block: AttributionCurrencyBlock }>) {
  const rows = pairProductRows(block);
  const { page, setPage, pageCount, from, to } = useTablePage(rows.length, PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reduced = block.a1?.reduced_granularity === true;

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Revenue by SKU</CardTitle>
          <CardDescription>
            GA4 item revenue joined to catalog SKUs beside Shopify line-item revenue.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-secondary p-[var(--card-padding)] text-sm">
            No per-SKU attribution rows in this window.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>{reduced ? 'Item grouping' : 'AI source'}</TableHead>
                  <TableHead>A1 revenue</TableHead>
                  <TableHead>A1 orders</TableHead>
                  <TableHead>A2 revenue</TableHead>
                  <TableHead>A2 orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="max-w-70 min-w-50">
                      {row.identity.product_id !== null ? (
                        <div className="grid gap-0.5">
                          <span className="text-foreground truncate font-medium">
                            {row.identity.name}
                          </span>
                          <span className="text-muted truncate text-xs">{row.identity.sku}</span>
                        </div>
                      ) : (
                        <div className="grid gap-0.5">
                          <span className="text-foreground truncate font-medium">
                            Unresolved catalog item
                          </span>
                          <span className="text-muted truncate text-xs">{row.identity.sku}</span>
                          <span className="text-subtle truncate text-xs">
                            Not matched to a catalog product
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-secondary">
                      {row.identity.ai_source !== null
                        ? aiSourceLabel(row.identity.ai_source)
                        : row.identity.source_label}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(row.a1?.revenue, block.currency)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {row.a1?.orders ?? '—'}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(row.a2?.revenue, block.currency)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {row.a2?.orders ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageCount={pageCount}
              from={from}
              to={to}
              total={rows.length}
              noun="products"
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
