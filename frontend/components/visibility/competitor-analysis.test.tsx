import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { renderWithProviders as render } from '@/test/render';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const queryState = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('@/lib/api/source-pages', () => ({
  sourcePagesQueries: {
    competitorAnalysis: () => ({
      queryKey: ['source-pages', 'competitor-analysis', PROJECT],
      queryFn: async () => queryState.data,
    }),
    page: () => ({ queryKey: ['source-pages', 'page'], queryFn: async () => null }),
  },
  sourcePagesMutations: { inspect: () => ({ mutationFn: async () => null }) },
}));

import { CompetitorAnalysis } from './competitor-analysis';

/**
 * A fresh project has no audits, no citations and no inspected pages, so these
 * states are the first thing anyone sees.
 *
 * The one they must never collapse into each other: a source class whose pages
 * nobody has read is NOT a source class with no gaps. Reporting the first as
 * the second hands a customer a clean bill of health nobody earned.
 */
function analysis(overrides: Record<string, unknown> = {}) {
  return {
    pages_total: 0,
    pages_inspected: 0,
    pages_not_inspected: 0,
    gap_pages: 0,
    groups: [],
    limitations: [],
    truncated: false,
    ...overrides,
  };
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    source_class: 'community',
    pages_total: 3,
    pages_inspected: 0,
    pages_not_inspected: 3,
    pages_blocked: 0,
    gap_pages: 0,
    pages: [],
    truncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  queryState.data = null;
});

describe('the competitor analysis tab before anything has been inspected', () => {
  it('says there is nothing cited yet rather than showing an empty grid', async () => {
    queryState.data = analysis();

    render(<CompetitorAnalysis projectId={PROJECT} workspaceId={WORKSPACE} />);

    expect(await screen.findByText('No cited pages yet')).toBeVisible();
  });

  it('reports unread pages as unread, never as a class with no gaps', async () => {
    queryState.data = analysis({
      pages_total: 3,
      pages_not_inspected: 3,
      groups: [group()],
    });

    render(<CompetitorAnalysis projectId={PROJECT} workspaceId={WORKSPACE} />);

    expect(
      await screen.findByText('None of the cited pages have been inspected yet.'),
    ).toBeVisible();
    expect(
      screen.getByText(/None of these 3 cited pages have been inspected, so who appears/),
    ).toBeVisible();
    expect(screen.getByText('0 of 3 inspected')).toBeVisible();
  });

  it('distinguishes an inspected class with no gaps from an unread one', async () => {
    queryState.data = analysis({
      pages_total: 3,
      pages_inspected: 3,
      groups: [group({ pages_inspected: 3, pages_not_inspected: 0 })],
    });

    render(<CompetitorAnalysis projectId={PROJECT} workspaceId={WORKSPACE} />);

    expect(
      await screen.findByText('No inspected page has a competitor on it without you.'),
    ).toBeVisible();
    expect(
      screen.getByText(/No competitor appears without you across the 3 inspected/),
    ).toBeVisible();
  });
});
