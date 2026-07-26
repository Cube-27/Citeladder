import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { CommerceCatalogHealth, Product } from '@/lib/api/types';

import { CatalogTable } from './catalog-table';

const CONNECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SYNC_RUN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeHealth(overrides: Partial<CommerceCatalogHealth> = {}): CommerceCatalogHealth {
  return {
    project_id: '11111111-1111-4111-8111-111111111111',
    connections: [
      {
        connection_id: CONNECTION,
        provider: 'shopify',
        label: 'Acme shop',
        account_ref: 'acme.myshopify.com',
        grant_status: 'connected',
        last_synced_at: '2026-07-24T06:00:00Z',
        latest_sync: {
          sync_run_id: SYNC_RUN,
          connection_id: CONNECTION,
          status: 'succeeded',
          window_start: '2026-07-24T05:00:00Z',
          window_end: '2026-07-24T06:00:00Z',
          row_count: 128,
          error_code: '',
          completed_at: '2026-07-24T06:00:00Z',
        },
      },
    ],
    products: [],
    generated_at: '2026-07-24T06:05:00Z',
    ...overrides,
  };
}

function makeProduct(n: number, overrides: Partial<Product> = {}): Product {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    project_id: '11111111-1111-4111-8111-111111111111',
    sku: `SKU-${n}`,
    name: `Product number ${n}`,
    aliases: [],
    variants: [{ name: 'Graphite / Standard', sku: `SKU-${n}-GR`, price: 2499.0 }],
    price: 2499.0,
    currency: 'USD',
    url: 'https://example.com/p',
    attributes: { brand: 'Acme' },
    origin: 'manual',
    connection_id: null,
    external_item_ref: null,
    last_seen_sync_run_id: null,
    completeness: { score: 1, present: 12, total: 12, missing: [] },
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  } as Product;
}

function renderTable(products: Product[]) {
  return render(
    <TooltipProvider>
      <CatalogTable products={products} onEdit={() => {}} onDelete={() => {}} />
    </TooltipProvider>,
  );
}

describe('CatalogTable completeness badge', () => {
  it('renders the complete badge as present/total · Complete', () => {
    renderTable([makeProduct(1)]);
    expect(screen.getByText('12/12 · Complete')).toBeInTheDocument();
  });

  it('renders the missing count on the badge when attributes are missing', () => {
    renderTable([
      makeProduct(1, {
        completeness: { score: 0.75, present: 9, total: 12, missing: ['gtin', 'mpn', 'condition'] },
      }),
    ]);

    // The badge carries the count (never color-only); the missing list is in
    // its tooltip (radix tooltips don't open under jsdom hover).
    expect(screen.getByText('9/12 · 3 missing')).toBeInTheDocument();
  });
});

describe('CatalogTable rows', () => {
  it('links the product name to the evidence drill-down and shows the variant', () => {
    const product = makeProduct(1);
    renderTable([product]);

    const link = screen.getByRole('link', { name: 'Product number 1' });
    expect(link).toHaveAttribute('href', `/products/${product.id}`);
    expect(screen.getByText('Graphite / Standard')).toBeInTheDocument();
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByText('$2,499.00')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('renders placeholders for missing price and variants', () => {
    renderTable([makeProduct(1, { price: null, variants: [] })]);
    const row = screen.getByRole('row', { name: /Product number 1/ });
    // Price, variants, and the sync cell (no feed binding) all read —.
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });

  it('fires edit and delete callbacks from the row actions', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const product = makeProduct(1);
    render(
      <TooltipProvider>
        <CatalogTable products={[product]} onEdit={onEdit} onDelete={onDelete} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Product number 1' }));
    await user.click(screen.getByRole('menuitem', { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalledWith(product);

    await user.click(screen.getByRole('button', { name: 'Actions for Product number 1' }));
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalledWith(product);
  });
});

describe('CatalogTable origin / feed health / sync columns', () => {
  it('labels a synced feed row and joins its feed-health row by product_id', () => {
    const product = makeProduct(1, { origin: 'synced', connection_id: CONNECTION });
    const health = makeHealth({
      products: [
        {
          product_id: product.id,
          connection_id: CONNECTION,
          external_item_ref: 'gid://shopify/Product/1',
          sync_run_id: SYNC_RUN,
          status: 'warning',
          highest_severity: 'warning',
          issue_count: 2,
          rule_ids: ['price_missing'],
          last_seen_in_feed: true,
        },
      ],
    });
    render(
      <TooltipProvider>
        <CatalogTable products={[product]} health={health} onEdit={() => {}} onDelete={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Synced feed')).toBeInTheDocument();
    // The badge text carries the meaning (never color-only).
    expect(screen.getByText('2 warnings')).toBeInTheDocument();
    // The bound connection's latest sync renders as a run-status badge.
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
  });

  it('marks an unbound product Not feed-bound with a — sync cell', () => {
    renderTable([makeProduct(1)]);
    expect(screen.getByText('Not feed-bound')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Product number 1/ });
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('reads Feed health unavailable for a bound product with no projected row', () => {
    render(
      <TooltipProvider>
        <CatalogTable
          products={[makeProduct(1, { origin: 'synced', connection_id: CONNECTION })]}
          health={makeHealth()}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText('Feed health unavailable')).toBeInTheDocument();
  });

  it('shows the failed sync error code in danger mono', () => {
    const health = makeHealth();
    health.connections[0]!.latest_sync = {
      sync_run_id: SYNC_RUN,
      connection_id: CONNECTION,
      status: 'failed',
      window_start: '2026-07-24T05:00:00Z',
      window_end: '2026-07-24T06:00:00Z',
      row_count: 0,
      error_code: 'FEED_FETCH_FAILED',
      completed_at: '2026-07-24T06:00:00Z',
    };
    render(
      <TooltipProvider>
        <CatalogTable
          products={[makeProduct(1, { origin: 'synced', connection_id: CONNECTION })]}
          health={health}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('FEED_FETCH_FAILED')).toBeInTheDocument();
  });

  it('prefers a polled override only when it tracks the persisted run', () => {
    const product = makeProduct(1, { origin: 'synced', connection_id: CONNECTION });
    const override = {
      id: SYNC_RUN,
      connection_id: CONNECTION,
      sync_kind: 'on_demand',
      status: 'running',
      window_start: '2026-07-24T05:00:00Z',
      window_end: '2026-07-24T06:00:00Z',
      row_count: 0,
      error_code: '',
      enqueued_at: '2026-07-24T05:00:00Z',
      leased_at: null,
      completed_at: null,
    } as never;
    render(
      <TooltipProvider>
        <CatalogTable
          products={[product]}
          health={makeHealth()}
          syncOverrides={{ [CONNECTION]: override }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </TooltipProvider>,
    );
    // The live polled run replaces the persisted "Succeeded" badge.
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.queryByText('Succeeded')).not.toBeInTheDocument();
  });

  it('reads Never synced when the connection has no sync rows yet', () => {
    const health = makeHealth();
    health.connections[0]!.latest_sync = null;
    health.connections[0]!.last_synced_at = null;
    render(
      <TooltipProvider>
        <CatalogTable
          products={[makeProduct(1, { origin: 'synced', connection_id: CONNECTION })]}
          health={health}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText('Never synced')).toBeInTheDocument();
  });
});
