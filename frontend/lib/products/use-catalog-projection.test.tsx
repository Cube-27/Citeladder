import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { commerceApi } from '@/lib/api/commerce';
import { queryKeys } from '@/lib/api/query-keys';
import { ProjectSelectionProvider } from '@/lib/project/project-scope';
import { mswServer } from '@/test/msw-server';
import { testProjectSelection } from '@/test/render';

import { useCatalogProjection } from './use-catalog-projection';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const product = (id: string, name: string) => ({
  id,
  canonical_url: `https://shop.example/${name}`,
  name,
  brand: '',
  category_ids: [],
});
const WIDGET = product('22222222-2222-4222-8222-222222222222', 'Widget');
const GADGET = product('33333333-3333-4333-8333-333333333333', 'Gadget');

function wrapper(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ProjectSelectionProvider value={testProjectSelection()}>
          {children}
        </ProjectSelectionProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

/** The catalog read the screen makes, and the projection beside it. */
function useScreen() {
  const catalog = useQuery({
    queryKey: queryKeys.commerce.catalog(PROJECT),
    queryFn: ({ signal }) => commerceApi.catalog(PROJECT, { signal, workspaceId: WORKSPACE }),
  });
  return { catalog, projection: useCatalogProjection(PROJECT, catalog) };
}

/** Serves the catalog reads in order (the last repeats) and the projection polls likewise. */
function serve(
  catalogs: { products: (typeof WIDGET)[]; in_flight: number }[],
  projections: number[],
) {
  const reads = { catalog: 0, projection: 0 };
  mswServer.use(
    http.get(`/api/v1/projects/${PROJECT}/commerce/catalog`, () => {
      const { products, in_flight } = catalogs[Math.min(reads.catalog, catalogs.length - 1)]!;
      reads.catalog += 1;
      return HttpResponse.json({
        products,
        product_total: products.length,
        categories: [],
        projection: { applies: true, in_flight, failed: 0 },
      });
    }),
    http.get(`/api/v1/projects/${PROJECT}/commerce/catalog/projection`, () => {
      const in_flight = projections[Math.min(reads.projection, projections.length - 1)]!;
      reads.projection += 1;
      return HttpResponse.json({ applies: true, in_flight, failed: 0 });
    }),
  );
  return reads;
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('useCatalogProjection', () => {
  it('polls the projection alone while it runs and shows its newer count', async () => {
    const reads = serve([{ products: [WIDGET], in_flight: 3 }], [1]);
    const { result } = renderHook(useScreen, { wrapper: wrapper(client()) });

    await waitFor(() => expect(result.current.projection?.in_flight).toBe(1));
    expect(reads.catalog).toBe(1);
    expect(result.current.catalog.data?.products.map((row) => row.name)).toEqual(['Widget']);
  });

  it('reads the catalog once more when the projection terminalizes, then stops polling', async () => {
    const reads = serve(
      [
        { products: [WIDGET], in_flight: 2 },
        { products: [GADGET, WIDGET], in_flight: 0 },
      ],
      [0],
    );
    const { result } = renderHook(useScreen, { wrapper: wrapper(client()) });

    await waitFor(() =>
      expect(result.current.catalog.data?.products.map((row) => row.name)).toEqual([
        'Gadget',
        'Widget',
      ]),
    );
    expect(result.current.projection).toEqual({ applies: true, in_flight: 0, failed: 0 });
    expect(reads).toEqual({ catalog: 2, projection: 1 });
  });

  it('never polls the projection for a catalog read with nothing in flight', async () => {
    const reads = serve([{ products: [WIDGET], in_flight: 0 }], [0]);
    const { result } = renderHook(useScreen, { wrapper: wrapper(client()) });

    await waitFor(() => expect(result.current.projection?.in_flight).toBe(0));
    expect(reads).toEqual({ catalog: 1, projection: 0 });
  });
});
