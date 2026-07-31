/**
 * Product delete-confirm dialog (D4): the delete is always allowed, but when
 * the product is frozen into one or more audit configurations the dialog says
 * so — past runs keep their frozen copy, so the warning only explains that
 * deleting stops FUTURE runs from measuring the product. A failed reference
 * check fails open (no warning, delete still available).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Product } from '@/lib/api/types';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { ProductDeleteDialog } from './product-delete-dialog';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REFERENCES_URL = `/api/v1/products/${PRODUCT_ID}/audit-references`;

const product = {
  id: PRODUCT_ID,
  project_id: '22222222-2222-4222-8222-222222222222',
  sku: 'AC-VB500',
  name: 'Acme VoltBike 500',
  aliases: [],
  variants: [],
  price: 2499.0,
  currency: 'USD',
  url: 'https://acme.com/p/voltbike',
  attributes: { brand: 'Acme' },
  origin: 'manual',
  connection_id: null,
  external_item_ref: null,
  last_seen_sync_run_id: null,
  completeness: { score: 1, present: 12, total: 12, missing: [] },
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
} as unknown as Product;

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function renderDialog(props: Record<string, unknown> = {}) {
  return renderWithProviders(
    <ProductDeleteDialog
      product={product}
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      {...props}
    />,
  );
}

describe('ProductDeleteDialog audit-reference guard (D4)', () => {
  it('warns with the audit count when the product is frozen into audits', async () => {
    mswServer.use(
      http.get(REFERENCES_URL, () =>
        HttpResponse.json({ product_id: PRODUCT_ID, referenced: true, audit_count: 2 }),
      ),
    );
    renderDialog();

    expect(screen.getByText('Delete Acme VoltBike 500?')).toBeInTheDocument();
    expect(
      await screen.findByText(/This product is frozen into 2 audit configurations/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/deleting only stops future runs from measuring it/),
    ).toBeInTheDocument();
    // The product identity is still named next to the warning.
    expect(screen.getByText('AC-VB500')).toBeInTheDocument();
  });

  it('shows no warning (and confirms) when nothing references the product', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    let checked = false;
    mswServer.use(
      http.get(REFERENCES_URL, () => {
        checked = true;
        return HttpResponse.json({ product_id: PRODUCT_ID, referenced: false, audit_count: 0 });
      }),
    );
    renderDialog({ onConfirm });

    // Wait for the (negative) check to resolve before asserting absence.
    await waitFor(() => expect(checked).toBe(true));
    expect(screen.queryByText(/frozen into/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without confirming', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    mswServer.use(
      http.get(REFERENCES_URL, () =>
        HttpResponse.json({ product_id: PRODUCT_ID, referenced: false, audit_count: 0 }),
      ),
    );
    renderDialog({ onOpenChange, onConfirm });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fails open when the reference check errors — no warning, delete stays armed', async () => {
    // A 404 never retries (unlike 5xx), keeping the failure path instant; the
    // component treats every check error identically: no warning, delete works.
    mswServer.use(http.get(REFERENCES_URL, () => new HttpResponse(null, { status: 404 })));
    renderDialog();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
    await screen.findByText('AC-VB500');
    expect(screen.queryByText(/frozen into/)).not.toBeInTheDocument();
  });

  it('fails open after a 5xx exhausts its retries — delete stays armed', async () => {
    // The 404 case above short-circuits the retry policy. A 5xx is the path
    // that actually RETRIES, so it is the one that proves the button is
    // re-enabled once the query settles rather than staying stuck on the
    // pending gate that blocks it while the check is in flight.
    let attempts = 0;
    mswServer.use(
      http.get(REFERENCES_URL, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    renderDialog();

    // While retries are outstanding the destructive action stays blocked.
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled(), {
      timeout: 10_000,
    });
    expect(attempts).toBeGreaterThan(1); // the retry path really ran
    await screen.findByText('AC-VB500');
    expect(screen.queryByText(/frozen into/)).not.toBeInTheDocument();
  }, 15_000);
});
