import { screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { Visibility, VisibilityTrendPoint } from '@citeladder/contracts';
import { renderWithProviders as render } from '@/test/render';

import { BrandTrend, InsightsLede } from './visibility-trends';

const ranking = (name: string, mention: number | null, isBrand = false) => ({
  name,
  is_brand: isBrand,
  logo_url: null,
  website_url: null,
  mention_rate: mention,
  citation_rate: 0.1,
  share_of_voice: 0.2,
  mention_count: 3,
  avg_position: isBrand ? 2.46 : null,
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
    events: [],
  } as unknown as VisibilityTrendPoint;
}

const loaded = (points: VisibilityTrendPoint[]) =>
  ({ data: points, isError: false, isSuccess: true }) as unknown as UseQueryResult<
    VisibilityTrendPoint[]
  >;

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Insights lede', () => {
  it('heads with the rank and the brand ahead, and shows Position only when served', () => {
    const { unmount } = render(<InsightsLede selected={selected} />);
    expect(screen.getByRole('heading', { name: "You're #2 in AI visibility" })).toBeVisible();
    expect(screen.getByText('Kmart Australia is named more often.')).toBeVisible();
    expect(screen.getByText('Position')).toBeVisible();
    // The rank is a place; the position is an average and keeps its decimal.
    expect(screen.getByText('2.5')).toBeVisible();
    // No first-named data reads as not measured, never "unavailable".
    expect(screen.getByText('Not measured')).toBeVisible();
    unmount();

    const unpositioned = {
      ...selected,
      avg_position: null,
      rankings: rankings.map((row) => ({ ...row, avg_position: null })),
    } as Visibility;
    render(<InsightsLede selected={unpositioned} />);
    expect(screen.getByText('Share of voice')).toBeVisible();
    expect(screen.queryByText('Position')).toBeNull();
  });
});

describe('Your brand over time', () => {
  const twoRuns = loaded([
    point('2026-11-01T00:00:00Z', 0.25),
    point('2026-11-03T00:00:00Z', 0.31),
  ]);
  const lineNames = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-end-labels] text, ul[aria-hidden] li')].map(
      (label) => label.textContent ?? '',
    );

  it('plots a focused brand alone, and falls back to every brand for one this selection never measured', () => {
    window.history.replaceState(null, '', '/insights?brand=Kmart%20Australia');
    const focused = render(<BrandTrend query={twoRuns} selected={selected} />);
    expect(screen.getByRole('button', { name: /Focus.*Kmart Australia/ })).toBeVisible();
    expect(lineNames(focused.container).some((name) => name.startsWith('You'))).toBe(false);
    focused.unmount();

    // A brand carried in from another run's URL must not draw an empty chart
    // captioned with a brand this run never measured.
    window.history.replaceState(null, '', '/insights?brand=Ghost');
    const fallback = render(<BrandTrend query={twoRuns} selected={selected} />);
    const roster = lineNames(fallback.container);
    expect(screen.getByRole('button', { name: /Focus.*All brands/ })).toBeVisible();
    expect(roster.some((name) => name.startsWith('You'))).toBe(true);
    expect(roster.some((name) => name.startsWith('Kmart Australia'))).toBe(true);
  });
});
