import { screen, within } from '@testing-library/react';
import { expect, it, onTestFinished } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import { OverviewFigures } from './overview-signals';

const projectId = '88888888-8888-4888-8888-888888888888';
const crawl = {
  unit: 'requests' as const,
  identity_level: 'path' as const,
  connection: 'connected' as const,
  coverage: 'partial' as const,
  reporting_timezone: 'UTC',
  last_processed_at: null,
  requests: null,
  pages: null,
  active_bots: null,
  error_share: null,
  failed_verification_requests: null,
  series: [],
};
const referrals = {
  project_id: projectId,
  window_start: null,
  window_end: null,
  granularity: 'day' as const,
  referral_volume: [],
  referral_share: [],
  sources: [],
  analyzer_version: '1',
  formula_version: '1',
  scope: 'property-wide' as const,
  reporting_timezone: null,
  currency_code: null,
  analytics_quality: {},
  unattributed_landing: null,
  source_measures: [],
  channel_comparison: [],
  landing_pages: [],
};
const citations = {
  unit: 'tracked_citations' as const,
  state: 'measured' as const,
  count: 7,
  label: 'Tracked answers',
  sources: [{ audit_id: '99999999-9999-4999-8999-999999999999', analyzer_version: '1' }],
};
type Overview = React.ComponentProps<typeof OverviewFigures>['data'];

type Ga4Step = React.ComponentProps<typeof OverviewFigures>['ga4'];
const ga4Connection = {
  id: '77777777-7777-4777-8777-777777777777',
  workspace_id: '66666666-6666-4666-8666-666666666666',
  grant_id: '55555555-5555-4555-8555-555555555555',
  provider: 'ga4' as const,
  label: '',
  account_ref: '',
  grant_status: 'connected' as const,
  granted_scopes: [],
  last_synced_at: null,
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
};

function figures(
  overrides: Partial<Overview>,
  crawlAvailable = true,
  ga4: Ga4Step = { kind: 'connect' },
) {
  return (
    <OverviewFigures
      projectId={projectId}
      crawlAvailable={crawlAvailable}
      ga4={ga4}
      data={{ crawl, referrals, citations, ...overrides }}
    />
  );
}
/** The figure cell a label names: its label, value, basis and action. */
const figure = (label: string) =>
  screen.getByText(label).closest('[data-figure-cell]') as HTMLElement;

it('keeps unavailable, missing, awaiting, incomplete and measured zero distinct', () => {
  const view = renderWithProviders(
    figures({ crawl: { ...crawl, connection: 'not_connected' } }, false),
  );
  expect(screen.getByText(/not available for this workspace yet/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Connect crawl logs' })).not.toBeInTheDocument();
  view.rerender(figures({ crawl: { ...crawl, connection: 'not_connected' } }));
  expect(screen.getByRole('button', { name: 'Connect crawl logs' })).toBeEnabled();
  view.rerender(figures({ crawl: { ...crawl, connection: 'awaiting_data' } }));
  expect(screen.getByText(/Awaiting the first accepted batch/)).toBeVisible();
  view.rerender(figures({ crawl }));
  expect(screen.getByText(/No matching requests were observed/)).toBeVisible();
  expect(within(figure('Recognized automated requests')).queryByText('0')).not.toBeInTheDocument();
  view.rerender(
    figures({ crawl: { ...crawl, coverage: 'complete', requests: 0, pages: 0, active_bots: 0 } }),
  );
  expect(within(figure('Recognized automated requests')).getByText('0')).toBeVisible();
  expect(within(figure('Path-level pages')).getByText('0')).toBeVisible();
  expect(screen.queryByText(/No matching requests were observed/)).not.toBeInTheDocument();
});

it('keeps failed verification requests and unavailable active bots visible', () => {
  const view = renderWithProviders(
    figures({ crawl: { ...crawl, failed_verification_requests: 3 } }),
  );
  expect(
    within(figure('Recognized automated requests')).getByText(
      'No matching requests were observed in the available logs. Coverage is incomplete. 3 failed verification requests are shown separately.',
    ),
  ).toBeVisible();
  view.rerender(figures({ crawl: { ...crawl, requests: 12, pages: 4, active_bots: null } }));
  expect(within(figure('Path-level pages')).getByText('Active bots unavailable')).toBeVisible();
  view.rerender(figures({ crawl: { ...crawl, requests: 12, pages: 4, active_bots: 2 } }));
  expect(within(figure('Path-level pages')).getByText('Requested by 2 active bots')).toBeVisible();
});

it('shows a measured zero as 0 and a window with no completed run as not available yet', () => {
  const { unmount } = renderWithProviders(figures({ citations: { ...citations, count: 0 } }));
  expect(within(figure('Tracked citations')).getByText('0')).toBeVisible();
  expect(
    within(figure('Tracked citations')).queryByText(/not available yet/i),
  ).not.toBeInTheDocument();
  unmount();

  renderWithProviders(
    figures({
      citations: {
        unit: 'tracked_citations',
        state: 'not_available',
        reason: 'no_completed_run',
        count: null,
        label: 'Tracked answers',
      },
    }),
  );
  const cell = within(figure('Tracked citations'));
  expect(cell.getByText(/No AI Visibility run completed in this window\./)).toBeVisible();
  expect(cell.getByText(/not available yet/i)).toBeVisible();
  expect(cell.queryByText('0')).not.toBeInTheDocument();
});

it('offers GA4\'s own next step until a referral snapshot exists, then says it synced', () => {
  const view = renderWithProviders(figures({}));
  expect(within(figure('AI referral sessions, latest day')).getByText('Not synced')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Connect GA4' })).toBeVisible();
  expect(screen.queryByText(/GA4 · Synced/)).not.toBeInTheDocument();

  // A connected GA4 with no snapshot yet is never told to connect, nor is an unknown one.
  view.rerender(figures({}, true, { kind: 'choose', connection: ga4Connection }));
  expect(screen.getByRole('link', { name: 'Choose GA4 property' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Connect GA4' })).not.toBeInTheDocument();
  view.rerender(figures({}, true, null));
  expect(screen.getByText('Referral sessions appear once GA4 imports a report.')).toBeVisible();
  expect(screen.queryByRole('link', { name: /GA4/ })).not.toBeInTheDocument();

  // The report day keeps its calendar date in a display zone west of UTC.
  document.cookie = 'citeladder-display-timezone=America%2FNew_York; path=/';
  onTestFinished(() => {
    document.cookie = 'citeladder-display-timezone=; path=/; max-age=0';
  });
  view.rerender(
    figures({
      referrals: {
        ...referrals,
        window_start: '2026-07-20',
        window_end: '2026-07-22',
        referral_volume: [{ date: '2026-07-22', value: 0 }],
        referral_share: [{ date: '2026-07-22', value: 0 }],
      },
    }),
  );
  const cell = within(figure('AI referral sessions, latest day'));
  expect(cell.getByText(/GA4 · Synced/)).toBeVisible();
  expect(cell.getByText('0')).toBeVisible();
  expect(cell.getByText('Jul 22, 2026')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Connect GA4' })).not.toBeInTheDocument();
});
