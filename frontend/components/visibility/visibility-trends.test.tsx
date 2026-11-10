import { screen, within } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';
import type { SurfaceRates, Visibility, VisibilityTrendPoint } from '@citeladder/contracts';
import { renderWithProviders as render } from '@/test/render';

import { VisibilityTrends } from './visibility-trends';

const failed = (error: Error) =>
  ({
    data: undefined,
    error,
    isError: true,
    isFetching: false,
    refetch: vi.fn(),
  }) as unknown as UseQueryResult<Visibility | null>;

const ranking = (name: string, mention: number | null, isBrand = false) => ({
  name,
  is_brand: isBrand,
  logo_url: null,
  website_url: null,
  mention_rate: mention,
  citation_rate: 0.1,
  share_of_voice: 0.2,
  mention_count: 3,
  avg_position: isBrand ? 2 : null,
});

const rankings = [
  ranking('Acme', 0.31, true),
  ranking('Kmart Australia', 0.6),
  ranking('Target Australia', null),
];

const selected = {
  audit_id: '00000000-0000-4000-8000-000000000001',
  visibility_rate: 0.31,
  owned_citation_rate: 0.13,
  avg_position: 2,
  rankings,
  per_engine: [],
  model_provenance: [],
} as unknown as Visibility;

function point(completedAt: string, brandRate: number): VisibilityTrendPoint {
  return {
    audit_id: null,
    completed_at: completedAt,
    brand_mention_rate: brandRate,
    owned_citation_rate: 0.13,
    sov: { mention: 0.2 },
    rankings,
    analyzer_versions: ['1'],
    scoring_rule_versions: ['1'],
    spans_version_boundary: false,
    comparison_key: 'k',
  } as unknown as VisibilityTrendPoint;
}

const loaded = (points: VisibilityTrendPoint[]) =>
  ({ data: points, isError: false, isPending: false }) as unknown as UseQueryResult<
    VisibilityTrendPoint[]
  >;

function renderTrends(visibilityQuery: UseQueryResult<Visibility | null>, query = loaded([])) {
  render(
    <VisibilityTrends
      query={query}
      visibilityQuery={visibilityQuery}
      engineFilter="all"
      surfaceRatesQuery={{ data: undefined } as unknown as UseQueryResult<SurfaceRates>}
      surfaceEngine={null}
      hasRuns
      isFiltered={false}
    />,
  );
}

describe('Visibility trends', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('says nothing is measured for a selection with no measured run', () => {
    renderTrends({ data: null, isError: false } as UseQueryResult<Visibility | null>);
    expect(screen.getByText('No measured run for this selection yet.')).toBeVisible();
    expect(screen.queryByText(/still being prepared/u)).toBeNull();
  });

  it('says results are still being prepared while the run is written', () => {
    renderTrends(
      failed(
        new ApiError('Metrics not available for audit', 404, '', undefined, {
          code: 'visibility_metrics_pending',
        }),
      ),
    );
    expect(
      screen.getByText(
        'Results for this run are still being prepared. They appear here as soon as they are ready.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('shows a run that does not exist as a failed read, with a retry', () => {
    renderTrends(
      failed(new ApiError('Audit not found', 404, '', undefined, { code: 'not_found' })),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
    expect(screen.queryByText('No measured run for this selection yet.')).toBeNull();
  });

  it('ranks the brands of a single run instead of plotting a one-point line', () => {
    renderTrends(
      { data: selected, isError: false } as UseQueryResult<Visibility | null>,
      loaded([point('2026-11-03T00:00:00Z', 0.31)]),
    );
    const bars = within(screen.getByRole('list', { name: 'Visibility by brand' }));
    // Highest first, your brand marked, an unmeasured brand last and never zero.
    expect(bars.getAllByRole('meter').map((meter) => meter.getAttribute('aria-valuetext'))).toEqual(
      ['60%', '31%', 'Not measured'],
    );
    expect(bars.getByText('Acme · You')).toBeVisible();
    expect(screen.getByText(/^One run in this period .*after a second run\.$/u)).toBeVisible();
    expect(screen.queryByRole('group', { name: /over time/u })).toBeNull();
  });

  it('says a single pooled period holds several runs and needs a second period', () => {
    renderTrends(
      { data: selected, isError: false } as UseQueryResult<Visibility | null>,
      loaded([{ ...point('2026-11-03T00:00:00Z', 0.31), run_count: 3 }]),
    );
    expect(
      screen.getByText(/^One period with 3 runs .*A trend line appears with a second period\.$/u),
    ).toBeVisible();
    expect(screen.queryByText(/after a second run/u)).toBeNull();
  });

  it('keeps a focused brand the single point did not measure as a not-measured row', () => {
    const only = { ...point('2026-11-03T00:00:00Z', 0.31), rankings: [rankings[0]] };
    // The focused brand is read from the live address.
    window.history.replaceState(null, '', '/visibility?brand=Kmart+Australia');
    render(
      <VisibilityTrends
        query={loaded([only as VisibilityTrendPoint])}
        visibilityQuery={{ data: selected, isError: false } as UseQueryResult<Visibility | null>}
        engineFilter="all"
        surfaceRatesQuery={{ data: undefined } as unknown as UseQueryResult<SurfaceRates>}
        surfaceEngine={null}
        hasRuns
        isFiltered={false}
      />,
    );
    const bars = within(screen.getByRole('list', { name: 'Visibility by brand' }));
    expect(bars.getAllByRole('meter').map((meter) => meter.getAttribute('aria-valuetext'))).toEqual(
      ['Not measured'],
    );
    expect(bars.getByText('Kmart Australia')).toBeVisible();
  });

  it('keeps the line chart, each line named at its end, from the second run on', () => {
    const { container } = render(
      <VisibilityTrends
        query={loaded([point('2026-11-01T00:00:00Z', 0.25), point('2026-11-03T00:00:00Z', 0.31)])}
        visibilityQuery={{ data: selected, isError: false } as UseQueryResult<Visibility | null>}
        engineFilter="all"
        surfaceRatesQuery={{ data: undefined } as unknown as UseQueryResult<SurfaceRates>}
        surfaceEngine={null}
        hasRuns
        isFiltered={false}
      />,
    );
    expect(screen.getByRole('group', { name: /^Visibility over time/u })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Visibility by brand' })).toBeNull();
    expect(
      [...container.querySelectorAll('[data-line-labels] text')].map((label) => label.textContent),
    ).toEqual(expect.arrayContaining(['You', 'Kmart Australia']));
  });

  it('names the headline mean position apart from the table Rank', () => {
    renderTrends({ data: selected, isError: false } as UseQueryResult<Visibility | null>);
    expect(screen.getByText('Average position in answers')).toBeVisible();
    expect(screen.queryByText('Average position')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Rank' })).toBeVisible();
  });
});
