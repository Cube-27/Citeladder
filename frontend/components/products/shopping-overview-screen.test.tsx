import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { fireEvent, screen, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';

import { mswServer } from '@/test/msw-server';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';
import { commerceQueries } from '@/lib/api/commerce';
import type {
  CommerceOverviewProduct,
  CommerceShoppingOverview,
} from '@citeladder/contracts/commerce-suite';

import { OverviewSections } from './shopping-overview-screen';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ROAD = '22222222-2222-4222-8222-222222222222';
const SOCK = '33333333-3333-4333-8333-333333333333';
const RIVAL = '44444444-4444-4444-8444-444444444444';
const CATEGORY = '55555555-5555-4555-8555-555555555555';
const projectRoute = { projectSelection: { activeProject: makeProject({ id: PROJECT_ID }) } };

const product = (overrides: Partial<CommerceOverviewProduct>): CommerceOverviewProduct => ({
  holder_id: ROAD,
  kind: 'owned',
  name: 'Acme Road Runner',
  brand: 'Acme',
  visibility: 2 / 3,
  appearances: 2,
  ordered_appearances: 2,
  win_rate: 0.5,
  position: 1.5,
  ...overrides,
});
const RIVAL_PACER = product({
  holder_id: RIVAL,
  kind: 'approved_competitor',
  name: 'Rival Pacer',
  brand: 'Rival',
});
const SOCK_ROW = product({
  holder_id: SOCK,
  name: 'Acme Merino Sock',
  visibility: 0,
  appearances: 0,
  ordered_appearances: 0,
  win_rate: null,
  position: null,
});

const OVERVIEW: CommerceShoppingOverview = {
  window_days: 30,
  category: null,
  executions: 3,
  slots: 5,
  brands: [
    {
      brand: 'Acme',
      owned: true,
      visibility: 2 / 3,
      appearances: 2,
      ordered_appearances: 2,
      win_rate: 0.5,
      position: 1.5,
      slots: 3,
      share_of_shelf: 0.6,
    },
  ],
  products: [product({}), RIVAL_PACER, SOCK_ROW],
  most_visible: [product({})],
  least_visible: [SOCK_ROW],
  merchants: [{ domain: 'runnerstore.com', answers: 2, products: 1 }],
  fanout: {
    answers: 2,
    answers_with_queries: 1,
    queries: [{ query: 'best road running shoes', answers: 2 }],
  },
  category_shelf: null,
};

function Harness() {
  const query = useQuery(
    commerceQueries.overview({ workspaceId: null, projectId: PROJECT_ID }, 'window=30'),
  );
  return <OverviewSections query={query} />;
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function serve(overview: CommerceShoppingOverview, status = 200) {
  mswServer.use(
    http.get(`/api/v1/projects/${PROJECT_ID}/commerce/overview`, () =>
      status === 200
        ? HttpResponse.json(overview)
        : HttpResponse.json({ error: { message: 'Overview is down' } }, { status }),
    ),
  );
}

const table = (name: string) => screen.getByRole('region', { name });
const rowCells = (region: HTMLElement, name: string) =>
  within(within(region).getByText(name).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('Shopping overview', () => {
  it('ranks brands with Share of Shelf, then products without it', async () => {
    serve(OVERVIEW);
    renderWithProviders(<Harness />, projectRoute);

    const ranking = await screen.findByRole('region', { name: 'Ranking' });
    expect(rowCells(ranking, 'Acme')).toEqual(['AcmeYour brand', '66.7%', '50.0%', '1.5', '60.0%']);

    fireEvent.click(within(ranking).getByRole('radio', { name: 'Products' }));
    expect(within(ranking).queryByText('Share of Shelf')).not.toBeInTheDocument();
    expect(rowCells(ranking, 'Rival Pacer')).toEqual([
      'Rival PacerRival · Competitor',
      '66.7%',
      '50.0%',
      '1.5',
    ]);
    // Never named: a real zero visibility, but no rank to measure.
    expect(rowCells(ranking, 'Acme Merino Sock')).toEqual([
      'Acme Merino SockAcme · Your product',
      '0.0%',
      'Unavailable',
      'Unavailable',
    ]);
    expect(within(ranking).getByRole('link', { name: 'Acme Road Runner' })).toHaveAttribute(
      'href',
      `/products/${ROAD}`,
    );
  });

  it('shows the extremes, merchants and fan-out queries', async () => {
    serve(OVERVIEW);
    renderWithProviders(<Harness />, projectRoute);

    await screen.findByRole('region', { name: 'Most visible' });
    expect(rowCells(table('Least visible'), 'Acme Merino Sock')).toEqual([
      'Acme Merino SockAcme · Your product',
      '0',
      '0.0%',
    ]);
    expect(rowCells(table('Top merchants'), 'runnerstore.com')).toEqual([
      'runnerstore.com',
      '2',
      '1',
    ]);
    const fanout = table('Top fan-out queries');
    expect(fanout).toHaveTextContent('From the 2 answers that named a product, 1 with searches.');
    expect(rowCells(fanout, 'best road running shoes')).toEqual(['best road running shoes', '2']);
    // No category chosen: no category shelf.
    expect(screen.queryByText('Category shelf')).not.toBeInTheDocument();
  });

  it('keeps unmeasured and empty states apart from zeros', async () => {
    serve({
      ...OVERVIEW,
      category: CATEGORY,
      executions: 0,
      slots: 0,
      brands: [],
      merchants: [],
      fanout: { answers: 0, answers_with_queries: 0, queries: [] },
      category_shelf: null,
    });
    renderWithProviders(<Harness />, projectRoute);

    expect(
      await screen.findByText('No Commerce run has measured this category yet.'),
    ).toBeInTheDocument();
    expect(table('Ranking')).toHaveTextContent('No brand yet.');
    expect(table('Top merchants')).toHaveTextContent('No answer named a merchant.');
    expect(table('Top fan-out queries')).toHaveTextContent('No answer named a product.');
  });

  it('reads the category shelf from its latest Commerce run', async () => {
    serve({
      ...OVERVIEW,
      category: CATEGORY,
      category_shelf: {
        product_visibility: 0.4,
        share_of_shelf: 0.25,
        average_shelf_position: 2,
        first_position_win_rate: null,
        successful_execution_count: 5,
        recognized_slot_count: 8,
        ranked_execution_count: 0,
        measured_at: '2026-11-01T00:00:00.000Z',
      },
    });
    renderWithProviders(<Harness />, projectRoute);

    const shelf = (await screen.findByText('Category shelf')).closest('section')!;
    expect(shelf).toHaveTextContent('from 5 answers and 8 recognized recommendations');
    expect(within(shelf).getByText('40.0%')).toBeInTheDocument();
    expect(within(shelf).getByText('25.0%')).toBeInTheDocument();
    expect(within(shelf).getByText('2.00')).toBeInTheDocument();
  });

  it('reports a failed read as an error, not an empty overview', async () => {
    serve(OVERVIEW, 404);
    renderWithProviders(<Harness />, projectRoute);

    expect(await screen.findByText('Overview is down')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ranking' })).not.toBeInTheDocument();
  });
});
