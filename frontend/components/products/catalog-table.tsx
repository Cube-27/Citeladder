'use client';

import Link from 'next/link';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination, useTablePage } from '@/components/ui/table-pagination';
import { Tooltip } from '@/components/ui/tooltip';
import type { IntegrationSyncRun } from '@/lib/api/integrations';
import type {
  CommerceCatalogHealth,
  CommerceConnectionSummary,
  Product,
  ProductCompleteness,
} from '@/lib/api/types';
import { formatUtcTimestamp } from '@/lib/format';
import { SYNC_RUN_BADGE, syncRunStatusLabel } from '@/lib/integrations/sync-runs';
import {
  feedHealthDisplay,
  feedHealthLabel,
  formatPrice,
  PRODUCT_ORIGIN_LABELS,
} from '@/lib/products/catalog';

/** Rows per page on the catalog table (client-side; the list arrives whole). */
const PAGE_SIZE = 10;

/**
 * Catalog table (Commerce workspace). Dense SKU table with columns product
 * (name + first variant), sku, price, variants count, completeness badge
 * (missing attributes in a tooltip), origin badge (Manual / CSV import /
 * Synced feed), per-SKU feed health joined from the catalog-health
 * projection by `product_id` (never by mutable display name), and the bound
 * connection's sync state, plus per-row edit/delete actions. The product
 * name links to the `/products/[productId]` evidence drill-down. Purely
 * presentational — CRUD and sync polling are owned by the catalog panel.
 */
export function CatalogTable({
  products,
  health = null,
  healthPending = false,
  syncOverrides = {},
  onEdit,
  onDelete,
  busyId,
}: Readonly<{
  products: Product[];
  /** The catalog-health projection (null while unavailable/failed). */
  health?: CommerceCatalogHealth | null;
  /** True while the health projection is still loading. */
  healthPending?: boolean;
  /** Freshest polled sync runs, keyed by connection id. */
  syncOverrides?: Readonly<Record<string, IntegrationSyncRun>>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  busyId?: string | null;
}>) {
  const { page, setPage, pageCount, from, to } = useTablePage(products.length, PAGE_SIZE);
  const pagedProducts = products.slice(from - 1, to);

  const healthByProductId = new Map(
    (health?.products ?? [])
      .filter((row) => row.product_id !== null)
      .map((row) => [row.product_id as string, row]),
  );
  const connectionById = new Map(
    (health?.connections ?? []).map((connection) => [connection.connection_id, connection]),
  );

  return (
    <div className="border-border-subtle bg-panel overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Variants</TableHead>
            <TableHead>Attributes</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Feed health</TableHead>
            <TableHead>Sync</TableHead>
            <TableHead className="w-16 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedProducts.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="max-w-[320px] min-w-[200px]">
                <div className="grid gap-0.5">
                  <Link
                    href={`/products/${product.id}`}
                    className="text-foreground hover:text-accent-text truncate font-medium transition-colors"
                  >
                    {product.name}
                  </Link>
                  {product.variants[0]?.name ? (
                    <span className="text-muted truncate text-xs">{product.variants[0].name}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-secondary font-mono text-xs">{product.sku}</TableCell>
              <TableCell numeric className="text-secondary">
                {formatPrice(product.price, product.currency)}
              </TableCell>
              <TableCell numeric className="text-secondary">
                {product.variants.length > 0 ? product.variants.length : '—'}
              </TableCell>
              <TableCell>
                <CompletenessBadge completeness={product.completeness} />
              </TableCell>
              <TableCell>
                <OriginBadge origin={product.origin} />
              </TableCell>
              <TableCell>
                <FeedHealthCell
                  product={product}
                  healthRow={healthByProductId.get(product.id)}
                  pending={healthPending}
                />
              </TableCell>
              <TableCell>
                <SyncCell
                  product={product}
                  connection={
                    product.connection_id ? connectionById.get(product.connection_id) : undefined
                  }
                  override={
                    product.connection_id ? syncOverrides[product.connection_id] : undefined
                  }
                  pending={healthPending}
                />
              </TableCell>
              <TableCell className="text-right">
                <Dropdown>
                  <DropdownTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${product.name}`}>
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent align="end">
                    <DropdownItem onSelect={() => onEdit(product)}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem
                      disabled={busyId === product.id}
                      onSelect={() => onDelete(product)}
                      className="text-danger-text data-[highlighted]:bg-danger-bg"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
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
        total={products.length}
        noun="products"
        onPageChange={setPage}
      />
    </div>
  );
}

/**
 * The data-quality badge: `12/12` (success when complete, neutral otherwise)
 * with the missing attribute list on hover — the badge is never color-only
 * (the `N missing` text carries the meaning).
 */
function CompletenessBadge({ completeness }: Readonly<{ completeness: ProductCompleteness }>) {
  const complete = completeness.missing.length === 0;
  const label = `${completeness.present}/${completeness.total}`;
  const badge = complete ? (
    <Badge variant="status" value="success">
      {label} · Complete
    </Badge>
  ) : (
    <Badge variant="status" value="warning">
      {label} · {completeness.missing.length} missing
    </Badge>
  );
  if (complete) return badge;
  return <Tooltip content={`Missing: ${completeness.missing.join(', ')}`}>{badge}</Tooltip>;
}

/** Origin badge: explicit text for manual / CSV-imported / feed-synced rows. */
function OriginBadge({ origin }: Readonly<{ origin: Product['origin'] }>) {
  if (origin === 'synced') {
    return (
      <Badge variant="status" value="info">
        {PRODUCT_ORIGIN_LABELS[origin]}
      </Badge>
    );
  }
  return <Badge variant="neutral">{PRODUCT_ORIGIN_LABELS[origin]}</Badge>;
}

/**
 * Feed-health cell (joined by `product_id`): a status badge whose text
 * carries the meaning (`Healthy` / `N warnings` / `N errors` / `Unavailable`)
 * with the non-secret rule ids in a tooltip; unbound and unprojected rows
 * get explicit muted text instead of implying a feed error.
 */
function FeedHealthCell({
  product,
  healthRow,
  pending,
}: Readonly<{
  product: Product;
  healthRow: CommerceCatalogHealth['products'][number] | undefined;
  pending: boolean;
}>) {
  if (pending) {
    return <span className="text-subtle text-xs">…</span>;
  }
  const display = feedHealthDisplay(product, healthRow);
  const label = feedHealthLabel(display);
  if (display.kind !== 'status') {
    return <span className="text-muted text-xs">{label}</span>;
  }
  const badge =
    display.status === 'healthy' ? (
      <Badge variant="status" value="success">
        {label}
      </Badge>
    ) : display.status === 'warning' ? (
      <Badge variant="status" value="warning">
        {label}
      </Badge>
    ) : display.status === 'error' ? (
      <Badge variant="status" value="danger">
        {label}
      </Badge>
    ) : (
      <Badge variant="neutral">{label}</Badge>
    );
  if (display.ruleIds.length === 0) return badge;
  return <Tooltip content={display.ruleIds.join(', ')}>{badge}</Tooltip>;
}

/**
 * Sync cell: the bound connection's current-or-latest sync as a run-status
 * badge plus the last-synced/completed timestamp; a failed run surfaces its
 * non-secret `error_code`. A live polled run (from the panel's 3s polling)
 * takes precedence over the persisted summary. Unbound products render `—`.
 */
function SyncCell({
  product,
  connection,
  override,
  pending,
}: Readonly<{
  product: Product;
  connection: CommerceConnectionSummary | undefined;
  override: IntegrationSyncRun | undefined;
  pending: boolean;
}>) {
  if (pending) {
    return <span className="text-subtle text-xs">…</span>;
  }
  if (!product.connection_id || !connection) {
    return <span className="text-subtle">—</span>;
  }
  const persisted = connection.latest_sync;
  // The polled run only overrides the summary it actually tracks.
  const live =
    override && persisted && override.id === persisted.sync_run_id
      ? {
          status: override.status,
          error_code: override.error_code,
          completed_at: override.completed_at,
        }
      : persisted
        ? {
            status: persisted.status,
            error_code: persisted.error_code,
            completed_at: persisted.completed_at,
          }
        : null;
  if (!live) {
    return <span className="text-muted text-xs">Never synced</span>;
  }
  const timestamp = live.completed_at ?? connection.last_synced_at;
  return (
    <div className="grid gap-0.5">
      <span className="flex items-center gap-2">
        <Badge variant="run-status" value={SYNC_RUN_BADGE[live.status]}>
          {syncRunStatusLabel(live.status)}
        </Badge>
        {live.status === 'failed' && live.error_code ? (
          <span className="text-danger-text text-2xs font-mono">{live.error_code}</span>
        ) : null}
      </span>
      {timestamp ? (
        <span className="text-muted text-2xs font-mono tabular-nums">
          {formatUtcTimestamp(timestamp)}
        </span>
      ) : null}
    </div>
  );
}
