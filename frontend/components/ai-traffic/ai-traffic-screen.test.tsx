import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';
import { AiTrafficScreen, CrawlSignalPanel } from './ai-traffic-screen';
const project = makeProject({
  id: '88888888-8888-4888-8888-888888888888',
  workspace_id: '11111111-1111-4111-8111-111111111111',
});
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: project, isLoading: false }),
  useWorkspaceCapability: () => true,
  useActiveWorkspaceId: () => project.workspace_id,
}));
const root = '/api/v1/projects/' + project.id;
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
  failed_verification_requests: 0,
  series: [],
};
const referrals = {
  project_id: project.id,
  window_start: '',
  window_end: '',
  granularity: 'day',
  referral_volume: [],
  referral_share: [],
  sources: [],
  analyzer_version: '1',
  formula_version: '1',
};
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  window.history.replaceState(null, '', '/ai-traffic');
});
afterAll(() => mswServer.close());
describe('AI Traffic state and navigation', () => {
  it('keeps missing, awaiting, incomplete and measured zero distinct', () => {
    const view = renderWithProviders(
      <CrawlSignalPanel data={{ ...crawl, connection: 'not_connected' }} />,
    );
    expect(screen.getByRole('button', { name: 'Connect crawl logs' })).toBeEnabled();
    view.rerender(<CrawlSignalPanel data={{ ...crawl, connection: 'awaiting_data' }} />);
    expect(screen.getByText(/Awaiting the first accepted batch/)).toBeVisible();
    view.rerender(<CrawlSignalPanel data={crawl} />);
    expect(screen.getByText(/No matching requests were observed/)).toBeVisible();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    view.rerender(
      <CrawlSignalPanel
        data={{ ...crawl, coverage: 'complete', requests: 0, pages: 0, active_bots: 0 }}
      />,
    );
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.queryByText(/No matching requests were observed/)).not.toBeInTheDocument();
  });
  it('persists tab selection, renders accessible activity and exports the selected filters', async () => {
    let exportStatus: string | null = null;
    mswServer.use(
      http.get(root + '/ai-traffic/overview', () =>
        HttpResponse.json({
          crawl,
          referrals,
          citations: { unit: 'tracked_citations', count: null, label: 'Tracked answers' },
        }),
      ),
      http.get(root + '/crawl-logs/sources', () =>
        HttpResponse.json({ ingestion_enabled: false, items: [] }),
      ),
      http.get(root + '/ai-traffic/coverage', () =>
        HttpResponse.json({ sources: [], items: [], next_cursor: null }),
      ),
      http.get(root + '/crawl-logs/catalog', () =>
        HttpResponse.json({
          catalog_version: '1',
          bots: [],
          presets: {},
          max_batch_bytes: 2000,
          max_line_bytes: 1000,
          max_lines_per_batch: 10,
          upload_sample_lines: 50,
          worker_timeout_ms: 5000,
        }),
      ),
      http.get(root + '/ai-traffic/activity', () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
      http.get(root + '/ai-traffic/activity/export', ({ request }) => {
        exportStatus = new URL(request.url).searchParams.get('status');
        return new HttpResponse('path,status\n/page,404', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
      http.get(root + '/ai-traffic/referrals', () => HttpResponse.json(referrals)),
    );
    renderWithProviders(<AiTrafficScreen />);
    await screen.findByText(/No matching requests were observed/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('activity');
    expect(
      await screen.findByRole('table', { name: 'Retained automated request activity' }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Response status' }), {
      target: { value: '404' },
    });
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportStatus).toBe('404'));
    await user.click(screen.getByRole('tab', { name: 'Referrals' }));
    expect(await screen.findByText('No AI-referral data yet')).toBeVisible();
    expect(screen.getByLabelText('Chart interval')).toBeVisible();
  });
});
