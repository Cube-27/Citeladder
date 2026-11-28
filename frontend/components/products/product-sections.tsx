import { BrandMark } from '@/components/ui/brand-mark';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { LineMark } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import type { CommerceProductDetail } from '@citeladder/contracts/commerce-suite';
import { formatCount } from '@/lib/format';
import { holderCaption } from '@/lib/products/product-columns';

import { meanValue } from './product-values';
import { productHref, type ProductScopeFilters } from '@/lib/products/product-filters';

const emptyWhen = (rows: readonly unknown[], message: string) =>
  rows.length ? undefined : ({ kind: 'empty', inline: true, message } as const);

const runs = { key: 'runs', label: 'Prompt runs', kind: 'number' } as const;

const COMPETING_COLUMNS: readonly DataTableColumn[] = [
  { key: 'product', label: 'Product', kind: 'identity' },
  { key: 'shared', label: 'Named together', kind: 'number' },
  { key: 'ahead', label: 'Ranked above it', kind: 'number', priority: 'low' },
  { key: 'position', label: 'Position', kind: 'number' },
];

export function CompetingProducts({
  detail,
  scope,
}: Readonly<{ detail: CommerceProductDetail; scope: ProductScopeFilters }>) {
  const rows = detail.competing;
  return (
    <DataTable
      title="Competing products"
      columns={COMPETING_COLUMNS}
      state={emptyWhen(rows, 'No other product was named beside it.')}
    >
      {rows.map((row) => (
        <TableRow key={row.holder_id}>
          <TableCell>
            <Inline as="span" align="start">
              <LineMark>
                <BrandMark name={row.brand || row.name} placement="inline" />
              </LineMark>
              <TableCellLines
                primary={
                  <TextLink
                    href={productHref(row.holder_id, scope)}
                    text="inherit"
                    underline="hover"
                  >
                    {row.name}
                  </TextLink>
                }
                secondary={holderCaption(row)}
              />
            </Inline>
          </TableCell>
          <TableCell numeric>{formatCount(row.shared)}</TableCell>
          <TableCell numeric>{formatCount(row.ahead)}</TableCell>
          <TableCell numeric>{meanValue(row.position)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const MERCHANT_COLUMNS: readonly DataTableColumn[] = [{ key: 'merchant', label: 'Merchant' }, runs];

export function Merchants({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <DataTable
      title="Merchants"
      columns={MERCHANT_COLUMNS}
      state={emptyWhen(detail.merchants, 'No prompt run named a merchant for it.')}
    >
      {detail.merchants.map((row) => (
        <TableRow key={row.domain}>
          <TableCell>
            <TableCellLines primary={row.domain} />
          </TableCell>
          <TableCell numeric>{formatCount(row.count)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const SEEN_IN_COLUMNS: readonly DataTableColumn[] = [
  { key: 'name', label: 'Shopping prompt' },
  { key: 'kind', label: 'Kind', width: 'category', priority: 'low' },
  runs,
];

export function SeenIn({
  detail,
  scope,
}: Readonly<{ detail: CommerceProductDetail; scope: ProductScopeFilters }>) {
  return (
    <DataTable
      title="Seen in"
      columns={SEEN_IN_COLUMNS}
      state={emptyWhen(detail.seen_in, 'No shopping prompt named it.')}
    >
      {detail.seen_in.map((row) => (
        <TableRow key={row.target_id}>
          <TableCell>
            <TableCellLines
              primary={
                <TextLink href={productHref(row.target_id, scope)} text="inherit" underline="hover">
                  {row.name}
                </TextLink>
              }
            />
          </TableCell>
          <TableCell>{row.target_kind === 'category' ? 'Category' : 'Product'}</TableCell>
          <TableCell numeric>{formatCount(row.answers)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const SOURCE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'page', label: 'Page', kind: 'url' },
  runs,
];

export function Sources({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <DataTable
      title="Sources"
      columns={SOURCE_COLUMNS}
      state={emptyWhen(detail.sources, 'The prompt runs that named it cited no pages.')}
    >
      {detail.sources.map((row) => (
        <TableRow key={row.url}>
          <TableCell>
            <TableCellLines
              primary={
                <TextLink variant="external" href={row.url} text="inherit">
                  {row.title || row.url}
                </TextLink>
              }
              secondary={row.domain}
            />
          </TableCell>
          <TableCell numeric>{formatCount(row.count)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const QUERY_COLUMNS: readonly DataTableColumn[] = [{ key: 'query', label: 'Query' }, runs];

export function FanOutQueries({ detail }: Readonly<{ detail: CommerceProductDetail }>) {
  return (
    <DataTable
      title="Query fan-outs"
      columns={QUERY_COLUMNS}
      state={emptyWhen(
        detail.fan_out_queries,
        'No query fan-outs were captured for the prompt runs that named it.',
      )}
    >
      {detail.fan_out_queries.map((row) => (
        <TableRow key={row.query}>
          <TableCell>
            <TableCellLines primary={row.query} />
          </TableCell>
          <TableCell numeric>{formatCount(row.count)}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
