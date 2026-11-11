import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

import { AddProductsDialog } from './add-products-dialog';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const IMPORT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const base = `/api/v1/projects/${PROJECT_ID}/commerce`;
const projectRoute = { projectSelection: { activeProject: makeProject({ id: PROJECT_ID }) } };

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const STAGE = {
  import_id: IMPORT_ID,
  source_format: 'csv',
  source_label: 'catalog.csv',
  products: 2,
  rejected: 1,
  categories: [
    {
      key: 'footwear',
      name: 'Footwear',
      parent_key: null,
      depth: 0,
      product_count: 2,
      existing: true,
    },
    {
      key: 'running',
      name: 'Running',
      parent_key: 'footwear',
      depth: 1,
      product_count: 2,
      existing: false,
    },
    { key: 'sale', name: 'Sale', parent_key: null, depth: 0, product_count: 1, existing: false },
  ],
  result: null,
};
const RESULT = {
  import_id: IMPORT_ID,
  created: 1,
  updated: 1,
  unchanged: 0,
  rejected: 1,
  row_outcomes: [
    {
      row_number: 4,
      status: 'rejected',
      product_id: null,
      error_code: 'invalid_row',
      detail: 'title is required',
    },
    { row_number: 2, status: 'created', product_id: PRODUCT_ID, error_code: '', detail: '' },
    { row_number: 3, status: 'updated', product_id: PRODUCT_ID, error_code: '', detail: '' },
  ],
};

function open() {
  renderWithProviders(
    <AddProductsDialog workspaceId="ws" projectId={PROJECT_ID} open onOpenChange={() => {}} />,
    projectRoute,
  );
}

describe('AddProductsDialog', () => {
  it('stages a CSV, applies the confirmed category tree, and lists rejected rows first with reasons', async () => {
    const staged: unknown[] = [];
    const applied: unknown[] = [];
    mswServer.use(
      http.post(`${base}/catalog/imports`, async ({ request }) => {
        staged.push(await request.json());
        return HttpResponse.json(STAGE, { status: 201 });
      }),
      http.post(`${base}/catalog/imports/${IMPORT_ID}/apply`, async ({ request }) => {
        applied.push(await request.json());
        return HttpResponse.json(RESULT);
      }),
    );
    open();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'CSV' }));
    const file = new File(['title,brand\nShoe,Acme\n'], 'catalog.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Review categories' }));

    const tree = await screen.findByRole('list', { name: 'Proposed categories' });
    expect(staged).toEqual([
      { source: 'csv', content: 'title,brand\nShoe,Acme\n', filename: 'catalog.csv' },
    ]);
    expect(
      screen.getByText('2 products ready from catalog.csv; 1 row cannot be imported.'),
    ).toBeVisible();
    // Clearing a category leaves out the categories under it too.
    fireEvent.click(within(tree).getByRole('checkbox', { name: 'Footwear (2 products)' }));
    expect(within(tree).getByRole('checkbox', { name: 'Running (2 products)' })).not.toBeChecked();
    expect(within(tree).getByRole('checkbox', { name: 'Sale (1 product)' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 products' }));

    const rows = await screen.findByRole('list', { name: 'Rows' });
    // Everything shown cleared is left out, not only the box the person cleared.
    expect(applied).toEqual([{ excluded_categories: ['footwear', 'running'] }]);
    expect(screen.getByLabelText('Import results')).toHaveTextContent(
      '1 added, 1 updated, 0 unchanged, 1 rejected',
    );
    expect(
      within(rows)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Row 4Rejectedtitle is required', 'Row 2Added', 'Row 3Updated']);
  });

  it('reads a Shopify store by its domain and shows why a store cannot be imported', async () => {
    const staged: unknown[] = [];
    mswServer.use(
      http.post(`${base}/catalog/imports`, async ({ request }) => {
        staged.push(await request.json());
        return HttpResponse.json(
          {
            error: {
              code: 'commerce_store_not_allowed',
              message: "Only the project's own domains or a .myshopify.com store can be imported",
            },
          },
          { status: 422 },
        );
      }),
    );
    open();
    expect(screen.getByRole('button', { name: 'Review categories' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Store domain'), {
      target: { value: ' rival.example ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review categories' }));

    await waitFor(() => expect(staged).toEqual([{ source: 'shopify', store: 'rival.example' }]));
    expect(await screen.findByText(/myshopify\.com store can be imported/)).toBeVisible();
  });

  it('shows the earlier results when the same content was imported before', async () => {
    mswServer.use(
      http.post(`${base}/catalog/imports`, () =>
        HttpResponse.json({ ...STAGE, result: RESULT }, { status: 201 }),
      ),
    );
    open();
    fireEvent.change(screen.getByLabelText('Store domain'), {
      target: { value: 'acme.myshopify.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review categories' }));

    expect(
      await screen.findByText('This content was imported before; these are its results.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Import results')).toHaveTextContent('1 added, 1 updated');
  });
});
